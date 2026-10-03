import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/components/cactea/useCacteaSmile.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function harness({ enabled = true, reduced = false, hidden = false } = {}) {
  const document = new EventTarget();
  document.hidden = hidden;
  const media = new EventTarget();
  media.matches = reduced;
  const timers = new Map();
  const attributes = new Map();
  let nextId = 0;
  let cleanup;
  const mascot = { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const window = {
    matchMedia: () => media,
    setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout: id => timers.delete(id),
  };
  const exports = {};
  vm.runInNewContext(code, { exports, window, document, require: () => ({ useEffect: callback => { cleanup = callback(); } }) });
  assert.equal(typeof exports.default, 'function', 'Smile controller must exist');
  exports.default({ current: mascot }, enabled);
  return {
    timers, smiling: () => attributes.has('data-smiling'),
    delay: () => [...timers.values()][0]?.delay,
    next: () => { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.callback(); },
    hide: value => { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
    reduce: value => { media.matches = value; media.dispatchEvent(new Event('change')); },
    cleanup: () => cleanup?.(),
  };
}

test('idle smile lasts 1.8 seconds and starts again every five seconds', () => {
  const app = harness();
  assert.equal(app.smiling(), false);
  assert.equal(app.delay(), 3200);
  app.next();
  assert.equal(app.smiling(), true);
  assert.equal(app.delay(), 1800);
  app.next();
  assert.equal(app.smiling(), false);
  assert.equal(app.delay(), 3200);
  app.cleanup();
});

test('hidden tabs, reduced motion, activity changes and unmount clear smiles and timers', () => {
  const app = harness();
  app.next();
  app.hide(true);
  assert.equal(app.smiling(), false);
  assert.equal(app.timers.size, 0);
  app.hide(false);
  app.next();
  app.reduce(true);
  assert.equal(app.smiling(), false);
  assert.equal(app.timers.size, 0);
  app.reduce(false);
  const late = [...app.timers.values()][0].callback;
  app.cleanup();
  late();
  assert.equal(app.smiling(), false);
  assert.equal(app.timers.size, 0);
  for (const options of [{ enabled: false }, { reduced: true }, { hidden: true }]) {
    const inactive = harness(options);
    assert.equal(inactive.timers.size, 0);
    assert.equal(inactive.smiling(), false);
    inactive.cleanup();
  }
});
