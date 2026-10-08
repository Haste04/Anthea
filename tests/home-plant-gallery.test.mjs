import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/home/usePlantGallery.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ width = 920, cardWidth = 290, gap = 20, scrollWidth = 2150, reduced = false } = {}) {
  const window = new EventTarget();
  const frames = new Map();
  let nextId = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.matchMedia = () => ({ matches: reduced });
  const gallery = new EventTarget();
  gallery.clientWidth = width;
  gallery.scrollWidth = scrollWidth;
  gallery.scrollLeft = 0;
  gallery.firstElementChild = { getBoundingClientRect: () => ({ width: cardWidth }) };
  let lastBehavior;
  gallery.scrollBy = ({ left, behavior }) => {
    lastBehavior = behavior;
    gallery.scrollLeft = Math.max(0, Math.min(gallery.scrollWidth - gallery.clientWidth, gallery.scrollLeft + left));
    gallery.dispatchEvent(new Event('scroll'));
  };
  const observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  let state = { previous: false, next: false };
  let cleanup;
  const exports = {};
  vm.runInNewContext(code, { exports, window, getComputedStyle: () => ({ columnGap: `${gap}px` }), require: () => ({
    useRef: () => ({ current: gallery }),
    useState: initial => { state = initial; return [state, update => { state = typeof update === 'function' ? update(state) : update; }]; },
    useEffect: callback => { cleanup = callback(); },
  }) });
  assert.equal(typeof exports.default, 'function', 'The gallery navigation hook must exist');
  const app = exports.default(7);
  const step = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  step();
  return { ...app, gallery, frames, observers, step, state: () => state, behavior: () => lastBehavior, cleanup: () => cleanup() };
}

test('arrows browse the full collection in viewport-sized groups and stop at both ends', () => {
  const app = harness();
  assert.deepEqual({ ...app.state() }, { previous: false, next: true });
  app.move(1); app.step();
  assert.equal(app.gallery.scrollLeft, 930);
  assert.deepEqual({ ...app.state() }, { previous: true, next: true });
  app.move(1); app.step();
  assert.equal(app.gallery.scrollLeft, 1230);
  assert.deepEqual({ ...app.state() }, { previous: true, next: false });
  app.move(-1); app.step(); app.move(-1); app.step();
  assert.equal(app.gallery.scrollLeft, 0);
  assert.deepEqual({ ...app.state() }, { previous: false, next: true });
  app.cleanup();
});

test('mobile arrows advance one plant and reduced motion uses instant native scrolling', () => {
  const app = harness({ width: 330, cardWidth: 330, gap: 16, reduced: true });
  app.move(1); app.step();
  assert.equal(app.gallery.scrollLeft, 346);
  assert.equal(app.behavior(), 'auto');
  app.cleanup();
});

test('short collections disable both arrows and resizing recalculates the bounds', () => {
  const app = harness({ scrollWidth: 920 });
  assert.deepEqual({ ...app.state() }, { previous: false, next: false });
  app.gallery.clientWidth = 330;
  app.observers[0].callback(); app.step();
  assert.deepEqual({ ...app.state() }, { previous: false, next: true });
  app.cleanup();
});

test('scroll input coalesces into one frame and cleanup prevents late updates', () => {
  const app = harness();
  for (let i = 0; i < 20; i++) app.gallery.dispatchEvent(new Event('scroll'));
  assert.equal(app.frames.size, 1);
  const late = [...app.frames.values()][0];
  app.cleanup();
  assert.equal(app.frames.size, 0);
  app.gallery.scrollLeft = 500;
  late();
  app.gallery.dispatchEvent(new Event('scroll'));
  assert.equal(app.frames.size, 0);
  assert.equal(app.state().previous, false);
  assert.equal(app.observers[0].disconnected, true);
});
