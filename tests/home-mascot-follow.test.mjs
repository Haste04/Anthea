import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/components/workspace/useHomeMascotFollow.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ reduced = false, edge = false } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  document.documentElement = new EventTarget();
  document.hidden = false;
  window.innerWidth = 1200;
  window.innerHeight = 800;
  const media = new EventTarget();
  media.matches = reduced;
  window.matchMedia = () => media;
  const frames = new Map();
  const styles = new Map();
  let nextId = 0;
  let time = 0;
  let reads = 0;
  let cleanup;
  let base = { left: 650, right: edge ? 899 : 850, top: 200, bottom: 400 };
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const position = () => ({ x: parseFloat(styles.get('--home-eye-x') || '0'), y: parseFloat(styles.get('--home-eye-y') || '0') });
  const mascot = {
    querySelectorAll: () => [mascot, mascot],
    style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) },
    getBoundingClientRect() {
      reads++;
      return { ...base };
    },
  };
  const hero = { querySelector: () => mascot, getBoundingClientRect: () => ({ left: 100, right: 900, top: 100, bottom: 500 }) };
  const exports = {};
  vm.runInNewContext(code, { exports, window, document, require: name => {
    assert.equal(name, 'react');
    return { useRef: () => ({ current: hero }), useEffect: callback => { cleanup = callback(); } };
  } });
  assert.equal(typeof exports.default, 'function', 'Home cursor-follow hook must exist');
  exports.default();
  function event(target, type, props = {}) {
    const message = new Event(type);
    Object.assign(message, props);
    target.dispatchEvent(message);
  }
  function step() {
    time += 16;
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach(callback => callback(time));
  }
  return {
    frames, position, styles, reads: () => reads,
    move: (x, y, pointerType = 'mouse') => event(window, 'pointermove', { clientX: x, clientY: y, pointerType }),
    step, settle: () => { for (let i = 0; i < 180 && frames.size; i++) step(); },
    leave: () => event(document.documentElement, 'pointerleave'),
    blur: () => event(window, 'blur'),
    out: relatedTarget => event(window, 'pointerout', { relatedTarget }),
    reduce: value => { media.matches = value; event(media, 'change'); },
    hide: value => { document.hidden = value; event(document, 'visibilitychange'); },
    resize: value => { base = value; event(window, 'resize'); },
    cleanup: () => cleanup(),
  };
}

test('mouse tracking eases toward a bounded offset using one frame loop and no continuous layout reads', () => {
  const app = harness();
  assert.equal(app.frames.size, 0);
  for (let i = 0; i < 30; i++) app.move(1200, 800);
  assert.equal(app.frames.size, 1);
  assert.equal(app.position().x, 0);
  app.step();
  const first = app.position();
  assert.ok(first.x > 0 && first.y > 0);
  assert.ok(Math.hypot(first.x, first.y) < 6);
  app.settle();
  const last = app.position();
  assert.ok(last.x > first.x && last.y > first.y);
  assert.ok(Math.hypot(last.x, last.y) <= 6.001);
  assert.equal(app.styles.has('--home-mascot-x'), false);
  assert.equal(app.styles.has('--home-mascot-y'), false);
  assert.equal(app.frames.size, 0);
  assert.equal(app.reads(), 2);
  app.cleanup();
});

test('leaving the page or window returns smoothly to the original position', () => {
  for (const exit of [app => app.leave(), app => app.blur(), app => app.out(null)]) {
    const app = harness();
    app.move(1200, 300);
    app.settle();
    const before = app.position().x;
    exit(app);
    app.step();
    assert.ok(app.position().x > 0 && app.position().x < before);
    app.settle();
    assert.equal(app.position().x, 0);
    assert.equal(app.position().y, 0);
    assert.equal(app.frames.size, 0);
    app.cleanup();
  }
});

test('eye offsets stay bounded in every direction and refresh their origin on resize', () => {
  const app = harness({ edge: true });
  app.move(1200, 300);
  app.settle();
  assert.ok(app.position().x > 0);
  app.move(0, 300);
  app.settle();
  assert.ok(app.position().x < 0);
  for (const [x, y] of [[-10000, -10000], [10000, -10000], [10000, 10000], [-10000, 10000]]) {
    app.move(x, y);
    app.settle();
    assert.ok(Math.hypot(app.position().x, app.position().y) <= 6.001);
  }
  app.resize({ left: -100, right: 100, top: 200, bottom: 400 });
  app.move(0, 300);
  app.settle();
  assert.deepEqual(app.position(), { x: 0, y: 0 });
  app.cleanup();
});

test('touch input and reduced motion never start cursor-follow animation', () => {
  const app = harness({ reduced: true });
  app.move(1200, 300);
  assert.equal(app.frames.size, 0);
  app.reduce(false);
  app.move(1200, 300, 'touch');
  assert.equal(app.frames.size, 0);
  app.move(1200, 300);
  app.step();
  app.reduce(true);
  assert.equal(app.frames.size, 0);
  assert.deepEqual(app.position(), { x: 0, y: 0 });
  app.cleanup();
});

test('hidden tabs and unmount cancel frames; late callbacks and events cannot restart them', () => {
  const app = harness();
  app.move(1200, 300);
  app.step();
  app.hide(true);
  assert.equal(app.frames.size, 0);
  assert.deepEqual(app.position(), { x: 0, y: 0 });
  app.move(1200, 300);
  assert.equal(app.frames.size, 0);
  app.hide(false);
  app.move(1200, 300);
  const late = [...app.frames.values()][0];
  app.cleanup();
  late(1000);
  app.move(1200, 300);
  app.resize({ left: 650, right: 850, top: 200, bottom: 400 });
  assert.equal(app.frames.size, 0);
  assert.deepEqual(app.position(), { x: 0, y: 0 });
});
