import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/components/landing/useLandingMotion.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function element(dataset = {}, top = 1000) {
  const properties = new Map();
  return {
    dataset, properties,
    style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
    getBoundingClientRect: () => ({ top }),
  };
}

function harness({ reduced = false, hidden = false, sticky = false } = {}) {
  const window = new EventTarget();
  window.innerHeight = 800;
  const document = new EventTarget();
  document.hidden = hidden;
  const media = new EventTarget();
  media.matches = reduced;
  window.matchMedia = () => media;
  const background = element({ parallaxY: '100' });
  const foreground = element({ parallaxY: '-60', parallaxX: '120', parallaxScale: '0.2', parallaxRotate: '4' });
  const photo = element({ parallaxY: '32' });
  const reveals = [element({}, 100), element({}, 1200)];
  const hero = element({ scrollSection: 'hero' });
  const topics = element({ scrollSection: 'topics' });
  const conversation = element({ scrollSection: 'conversation' });
  if (sticky) conversation.dataset.stickyStory = '';
  const storySteps = [0, 1, 2].map(index => element({ storyStep: String(index) }));
  hero.querySelectorAll = () => [background, foreground];
  topics.querySelectorAll = () => [photo];
  conversation.querySelectorAll = selector => selector === '[data-story-step]' ? storySteps : [];
  const root = new EventTarget();
  root.dataset = {};
  root.querySelectorAll = selector => selector === '[data-scroll-section]' ? [hero, topics, conversation] : reveals;
  const subscriptions = [];
  const observers = [];
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
  };
  let cleanup;
  let setup;
  const exports = {};
  vm.runInNewContext(code, {
    exports, window, document,
    require: name => {
      if (name === 'react') return { useRef: () => ({ current: root }), useEffect: callback => { setup = callback; cleanup = callback(); } };
      assert.equal(name, 'motion');
      return { scroll: (callback, options) => {
        const subscription = { callback, options, stopped: false };
        subscriptions.push(subscription);
        return () => { subscription.stopped = true; };
      } };
    },
  });
  assert.equal(typeof exports.default, 'function', 'The landing motion controller must exist');
  exports.default();
  const event = (target, type) => target.dispatchEvent(new Event(type));
  return {
    root, background, foreground, photo, storySteps, reveals, conversation, observers, subscriptions,
    scroll: (section, progress) => subscriptions.findLast(s => s.options.target === section && !s.stopped)?.callback(progress),
    hero, topics,
    reduce: value => { media.matches = value; event(media, 'change'); },
    hide: value => { document.hidden = value; event(document, 'visibilitychange'); },
    replayEffect: () => { cleanup?.(); cleanup = setup(); },
    cleanup: () => cleanup?.(),
  };
}

test('scrolling separates foreground and background depth while bounding photo travel', () => {
  const app = harness();
  app.scroll(app.hero, 0.5);
  assert.equal(app.background.properties.get('--parallax-y'), '50px');
  assert.equal(app.foreground.properties.get('--parallax-y'), '-30px');
  assert.equal(app.foreground.properties.get('--parallax-rotate'), '2deg');
  app.scroll(app.topics, 0);
  assert.equal(app.photo.properties.get('--parallax-y'), '-16px');
  app.scroll(app.topics, 1);
  assert.equal(app.photo.properties.get('--parallax-y'), '16px');
  app.cleanup();
});

test('scrolling moves a foreground object horizontally and changes its scale independently', () => {
  const app = harness();
  app.scroll(app.hero, 0.5);
  assert.equal(app.foreground.properties.get('--parallax-x'), '60px');
  assert.equal(app.foreground.properties.get('--parallax-scale'), '0.1');
  app.cleanup();
  assert.equal(app.foreground.properties.has('--parallax-x'), false);
  assert.equal(app.foreground.properties.has('--parallax-scale'), false);
});

test('pinned storytelling shows Ask, Speak, and Hear at successive scroll positions', () => {
  const app = harness({ sticky: true });
  const subscription = app.subscriptions.find(subscription => subscription.options.target === app.conversation);
  assert.deepEqual(Array.from(subscription.options.offset), ['start start', 'end end']);
  for (const [progress, visible] of [[0, 0], [0.45, 1], [1, 2]]) {
    app.scroll(app.conversation, progress);
    app.storySteps.forEach((step, index) => assert.equal(step.properties.get('--scene-opacity'), index === visible ? '1' : '0'));
  }
  app.reduce(true);
  assert.ok(app.storySteps.every(step => !step.properties.has('--scene-opacity')), 'Reduced motion restores all three static steps');
  app.cleanup();
});

