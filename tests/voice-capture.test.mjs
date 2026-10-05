import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(file, optional = false) {
  let source = '';
  try { source = await readFile(new URL(file, import.meta.url), 'utf8'); } catch (error) { if (!optional) throw error; }
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const source = await compile('../lib/voice-capture.ts', true);
const limits = {};
vm.runInNewContext(await compile('../lib/transcription-limits.ts'), { exports: limits });
const activity = {};
vm.runInNewContext(await compile('../lib/voice-activity.ts'), { exports: activity, Date });
const species = {};
vm.runInNewContext(await compile('../lib/plant-species.ts'), { exports: species });
const vocabularyApi = {};
vm.runInNewContext(await compile('../lib/voice-vocabulary.ts'), { exports: vocabularyApi, require: () => species });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function harness({ permission, liveText = 'Water my fern', failedLive = false, fallback, browser = false, audioSize = 5 } = {}) {
  let now = 0, energy = 0, stopped = 0;
  const recognitionRef = { current: null };
  const intervals = new Set(), timeouts = new Map(), submissions = [], states = [], phases = [], drafts = [];
  const track = { stop() { stopped++; }, onended: null };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const analyser = { fftSize: 2048, getFloatTimeDomainData: data => data.fill(energy) };
  class AudioContext {
    state = 'running';
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return analyser; }
    async close() { this.state = 'closed'; }
    async resume() {}
  }
  class MediaRecorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([audioSize === 5 ? 'audio' : new Uint8Array(audioSize)]) }); this.onstop?.(); }); }
  }
  class SpeechRecognition {
    constructor() { recognitionRef.current = this; }
    start() {}
    stop() { this.onend?.(); }
    abort() {}
  }
  class LiveTranscription {
    active = !failedLive;
    text = '';
    constructor(_stream, _context, callbacks) { if (!failedLive) callbacks.onReady(); }
    async finish() { return failedLive ? '' : liveText; }
    abort() {}
  }
  const exports = {};
  let constraints;
  vm.runInNewContext(source, {
    exports, AudioContext, MediaRecorder, Blob, FormData, AbortController, AbortSignal, queueMicrotask, console,
    Date: { now: () => now },
    navigator: { mediaDevices: { getUserMedia: async value => { constraints = value; return permission ? await permission : stream; } } },
    window: browser ? { SpeechRecognition } : {},
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn),
    setTimeout: (fn, delay) => { timeouts.set(fn, now + delay); return fn; }, clearTimeout: fn => timeouts.delete(fn),
    require: name => {
      if (name === '@/lib/voice-activity') return activity;
      if (name === '@/lib/transcription-limits') return limits;
      if (name === '@/lib/voice-vocabulary') return vocabularyApi;
      if (name === '@/lib/live-transcription') return { LiveTranscription };
      if (name === '@/lib/wav') return { blobToWav: async blob => blob };
      if (name === '@/lib/voice-feedback') return { microphoneProblem: () => 'Microphone unavailable' };
      throw Error(`Unexpected module ${name}`);
    },
    fetch: fallback ?? (async () => { throw Error('Fallback should not be used'); }),
  });
  assert.equal(typeof exports.VoiceCapture, 'function');
  const capture = new exports.VoiceCapture({ onState: value => states.push(value), onPhase: value => phases.push(value), onTranscript: text => submissions.push(text), onDraft: text => drafts.push(text), onAnalyser() {}, onLevel() {} });
  return {
    capture, submissions, states, phases, stream, drafts,
    stopped: () => stopped, constraints: () => constraints,
    async tick(time, rms) { now = time; energy = rms; for (const fn of [...intervals]) fn(); await flush(); },
    browserWords(text, isFinal = true) { recognitionRef.current.onresult({ results: [{ isFinal, 0: { transcript: text } }] }); },
  };
}

