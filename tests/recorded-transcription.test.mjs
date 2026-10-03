import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../lib/recorded-transcription.ts', import.meta.url), 'utf8').catch(() => ''), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(fetch, key = 'secret') {
  const exports = {};
  let localCalls = 0;
  vm.runInNewContext(source, {
    exports, Buffer, fetch, AbortSignal, AbortController,
    process: { env: { GEMINI_API_KEY: key } },
    require: name => {
      if (name === '@/lib/whisper') return { transcribeAudio: async () => { localCalls++; return 'Local transcript'; } };
      if (name === '@/lib/voice-vocabulary') return { normalizeVoiceVocabulary: terms => terms };
      throw Error(name);
    },
  });
  return { api: exports, localCalls: () => localCalls };
}
test('recorded transcription sends audio and vocabulary to dedicated ASR without storing the interaction', async () => {
  const app = load(async (url, init) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(init.headers['x-goog-api-key'], 'secret');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gemini-3.5-transcribe');
    assert.equal(body.store, false);
    assert.equal(body.input[0].data, Buffer.from('audio').toString('base64'));
    assert.equal(body.input[0].mime_type, 'audio/wav');
    assert.deepEqual(body.generation_config.transcription_config.custom_vocabulary, ['Aster']);
    return Response.json({ status: 'completed', output_text: 'My Aster is dry' });
  });
  assert.equal(await app.api.transcribeRecording(Buffer.from('audio'), 'audio/wav', ['Aster']), 'My Aster is dry');
  assert.equal(app.localCalls(), 0);
});
test('REST step outputs are read and provider failures fall back to local Whisper', async () => {
  const steps = load(async () => Response.json({ status: 'completed', steps: [
    { type: 'thought', content: [{ type: 'text', text: 'not a transcript' }] },
    { type: 'model_output', content: [{ type: 'text', text: 'Aster' }] },
  ] }));
  assert.equal(await steps.api.transcribeRecording(Buffer.from('audio'), 'audio/webm', ['Aster']), 'Aster');
  for (const provider of [async () => { throw Error('offline'); }, async () => new Response(null, { status: 403 }), async () => Response.json({ status: 'failed' })]) {
    const app = load(provider);
    assert.equal(await app.api.transcribeRecording(Buffer.from('audio'), 'audio/wav', ['Aster']), 'Local transcript');
    assert.equal(app.localCalls(), 1);
  }
  const missing = load(() => assert.fail('No provider call without a key'), '');
  assert.equal(await missing.api.transcribeRecording(Buffer.from('audio'), 'audio/wav', []), 'Local transcript');
});
test('cancelled requests do not start local inference', async () => {
  const controller = new AbortController();
  controller.abort();
  const app = load(() => assert.fail('Cancelled request'));
  await assert.rejects(app.api.transcribeRecording(Buffer.from('audio'), 'audio/wav', ['Aster'], controller.signal));
  assert.equal(app.localCalls(), 0);
});
