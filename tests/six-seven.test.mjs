import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/six-seven.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
await import('node:vm').then(({ runInNewContext }) => runInNewContext(js, { exports }));

test('recognizes spoken six seven and numeric transcription variants', () => {
  for (const phrase of ['six seven', 'Six, seven!', '6 7', '6-7', '67']) {
    assert.equal(exports.heardSixSeven(`Wait, ${phrase} today`), true, phrase);
  }
});

test('does not react to other numbers or partial words', () => {
  for (const phrase of ['167', '678', 'six seventeen', 'six seventies', '6.7', 'six']) {
    assert.equal(exports.heardSixSeven(phrase), false, phrase);
  }
});