test('only one instruction is visible while illustrations crossfade between acts', () => {
  const app = harness({ sticky: true });
  for (const progress of [0.3, 0.317, 0.333, 0.35, 0.65, 0.667]) {
    app.scroll(app.conversation, progress);
    const visible = app.storySteps.filter(step => step.properties.get('--copy-opacity') === '1');
    assert.equal(visible.length, 1, `Exactly one readable instruction at ${progress}`);
  }
  app.cleanup();
});

test('reveals preserve visible content and release their observer after entering', () => {
  const app = harness();
  assert.equal(app.reveals[0].dataset.revealed, 'true');
  assert.equal(app.reveals[1].dataset.revealed, 'false');
  const observer = app.observers[0];
  observer.callback([{ target: app.reveals[1], isIntersecting: true }]);
  assert.equal(app.reveals[1].dataset.revealed, 'true');
  assert.equal(observer.targets.has(app.reveals[1]), false);
  app.cleanup();
});

test('development effect replay keeps unseen sections eligible for their entrance animation', () => {
  const app = harness();
  const staleObserver = app.observers[0];
  app.replayEffect();
  assert.equal(app.reveals[0].dataset.revealed, 'true');
  assert.equal(app.reveals[1].dataset.revealed, 'false');
  assert.equal(app.subscriptions.filter(subscription => !subscription.stopped).length, 3);
  staleObserver.callback([{ target: app.reveals[1], isIntersecting: true }]);
  assert.equal(app.reveals[1].dataset.revealed, 'false', 'The disposed effect cannot reveal an unseen card');
  app.observers.at(-1).callback([{ target: app.reveals[1], isIntersecting: true }]);
  assert.equal(app.reveals[1].dataset.revealed, 'true');
  app.replayEffect();
  assert.equal(app.reveals[1].dataset.revealed, 'true', 'A completed entrance should not repeat');
  app.cleanup();
});

test('story progress stays bounded when scroll exceeds the pinned range', () => {
  const app = harness({ sticky: true });
  app.scroll(app.conversation, -0.5);
  assert.equal(app.conversation.properties.get('--story-progress'), '0');
  assert.equal(app.conversation.dataset.activeStep, '0');
  app.scroll(app.conversation, 1.5);
  assert.equal(app.conversation.properties.get('--story-progress'), '1');
  assert.equal(app.conversation.dataset.activeStep, '2');
  app.cleanup();
});

test('reduced motion disables subscriptions at load and on live preference changes', () => {
  const staticPage = harness({ reduced: true });
  assert.equal(staticPage.subscriptions.length, 0);
  assert.ok(staticPage.reveals.every(reveal => reveal.dataset.revealed !== 'false'));
  staticPage.cleanup();
  const app = harness();
  app.scroll(app.hero, 0.5);
  app.reduce(true);
  assert.ok(app.subscriptions.every(subscription => subscription.stopped));
  assert.equal(app.background.properties.has('--parallax-y'), false);
  assert.ok(app.reveals.every(reveal => reveal.dataset.revealed !== 'false'));
  app.reduce(false);
  assert.ok(app.subscriptions.some(subscription => !subscription.stopped));
  app.cleanup();
});

test('hidden tabs and unmount stop work and ignore late scroll or reveal callbacks', () => {
  const app = harness();
  const lateScroll = app.subscriptions[0].callback;
  const lateReveal = app.observers[0].callback;
  app.hide(true);
  assert.ok(app.subscriptions.every(subscription => subscription.stopped));
  lateScroll(0.8);
  assert.equal(app.background.properties.has('--parallax-y'), false);
  app.hide(false);
  assert.ok(app.subscriptions.some(subscription => !subscription.stopped));
  app.cleanup();
  lateScroll(0.8);
  lateReveal([{ target: app.reveals[1], isIntersecting: true }]);
  app.reduce(false);
  assert.ok(app.subscriptions.every(subscription => subscription.stopped));
  assert.equal(app.background.properties.has('--parallax-y'), false);
});

test('hiding a tab freezes the pinned composition without changing its layout', () => {
  const app = harness({ sticky: true });
  app.scroll(app.hero, 0.5);
  app.scroll(app.conversation, 0.45);
  app.hide(true);
  assert.ok(app.subscriptions.every(subscription => subscription.stopped));
  assert.equal(app.root.dataset.motion, 'on', 'Keep the sticky layout while hidden');
  assert.equal(app.conversation.dataset.activeStep, '1');
  assert.equal(app.foreground.properties.get('--parallax-y'), '-30px');
  app.reduce(true);
  assert.equal(app.root.dataset.motion, undefined, 'Reduced motion still restores the static layout');
  assert.equal(app.foreground.properties.has('--parallax-y'), false);
  app.cleanup();
});
