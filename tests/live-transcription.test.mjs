import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(
  await readFile(new URL('../app/api/transcribe/live-token/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const vocabulary = {};
const species = {};
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compile(await readFile(new URL('../lib/plant-species.ts', import.meta.url), 'utf8')), { exports: species });
vm.runInNewContext(compile(await readFile(new URL('../lib/voice-vocabulary.ts', import.meta.url), 'utf8')), { exports: vocabulary, require: () => species });

function loadRoute(provider, { key = 'server-secret', allowed = true } = {}) {
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    TextDecoder,
    require: name => name === '@/lib/voice-vocabulary' ? vocabulary : ({
      enforceApiLimit: async () => allowed ? { allowed: true } : { allowed: false, kind: 'limited', retryAfter: 10 },
      rateLimitResponse: () => new Response(null, { status: 429 }),
      readBodyWithLimit: async (request, cap) => { const bytes = new Uint8Array(await request.arrayBuffer()); return bytes.length > cap ? null : bytes; },
    }),
    process: { env: { GEMINI_API_KEY: key } },
    fetch: provider,
    Response,
    AbortSignal,
    Date,
    JSON,
    console: { error() {} },
  });
  return body => exports.POST(new Request('http://localhost/api/transcribe/live-token', { method: 'POST', body }));
}

test('live tokens are single use, model constrained, and keep the server key private', async () => {
  let providerRequest;
  const post = loadRoute(async (url, init) => {
    providerRequest = { url, init };
    return Response.json({ name: 'ephemeral-token' });
  });
  const response = await post();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.token, 'ephemeral-token');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(providerRequest.url, 'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
  assert.equal(providerRequest.init.headers['x-goog-api-key'], 'server-secret');
  const body = JSON.parse(providerRequest.init.body);
  assert.equal(body.uses, 1);
  assert.equal(body.liveConnectConstraints.model, 'models/gemini-3.5-transcribe-live');
  assert.deepEqual(body.liveConnectConstraints.config.responseModalities, ['TEXT']);
  assert.deepEqual(body.liveConnectConstraints.config.inputAudioTranscription.languageCodes, []);
  assert.deepEqual(body.liveConnectConstraints.config.inputAudioTranscription, payload.inputAudioTranscription);
  assert.ok(payload.inputAudioTranscription.customVocabulary.includes('Aster'));
  assert.ok(Date.parse(body.newSessionExpireTime) < Date.parse(body.expireTime));
});

test('saved plant hints are validated, bounded, and constrained to exactly the returned setup', async () => {
  let constrained;
  const post = loadRoute(async (_url, init) => {
    constrained = JSON.parse(init.body).liveConnectConstraints.config.inputAudioTranscription;
    return Response.json({ name: 'ephemeral-token' });
  });
  const response = await post(JSON.stringify({ vocabulary: ['Angelo’s Aster', 'aster', 'ASTER', null, 'bad\u0000term'] }));
  const payload = await response.json();
  assert.equal(constrained.customVocabulary[0], 'Angelo’s Aster');
  assert.equal(constrained.customVocabulary.filter(term => term.toLowerCase() === 'aster').length, 1);
  assert.ok(!constrained.customVocabulary.includes('bad\u0000term'));
  assert.deepEqual(payload.inputAudioTranscription, constrained);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('x'.repeat(65537))).status, 413);
});

test('live token issuance fails closed on missing credentials, rate limits, and provider errors', async () => {
  let calls = 0;
  const provider = async () => { calls++; return Response.json({ error: 'denied' }, { status: 403 }); };
  assert.equal((await loadRoute(provider, { key: '' })()).status, 503);
  assert.equal((await loadRoute(provider, { allowed: false })()).status, 429);
  assert.equal(calls, 0);
  const response = await loadRoute(provider)();
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(await response.json()).includes('server-secret'));
});

test('live stream sends PCM, shows interim words, and promptly finalizes the complete question', async () => {
  const clientSource = ts.transpileModule(
    await readFile(new URL('../lib/live-transcription.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const sent = [];
  const state = { socket: null, worklet: null };
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    constructor(url) { this.url = url; state.socket = this; queueMicrotask(() => this.onopen()); }
    send(value) { sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
  }
  class FakeWorklet {
    port = { onmessage: null, postMessage: () => queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed' } })) };
    constructor() { state.worklet = this; }
    connect() {}
    disconnect() {}
  }
  const node = { connect() {}, disconnect() {}, gain: { value: 1 } };
  const context = {
    audioWorklet: { addModule: async () => {} },
    createMediaStreamSource: () => node,
    createGain: () => ({ ...node, gain: { value: 1 } }),
    destination: node,
  };
  const captions = [];
  const inputAudioTranscription = { languageCodes: [], customVocabulary: ['Aster', 'Sunny'] };
  let tokenRequest;
  const exports = {};
  vm.runInNewContext(clientSource, {
    exports, WebSocket: FakeSocket, AudioWorkletNode: FakeWorklet,
    require: () => vocabulary,
    fetch: async (_url, init) => { tokenRequest = JSON.parse(init.body); return Response.json({ token: 'short-token', inputAudioTranscription }); },
    Response, AbortSignal, AbortController, ArrayBuffer, setTimeout, clearTimeout, queueMicrotask, btoa,
  });
  let ready = false;
  const live = new exports.LiveTranscription({}, context, {
    onCaption: text => captions.push(text), onReady: () => { ready = true; }, onFailure: () => assert.fail('live session failed'),
  }, ['Sunny', 'Aster']);
  await new Promise(resolve => setTimeout(resolve, 0));
  const { socket, worklet } = state;
  assert.match(socket.url, /BidiGenerateContentConstrained\?access_token=short-token$/);
  assert.equal(sent[0].setup.model, 'models/gemini-3.5-transcribe-live');
  assert.deepEqual(tokenRequest.vocabulary, ['Sunny', 'Aster']);
  assert.deepEqual(sent[0].setup.inputAudioTranscription, inputAudioTranscription);
  socket.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  assert.equal(await live.started, true);
  assert.equal(ready, true);
  worklet.port.onmessage({ data: new Uint8Array([1, 2, 3, 4]).buffer });
  assert.equal(sent[1].realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
  socket.onmessage({ data: JSON.stringify({ serverContent: { interimInputTranscription: { text: 'yellow lea' } } }) });
  socket.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: 'Yellow leaves' } } }) });
  assert.deepEqual(captions, ['yellow lea', 'Yellow leaves']);
  const review = live.finish();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(sent.at(-1), { realtimeInput: { audioStreamEnd: true } });
  socket.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: 'on my cactus.' } } }) });
  let submitted = false;
  void review.then(() => { submitted = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(submitted, false, 'A segment alone does not prove the full utterance is complete');
  socket.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  assert.equal(await review, 'Yellow leaves on my cactus.');
  const next = new exports.LiveTranscription({}, context, {
    onCaption() {}, onReady() {}, onFailure() {},
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  state.socket.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  state.socket.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: 'Already finalized' } } }) });
  const ending = next.finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  state.socket.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  const result = await Promise.race([ending, new Promise(resolve => setTimeout(() => resolve('unnecessary delay'), 400))]);
  assert.equal(result, 'Already finalized');
  next.abort();
});
