import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async file => ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const source = await compile('../lib/whisper.ts');

test('warmup and transcription share one loaded pipeline, and failed loading can retry', async () => {
  let loads = 0;
  const exports = {};
  vm.runInNewContext(source, {
    exports, setTimeout, clearTimeout, process: { env: {}, cwd: () => '.' },
    require: name => {
      if (name === 'node:os') return { tmpdir: () => '/tmp' };
      if (name === 'node:path') return { join: (...parts) => parts.join('/') };
      if (name === '@/lib/wav-decode') return { decodeAudioToPcm: async () => new Float32Array(16000).fill(0.1), isSilent: () => false };
      if (name === '@huggingface/transformers') return { env: {}, pipeline: async () => {
        if (++loads === 1) throw Error('download interrupted');
        return async samples => { assert.equal(samples.length, 16000); return { text: ' Water my fern ' }; };
      } };
      throw Error(name);
    },
  });
  assert.equal(typeof exports.warmTranscriber, 'function');
  await assert.rejects(exports.warmTranscriber(), /interrupted/);
  await Promise.all([exports.warmTranscriber(), exports.warmTranscriber()]);
  assert.equal(await exports.transcribeAudio(Buffer.from('audio')), 'Water my fern');
  assert.equal(loads, 2);
});

const routeSource = await compile('../app/api/transcribe/route.ts');
const limits = {};
vm.runInNewContext(await compile('../lib/transcription-limits.ts'), { exports: limits });
test('warmup uses the transcription route and its existing rate limit', async () => {
  for (const allowed of [true, false]) {
    let warmed = 0;
    const exports = {};
    vm.runInNewContext(routeSource, {
      exports, setTimeout, clearTimeout, console,
      require: name => {
        if (name === 'next/server') return { NextResponse: Response };
        if (name === '@/lib/transcription-limits') return limits;
        if (name === '@/lib/whisper') return { warmTranscriber: async () => { warmed++; } };
        if (name === '@/lib/recorded-transcription' || name === '@/lib/voice-vocabulary') return {};
        if (name === '@/lib/api-guard') return { enforceApiLimit: async () => ({ allowed }), rateLimitResponse: () => new Response(null, { status: 429 }) };
        throw Error(name);
      },
    });
    const response = await exports.POST(new Request('http://localhost/api/transcribe', { method: 'POST', headers: { 'x-anthea-warmup': '1' } }));
    assert.equal(response.status, allowed ? 200 : 429);
    assert.equal(warmed, allowed ? 1 : 0);
    if (allowed) assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
