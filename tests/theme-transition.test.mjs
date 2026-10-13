import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function setup({ supported = true, reduced = false, readyFails = false, animateFails = false } = {}) {
  const animations = [];
  const transitions = [];
  const listeners = new Set();
  const media = {
    matches: reduced,
    addEventListener: (_, callback) => listeners.add(callback),
    removeEventListener: (_, callback) => listeners.delete(callback),
  };
  const root = {
    dataset: {},
    animate(frames, options) {
      if (animateFails) throw Error('Animation unavailable');
      animations.push({ frames, options });
    },
  };
  const document = {
    documentElement: root,
    visibilityState: 'visible',
    startViewTransition: supported ? update => {
      let finish;
      let skipped = false;
      const finished = new Promise(resolve => { finish = resolve; });
      const updateCallbackDone = Promise.resolve().then(update);
      const ready = updateCallbackDone.then(() => {
        if (readyFails || skipped) throw Error('Transition skipped');
      });
      const transition = { ready, finished, updateCallbackDone, finish,
        skipTransition() { skipped = true; finish(); },
        get skipped() { return skipped; },
      };
      transitions.push(transition);
      return transition;
    } : undefined,
  };
  const api = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/theme-transition.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: api, document, window: { innerWidth: 800, innerHeight: 600, matchMedia: () => media } });
  const button = { getBoundingClientRect: () => ({ left: 40, top: 50, width: 120, height: 48 }) };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { api, root, document, button, media, animations, transitions, listeners, flush };
}

test('theme reveal starts at the button center and covers the viewport in either direction', async () => {
  const h = setup();
  let theme = 'light';
  for (const next of ['dark', 'light']) {
    const pending = h.api.runThemeTransition(() => { theme = next; }, h.button);
    await h.flush();
    assert.equal(theme, next);
    const { frames, options } = h.animations.at(-1);
    assert.equal(frames.clipPath[0], 'circle(0px at 100px 74px)');
    const radius = Number(frames.clipPath[1].match(/circle\(([\d.]+)px/)[1]);
    assert.ok(radius >= 875.6 && radius < 876, 'reveal must reach the farthest viewport corner');
    assert.equal(options.pseudoElement, '::view-transition-new(root)');
    assert.equal(options.duration, 450);
    assert.equal(h.root.dataset.themeTransition, 'true');
    h.transitions.at(-1).finish();
    await pending;
    assert.equal(h.root.dataset.themeTransition, undefined);
    assert.equal(h.listeners.size, 0);
  }
});

test('unsupported browsers, reduced motion and hidden tabs apply immediately', async () => {
  for (const options of [{ supported: false }, { reduced: true }, { hidden: true }]) {
    const h = setup(options);
    if (options.hidden) h.document.visibilityState = 'hidden';
    let updates = 0;
    const pending = h.api.runThemeTransition(() => updates++, h.button);
    assert.equal(updates, 1);
    await pending;
    assert.equal(h.transitions.length, 0);
    assert.equal(h.animations.length, 0);
    assert.equal(h.root.dataset.themeTransition, undefined);
  }
});

test('rapid selections skip obsolete work and leave the last requested theme visible', async () => {
  const h = setup();
  const updates = [];
  const first = h.api.runThemeTransition(() => updates.push('dark'), h.button);
  const second = h.api.runThemeTransition(() => updates.push('light'), h.button);
  const last = h.api.runThemeTransition(() => updates.push('dark'), h.button);
  await h.flush();
  assert.equal(h.transitions[0].skipped, true);
  assert.deepEqual(updates, ['dark']);
  assert.equal(h.animations.length, 1);
  h.transitions.at(-1).finish();
  await Promise.all([first, second, last]);
  assert.equal(h.root.dataset.themeTransition, undefined);
  assert.equal(h.listeners.size, 0);
});

test('skipped snapshots and failed animation still update once and clean up', async () => {
  for (const options of [{ readyFails: true }, { animateFails: true }]) {
    const h = setup(options);
    let updates = 0;
    await h.api.runThemeTransition(() => updates++, h.button);
    assert.equal(updates, 1);
    assert.equal(h.root.dataset.themeTransition, undefined);
    assert.equal(h.listeners.size, 0);
  }
});

test('enabling reduced motion during a reveal stops it without reverting the theme', async () => {
  const h = setup();
  let theme = 'light';
  const pending = h.api.runThemeTransition(() => { theme = 'dark'; }, h.button);
  await h.flush();
  h.media.matches = true;
  for (const listener of h.listeners) listener(h.media);
  await pending;
  assert.equal(h.transitions[0].skipped, true);
  assert.equal(theme, 'dark');
  assert.equal(h.root.dataset.themeTransition, undefined);
  assert.equal(h.listeners.size, 0);
});
