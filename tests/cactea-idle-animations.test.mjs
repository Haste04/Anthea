import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/components/cactea/useCacteaIdleAnimations.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ enabled = true, reduced = false, hidden = false } = {}) {
  const document = new EventTarget();
  document.hidden = hidden;
  const media = new EventTarget();
  media.matches = reduced;
  const timers = new Map();
  const calls = [];
  let nextId = 0;
  let random = 0;
  let cleanup;
  let refs = 0;
  const window = {
    matchMedia: () => media,
    setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout: id => timers.delete(id),
  };
  function target(name) {
    return { animate: (frames, options) => {
      const animation = { onfinish: null, cancelled: false, cancel() { this.cancelled = true; } };
      calls.push({ name, frames, options, animation });
      return animation;
    } };
  }
  const bounce = target('bounce');
  const mouth = target('mouth');
  const root = {
    firstElementChild: bounce,
    querySelector: selector => selector === '[data-cactea-mouth] > img' ? mouth : null,
    getBoundingClientRect: () => ({ width: 320 }),
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, window, document,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    require: name => {
      assert.equal(name, 'react');
      return {
        useRef: initial => ({ current: refs++ === 0 ? root : initial }),
        useEffect: callback => { cleanup = callback(); },
      };
    },
  });
  assert.equal(typeof exports.default, 'function', 'The idle animation controller must exist');
  const controller = exports.default(enabled);
  function event(target, type) { target.dispatchEvent(new Event(type)); }
  return {
    calls, timers, jump: controller.jump,
    finish: call => call.animation.onfinish?.(),
    next: () => {
      const [id, timer] = [...timers.entries()][0];
      timers.delete(id);
      timer.callback();
    },
    delay: () => [...timers.values()][0]?.delay,
    random: value => { random = value; },
    hide: value => { document.hidden = value; event(document, 'visibilitychange'); },
    reduce: value => { media.matches = value; event(media, 'change'); },
    cleanup: () => cleanup?.(),
  };
}

test('idle jumps and smiles are spaced apart with fresh randomized delays', () => {
  const app = harness();
  assert.equal(app.calls.length, 0);
  assert.ok(app.delay() >= 15000 && app.delay() <= 25000);
  app.next();
  const jump = app.calls[0];
  assert.equal(jump.name, 'bounce');
  assert.equal(jump.options.duration, 700);
  assert.match(jump.frames[2].transform, /translateY\(-8px\)/);
  assert.match(jump.frames[1].transform, /scale/);
  assert.equal(app.timers.size, 0);
  app.random(0.75);
  app.finish(jump);
  assert.equal(app.timers.size, 1);
  const smileDelay = app.delay();
  assert.ok(smileDelay >= 8000 && smileDelay <= 14000);
  app.next();
  const smile = app.calls[1];
  assert.equal(smile.name, 'mouth');
  assert.ok(smile.options.duration >= 1500);
  assert.equal(smile.frames[0].transform, smile.frames.at(-1).transform);
  assert.match(smile.frames[1].transform, /scale/);
  assert.equal(app.timers.size, 0);
  app.finish(smile);
  assert.ok(app.delay() > 15000 && app.delay() < 25000);
  app.cleanup();
});

test('click jumps immediately; repeated clicks never stack or restart a jump', () => {
  const app = harness();
  app.jump();
  assert.equal(app.calls.length, 1);
  assert.equal(app.timers.size, 0);
  for (let i = 0; i < 20; i++) app.jump();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].animation.cancelled, false);
  app.finish(app.calls[0]);
  assert.equal(app.timers.size, 1);
  app.jump();
  assert.equal(app.calls.length, 2);
  assert.equal(app.timers.size, 0);
  app.cleanup();
});

test('clicking during a smile leaves its smooth return intact and defers the next idle action', () => {
  const app = harness();
  app.next();
  app.finish(app.calls[0]);
  app.next();
  const smile = app.calls[1];
  app.jump();
  const jump = app.calls[2];
  assert.equal(jump.name, 'bounce');
  assert.equal(smile.animation.cancelled, false);
  app.finish(jump);
  assert.equal(app.timers.size, 0);
  app.finish(smile);
  assert.equal(app.timers.size, 1);
  app.cleanup();
});

test('hidden tabs cancel work and resume with a delay; late callbacks cannot revive unmounted work', () => {
  const app = harness();
  const lateTimer = [...app.timers.values()][0].callback;
  app.jump();
  const jump = app.calls[0];
  const lateFinish = jump.animation.onfinish;
  app.hide(true);
  assert.equal(jump.animation.cancelled, true);
  assert.equal(app.timers.size, 0);
  app.jump();
  assert.equal(app.calls.length, 1);
  app.hide(false);
  assert.equal(app.timers.size, 1);
  assert.equal(app.calls.length, 1);
  app.cleanup();
  lateTimer();
  lateFinish();
  app.jump();
  app.hide(false);
  app.reduce(false);
  assert.equal(app.timers.size, 0);
  assert.equal(app.calls.length, 1);
});

test('reduced motion suppresses idle gestures and gives only brief click feedback', () => {
  const app = harness({ reduced: true });
  assert.equal(app.timers.size, 0);
  app.jump();
  assert.equal(app.calls.length, 1);
  assert.ok(app.calls[0].frames.every(frame => frame.transform === undefined));
  app.finish(app.calls[0]);
  assert.equal(app.timers.size, 0);
  app.reduce(false);
  assert.equal(app.timers.size, 1);
  app.next();
  app.reduce(true);
  assert.equal(app.calls[1].animation.cancelled, true);
  assert.equal(app.timers.size, 0);
  app.cleanup();
});

test('disabled and initially hidden mascots do not animate or schedule idle work', () => {
  for (const options of [{ enabled: false }, { hidden: true }]) {
    const app = harness(options);
    app.jump();
    assert.equal(app.calls.length, 0);
    assert.equal(app.timers.size, 0);
    app.cleanup();
  }
});