test('speech and trailing silence submit directly once with processed microphone audio', async () => {
  const app = harness();
  await app.capture.start(true);
  assert.equal(app.constraints().audio.echoCancellation, true);
  assert.equal(app.constraints().audio.noiseSuppression, true);
  assert.equal(app.constraints().audio.autoGainControl, true);
  await app.tick(0, 0.1); await app.tick(160, 0.1); await app.tick(1059, 0);
  assert.deepEqual(app.submissions, []);
  await app.tick(1060, 0);
  assert.deepEqual(app.submissions, ['Water my fern']);
  await app.capture.finish();
  assert.equal(app.submissions.length, 1);
  assert.ok(app.stopped() > 0);
});

test('oversized recordings offer a shorter recording without uploading or repeating the failed upload', async () => {
  let uploads = 0;
  const app = harness({ failedLive: true, audioSize: 4_194_305, fallback: async () => {
    uploads++;
    return { ok: true, json: async () => ({ transcript: 'Water my fern' }) };
  } });
  await app.capture.start(false);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  await app.capture.finish();
  assert.equal(uploads, 0);
  assert.deepEqual(app.submissions, []);
  assert.match(app.states.at(-1).issue, /shorter/i);
  assert.equal(app.states.at(-1).canRetry, false);
  await app.capture.retry();
  assert.equal(uploads, 0);
});

test('a host upload rejection asks for a shorter recording instead of retrying the same payload', async () => {
  const app = harness({ failedLive: true, fallback: async () => ({ ok: false, status: 413 }) });
  await app.capture.start(false);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  await app.capture.finish();
  assert.match(app.states.at(-1).issue, /shorter/i);
  assert.equal(app.states.at(-1).canRetry, false);
});

test('an unusable accuracy-retry recording preserves saved names for transcript confirmation', async () => {
  for (const audioSize of [5, 4_194_305]) {
    const app = harness({ liveText: 'My monsteraaa is dry', audioSize, fallback: async () => ({ ok: false, status: 413 }) });
    await app.capture.start(false, ['Monsteraa']);
    await app.tick(0, 0.1); await app.tick(160, 0.1);
    await app.capture.finish();
    assert.ok(app.states.at(-1).review.suggestions.includes('Monsteraa'));
    assert.equal(app.states.at(-1).canRetry, false);
    app.capture.confirmName('Monsteraa');
    assert.deepEqual(app.submissions, ['My Monsteraa is dry']);
    assert.equal(app.states.at(-1).review, null);
  }
});

test('an uncertain name retries the recorded audio with vocabulary even when live text exists', async () => {
  let calls = 0;
  const app = harness({ liveText: 'My asper has yellow leaves', fallback: async (_url, init) => {
    calls++;
    assert.ok(JSON.parse(init.body.get('vocabulary')).includes('Aster'));
    return { ok: true, json: async () => ({ transcript: 'My Aster has yellow leaves' }) };
  } });
  await app.capture.start(true, ['Aster']);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  await app.capture.finish();
  assert.equal(calls, 1);
  assert.deepEqual(app.submissions, ['My Aster has yellow leaves']);
});

test('an unresolved name stays editable and only sends after explicit confirmation', async () => {
  const app = harness({ liveText: 'My asper is dry', fallback: async () => ({ ok: true, json: async () => ({ transcript: 'My asper is dry' }) }) });
  await app.capture.start(true, ['Aster', 'Aspen']);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  await app.capture.finish();
  assert.deepEqual(app.submissions, []);
  assert.equal(app.states.at(-1).review.heard, 'asper');
  assert.equal(app.states.at(-1).canRetry, true);
  assert.deepEqual(app.drafts, ['My asper is dry']);
  app.capture.confirmName('unknown');
  assert.equal(app.submissions.length, 0);
  app.capture.confirmName('Aster');
  assert.deepEqual(app.submissions, ['My Aster is dry']);
  app.capture.confirmName('Aster');
  assert.equal(app.submissions.length, 1);
});

