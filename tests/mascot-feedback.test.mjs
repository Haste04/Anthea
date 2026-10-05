import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/dashboard/useMascotFeedback.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const slots = [];
  let cursor = 0;
  let id = 0;
  let now = 0;
  let cleanup;
  const timers = new Map();
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    setTimeout: (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id; },
    clearTimeout: timer => timers.delete(timer),
    require: () => ({
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = value; }];
      },
      useRef: initial => {
        const index = cursor++;
        slots[index] ??= { current: initial };
        return slots[index];
      },
      useCallback: callback => callback,
      useEffect: effect => { cleanup ??= effect(); },
    }),
  });
  assert.equal(typeof exports.default, 'function', 'Mascot feedback must support the playback lifetime');
  const read = () => { cursor = 0; return exports.default(); };
  return { read, timers, cleanup: () => cleanup?.(), advance: duration => {
    now += duration;
    for (const [timer, item] of timers) {
      if (item.at <= now) { timers.delete(timer); item.callback(); }
    }
  } };
}

test('the angry reaction lasts through a long reply and clears when playback finishes or stops', () => {
  const app = harness();
  app.read().show('angry', true);
  app.advance(20000);
  assert.equal(app.read().feedback, 'angry');
  assert.equal(app.timers.size, 0);
  app.read().finishSpeech();
  assert.equal(app.read().feedback, null);
  app.read().show('angry', true);
  app.read().finishSpeech();
  assert.equal(app.read().feedback, null);
});

test('without read-aloud the angry reaction still clears after a brief interval', () => {
  const app = harness();
  app.read().show('angry');
  app.advance(1799);
  assert.equal(app.read().feedback, 'angry');
  app.advance(1);
  assert.equal(app.read().feedback, null);
});

test('finishing unrelated audio does not cut short error feedback', () => {
  const app = harness();
  app.read().show('angry', true);
  app.read().show('error');
  app.read().finishSpeech();
  assert.equal(app.read().feedback, 'error');
  app.advance(900);
  assert.equal(app.read().feedback, null);
});

test('new questions and unmount cancel feedback timers and stale callbacks', () => {
  const app = harness();
  app.read().show('angry');
  const oldExpiry = [...app.timers.values()][0].callback;
  app.read().clear();
  assert.equal(app.read().feedback, null);
  app.read().show('angry', true);
  oldExpiry();
  assert.equal(app.read().feedback, 'angry');
  app.read().show('error');
  app.cleanup();
  assert.equal(app.timers.size, 0);
});
