import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async file => ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const species = {}, vocabulary = {};
vm.runInNewContext(await compile('../lib/plant-species.ts'), { exports: species });
vm.runInNewContext(await compile('../lib/voice-vocabulary.ts'), { exports: vocabulary, require: () => species });
const source = await compile('../app/api/transcribe/route.ts');
function load(allowed = true) {
  const exports = {}, calls = [];
  vm.runInNewContext(source, {
    exports, Buffer, Request, Response, Blob, AbortSignal, AbortController, setTimeout, clearTimeout, console,
    require: name => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/voice-vocabulary') return vocabulary;
      if (name === '@/lib/whisper') return {};
      if (name === '@/lib/recorded-transcription') return { transcribeRecording: async (...args) => { calls.push(args); return '"My Aster is dry"'; } };
      if (name === '@/lib/api-guard') return {
        enforceApiLimit: async () => ({ allowed }),
        rateLimitResponse: () => new Response(null, { status: 429 }),
        readBodyWithLimit: async (request, cap) => { const bytes = new Uint8Array(await request.arrayBuffer()); return bytes.length > cap ? null : bytes; },
      };
      throw Error(name);
    },
  });
  return { calls, post: request => exports.POST(request) };
}
function request(hints, type = 'audio/wav') {
  const form = new FormData();
  form.append('audio', new Blob(['audio'], { type }), 'speech.wav');
  if (hints !== undefined) form.append('vocabulary', hints);
  return new Request('http://localhost/api/transcribe', { method: 'POST', body: form });
}
test('recorded route validates hints and propagates audio, MIME and cancellation', async () => {
  const app = load();
  const response = await app.post(request(JSON.stringify(['My Aster', null, 'Aster', 'aster'])));
  assert.deepEqual(await response.json(), { transcript: 'My Aster is dry' });
  const [audio, mime, hints, signal] = app.calls[0];
  assert.equal(audio.toString(), 'audio');
  assert.equal(mime, 'audio/wav');
  assert.equal(hints[0], 'My Aster');
  assert.ok(hints.includes('Aster'));
  assert.ok(hints.length <= 100);
  assert.equal(signal.aborted, true, 'Route completion disposes outstanding provider work');
});
test('invalid optional hints still transcribe, while rate limits and unsupported media do not', async () => {
  const app = load();
  assert.equal((await app.post(request('bad json'))).status, 200);
  assert.ok(app.calls[0][2].includes('Aster'));
  assert.equal((await app.post(request('[]', 'text/plain'))).status, 415);
  assert.equal(app.calls.length, 1);
  const limited = load(false);
  assert.equal((await limited.post(request('[]'))).status, 429);
  assert.equal(limited.calls.length, 0);
});
