import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/home/useHomeGardenMotion.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ reduced = false, observer = true } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  window.innerWidth = 1400;
  window.innerHeight = 900;
  const media = new EventTarget();
  media.matches = reduced;
  window.matchMedia = () => media;
  const element = (dataset = {}) => {
    const node = new EventTarget();
    node.dataset = dataset;
    node.values = new Map();
    node.style = { setProperty: (name, value) => node.values.set(name, value), removeProperty: name => node.values.delete(name) };
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
    return node;
  };
  const layers = [element({ gardenDepth: '100', gardenPointer: '10' }), element({ gardenDepth: '-180', gardenPointer: '24' })];
  const reveals = [element(), element()];
  const stage = element();
  const hero = element();
  hero.querySelectorAll = () => layers;
  const root = element();
  root.querySelector = () => hero;
  root.querySelectorAll = selector => selector === '[data-garden-reveal]' ? reveals : [stage];
  const subscriptions = [];
  const observers = [];
  if (observer) window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
  };
  let cleanup;
  const exports = {};
  vm.runInNewContext(code, { exports, window, document, require: name => {
    if (name === 'react') return { useRef: () => ({ current: root }), useEffect: callback => { cleanup = callback(); } };
    assert.equal(name, 'motion');
    return { scroll: callback => { const sub = { callback, stopped: false }; subscriptions.push(sub); return () => { sub.stopped = true; }; } };
  } });
  assert.equal(typeof exports.default, 'function', 'The homepage motion controller must exist');
  exports.default();
  const event = (target, type, props = {}) => { const e = new Event(type); Object.assign(e, props); target.dispatchEvent(e); };
  return { root, layers, reveals, stage, observers, subscriptions,
    scroll: progress => subscriptions.findLast(s => !s.stopped)?.callback(progress),
    move: (x, y, pointerType = 'mouse') => event(hero, 'pointermove', { clientX: x, clientY: y, pointerType }),
    leave: () => event(hero, 'pointerleave'),
    reduce: value => { media.matches = value; event(media, 'change'); },
    hide: value => { document.hidden = value; event(document, 'visibilitychange'); },
    cleanup: () => cleanup?.(),
  };
}

test('scroll depth separates botanical layers and clamps overscroll', () => {
  const app = harness();
  app.scroll(0.5);
  assert.equal(app.layers[0].values.get('--garden-scroll-y'), '50px');
  assert.equal(app.layers[1].values.get('--garden-scroll-y'), '-90px');
  app.scroll(2);
  assert.equal(app.layers[1].values.get('--garden-scroll-y'), '-180px');
  app.cleanup();
});

test('pointer input tilts the outer stage, stays bounded, and resets on leave', () => {
  const app = harness();
  app.move(10000, 10000, 'touch');
  assert.equal(app.stage.values.size, 0);
  app.move(10000, 10000);
  assert.equal(app.stage.values.get('--garden-tilt-y'), '4deg');
  assert.equal(app.stage.values.get('--garden-tilt-x'), '-3deg');
  assert.equal(app.layers[1].values.get('--garden-pointer-x'), '24px');
  app.leave();
  assert.equal(app.stage.values.size, 0);
  app.cleanup();
});

test('reduced motion reveals all content and stops motion, including preference changes', () => {
  const app = harness({ reduced: true });
  assert.equal(app.subscriptions.length, 0);
  assert.equal(app.root.dataset.gardenMotion, undefined);
  app.reduce(false);
  app.scroll(0.5);
  app.move(1000, 600);
  app.reduce(true);
  assert.ok(app.subscriptions.every(s => s.stopped));
  assert.equal(app.layers[0].values.size, 0);
  assert.equal(app.stage.values.size, 0);
  assert.equal(app.root.dataset.gardenMotion, undefined);
  app.cleanup();
});

test('reveals remain visible after activation and unsupported observers never hide content', () => {
  const app = harness();
  const observer = app.observers[0];
  observer.callback([{ target: app.reveals[0], isIntersecting: true }]);
  assert.equal(app.reveals[0].dataset.gardenVisible, 'true');
  assert.equal(observer.targets.has(app.reveals[0]), false);
  app.cleanup();
  const fallback = harness({ observer: false });
  assert.equal(fallback.root.dataset.gardenMotion, undefined);
  fallback.cleanup();
});

test('hidden tabs and cleanup stop subscriptions and ignore late callbacks', () => {
  const app = harness();
  const late = app.subscriptions[0].callback;
  app.hide(true);
  late(0.5);
  assert.equal(app.layers[0].values.size, 0);
  app.hide(false);
  app.scroll(0.5);
  assert.equal(app.layers[0].values.get('--garden-scroll-y'), '50px');
  app.cleanup();
  app.move(1000, 600);
  app.reduce(false);
  late(1);
  assert.ok(app.subscriptions.every(s => s.stopped));
  assert.equal(app.layers[0].values.size, 0);
});