test('failed accuracy retry keeps the original words and suggestion; cancellation clears them', async () => {
  const app = harness({ liveText: 'My asper is dry', fallback: async () => { throw Error('offline'); } });
  await app.capture.start(true, ['Aster']);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  await app.capture.finish();
  assert.equal(app.states.at(-1).review.heard, 'asper');
  assert.deepEqual(app.submissions, []);
  app.capture.cancel();
  app.capture.confirmName('Aster');
  assert.deepEqual(app.submissions, []);
  assert.equal(app.states.at(-1).review, null);
});

test('name review also retries browser transcripts when recognizer speech is below VAD thresholds', async () => {
  let calls = 0;
  const app = harness({ failedLive: true, browser: true, fallback: async () => {
    calls++;
    return { ok: true, json: async () => ({ transcript: 'asper' }) };
  } });
  await app.capture.start(false, ['Aster']);
  app.browserWords('asper');
  await app.capture.finish();
  assert.equal(calls, 1);
  assert.deepEqual(app.submissions, []);
  assert.equal(app.states.at(-1).review.heard, 'asper');
  app.capture.confirmName('Aster');
  assert.deepEqual(app.submissions, ['Aster']);
});

test('push-to-talk ignores silence and submits on release', async () => {
  const app = harness();
  await app.capture.start(false);
  await app.tick(0, 0.1); await app.tick(160, 0.1); await app.tick(2000, 0);
  assert.equal(app.submissions.length, 0);
  await app.capture.finish();
  assert.deepEqual(app.submissions, ['Water my fern']);
});

test('release before permission resolves cancels and stops a late microphone stream', async () => {
  let grant;
  const app = harness({ permission: new Promise(resolve => { grant = resolve; }) });
  const starting = app.capture.start(false);
  await app.capture.finish();
  grant(app.stream);
  await starting;
  assert.deepEqual(app.submissions, []);
  assert.equal(app.stopped(), 1);
});

test('cancelling during fallback prevents late transcripts from reaching chat', async () => {
  let complete;
  const app = harness({ failedLive: true, fallback: () => new Promise(resolve => { complete = resolve; }) });
  await app.capture.start(true);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  const ending = app.capture.finish(); await flush();
  assert.equal(typeof complete, 'function');
  app.capture.cancel();
  complete({ ok: true, json: async () => ({ transcript: 'stale answer' }) });
  await ending;
  assert.deepEqual(app.submissions, []);
});

test('browser transcript is a fast fallback and empty recordings never submit', async () => {
  const app = harness({ failedLive: true, browser: true });
  await app.capture.start(true); app.browserWords('My fern is yellow');
  await app.capture.finish();
  assert.deepEqual(app.submissions, ['My fern is yellow']);
  const empty = harness({ failedLive: true });
  await empty.capture.start(false); await empty.capture.finish();
  assert.deepEqual(empty.submissions, []);
});

test('failed transcription retains audio for one successful retry', async () => {
  let calls = 0;
  const app = harness({ failedLive: true, fallback: async () => {
    calls++;
    if (calls === 1) throw Error('offline');
    return { ok: true, json: async () => ({ transcript: 'Saved recording' }) };
  } });
  await app.capture.start(true); await app.tick(0, 0.1); await app.tick(160, 0.1);
  await app.capture.finish();
  assert.equal(app.states.at(-1).canRetry, true);
  await app.capture.retry();
  assert.deepEqual(app.submissions, ['Saved recording']);
  await app.capture.retry();
  assert.equal(calls, 2);
});

test('unfinalized browser captions use full-recording fallback instead of sending a partial guess', async () => {
  const app = harness({ failedLive: true, browser: true, fallback: async () => ({ ok: true, json: async () => ({ transcript: 'Do not water the fern' }) }) });
  await app.capture.start(true);
  await app.tick(0, 0.1); await app.tick(160, 0.1);
  app.browserWords('Water the fern', false);
  await app.capture.finish();
  assert.deepEqual(app.submissions, ['Do not water the fern']);
});
