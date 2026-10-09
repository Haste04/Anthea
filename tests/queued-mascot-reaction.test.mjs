import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let source = '';
try { source = await readFile(new URL('../app/dashboard/useQueuedMascotReaction.ts', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function harness(initialBlocked = true) {
  const slots = [];
  const timers = new Map();
  const played = [];
  let cursor = 0;
  let nextId = 0;
  let blocked = initialBlocked;
  let previousDeps;
  let cleanup;
  let scheduledEffect;
  const onPlay = text => played.push(text);
  const hook = {};
  vm.runInNewContext(code, {
    exports: hook,
    window: {
      setTimeout: callback => { timers.set(++nextId, callback); return nextId; },
      clearTimeout: id => timers.delete(id),
    },
    require: () => ({
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = value; }];
      },
      useCallback: callback => callback,
      useEffect: (effect, deps) => { scheduledEffect = { effect, deps }; },
    }),
  });
  assert.equal(typeof hook.default, 'function', 'Voice reactions need a queue that waits for higher-priority activity');
  function render() {
    cursor = 0;
    const result = hook.default(blocked, onPlay);
    const { effect, deps } = scheduledEffect;
    if (!previousDeps || deps.some((value, index) => value !== previousDeps[index])) {
      cleanup?.();
      previousDeps = deps;
      cleanup = effect();
    }
    return result;
  }
  render();
  return {
    played, timers,
    queue: text => { render().queue(text); render(); },
    clear: () => { render().clear(); render(); },
    block: value => { blocked = value; render(); },
    flush: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } render(); },
    unmount: () => cleanup?.(),
  };
}

test('voice gestures wait through processing and held angry feedback, then play once', () => {
  const app = harness();
  app.queue('Hello Lifewood');
  app.flush();
  app.flush();
  assert.deepEqual(app.played, []);
  assert.equal(app.timers.size, 0, 'Gesture timers must not start behind a higher-priority reaction');
  app.block(false);
  app.flush();
  assert.deepEqual(app.played, ['Hello Lifewood']);
  app.flush();
  assert.deepEqual(app.played, ['Hello Lifewood']);
});

test('new questions clear queued reactions and stale callbacks cannot replay them', () => {
  const app = harness(false);
  app.queue('six seven');
  const stale = [...app.timers.values()][0];
  app.clear();
  stale();
  assert.deepEqual(app.played, []);
  assert.equal(app.timers.size, 0);
});

test('feedback arriving before dispatch postpones the reaction without losing it', () => {
  const app = harness(false);
  app.queue('Life wood');
  const stale = [...app.timers.values()][0];
  app.block(true);
  stale();
  assert.deepEqual(app.played, []);
  app.block(false);
  app.flush();
  assert.deepEqual(app.played, ['Life wood']);
});

test('replacing a queued reaction and unmounting cancel obsolete work', () => {
  const app = harness(false);
  app.queue('old voice question');
  const stale = [...app.timers.values()][0];
  app.queue('new voice question');
  stale();
  app.flush();
  assert.deepEqual(app.played, ['new voice question']);
  app.queue('Lifewood');
  const late = [...app.timers.values()][0];
  app.unmount();
  late();
  assert.deepEqual(app.played, ['new voice question']);
  assert.equal(app.timers.size, 0);
});
