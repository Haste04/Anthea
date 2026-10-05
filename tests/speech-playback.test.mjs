import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/dashboard/useSpeechPlayback.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const voiceExports = {};
const voiceSource = await readFile(new URL('../lib/speech-voice.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(voiceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: voiceExports });

function setup({ supported = true, setupFails = false } = {}) {
  const timers = new Map();
  let nextTimer = 0;
  let utterance;
  let cleanup;
  const calls = { start: 0, finish: 0, error: 0, cancel: 0 };
  const hookModule = { exports: {} };
  const react = {
    useRef: value => ({ current: value }),
    useState: value => [value, () => {}],
    useCallback: callback => callback,
    useEffect: effect => { cleanup = effect(); },
  };
  vm.runInNewContext(js, {
    module: hookModule, exports: hookModule.exports, require: name => name === 'react' ? react : name === '@/lib/speech-voice' ? voiceExports : { readVoiceChoice: () => 'chosen' },
    window: { speechSynthesis: supported ? { getVoices: () => { if (setupFails) throw new Error('Voice setup failed'); return [{ voiceURI: 'chosen', lang: 'en-GB' }]; }, speak: value => { utterance = value; }, cancel: () => calls.cancel++ } : undefined },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  });
  const playback = hookModule.exports.default(() => calls.start++, () => calls.finish++, () => calls.error++);
  return { playback, calls, timers, get utterance() { return utterance; }, cleanup: () => cleanup() };
}

test('queued speech only becomes speaking when audio starts', () => {
  const h = setup();
  h.playback.speak('Check the soil.', 'reply1');
  assert.equal(h.utterance.voice.voiceURI, 'chosen');
  assert.equal(h.utterance.lang, 'en-GB');
  assert.equal(h.calls.start, 0);
  assert.equal(h.timers.size, 1);
  h.utterance.onstart();
  assert.equal(h.calls.start, 1);
  assert.equal(h.timers.size, 0);
  h.utterance.onend();
  assert.equal(h.calls.finish, 2); // initial stop, then actual completion
});
test('blocked speech times out with recovery and cancels the queue', () => {
  const h = setup();
  h.playback.speak('Check the soil.', 'reply1');
  [...h.timers.values()][0]();
  assert.equal(h.calls.error, 1);
  assert.equal(h.calls.start, 0);
  assert.equal(h.calls.cancel, 2);
  assert.equal(h.utterance.onstart, null);
});
test('stop and unmount prevent late speech events from changing state', () => {
  const h = setup();
  h.playback.speak('First answer.', 'reply1');
  const staleStart = h.utterance.onstart;
  h.playback.stop();
  staleStart();
  assert.equal(h.calls.start, 0);
  assert.equal(h.timers.size, 0);
  h.playback.speak('Follow-up answer.', 'reply2');
  h.cleanup();
  assert.equal(h.utterance.onstart, null);
  assert.equal(h.timers.size, 0);
});

test('reply feedback starts after prior audio is stopped and ends with the new audio', () => {
  const h = setup();
  let finishAtQueue;
  h.playback.speak('Ask me about plants.', 'off-topic-reply', () => { finishAtQueue = h.calls.finish; });
  assert.equal(finishAtQueue, 1, 'The initial stop must precede new reply feedback');
  assert.equal(h.calls.finish, 1);
  h.utterance.onstart();
  assert.equal(h.calls.finish, 1);
  h.utterance.onend();
  assert.equal(h.calls.finish, 2);
});

test('unavailable speech and voice setup errors finish held reply feedback instead of leaving it active', () => {
  for (const options of [{ supported: false }, { setupFails: true }]) {
    const h = setup(options);
    let held = false;
    assert.doesNotThrow(() => h.playback.speak('Ask me about plants.', 'reply', () => { held = true; }));
    assert.equal(held, true);
    assert.equal(h.calls.finish, 2, 'Initial stop and failed new playback must both finish');
    assert.equal(h.calls.error, 1);
    assert.equal(h.timers.size, 0);
  }
});
