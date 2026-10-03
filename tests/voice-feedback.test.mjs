import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/voice-feedback.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { microphoneProblem, voiceHeading, captureCaptionPresentation } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('microphone errors explain the correct recovery', () => {
  assert.match(microphoneProblem({ name: 'NotAllowedError' }), /permissions beside the address bar/);
  assert.match(microphoneProblem({ name: 'NotFoundError' }), /connect/i);
  assert.match(microphoneProblem({ name: 'NotReadableError' }), /another app/);
  assert.match(microphoneProblem({ name: 'SecurityError' }), /HTTPS/);
});
test('permission pending never claims to be listening', () => {
  assert.equal(voiceHeading('listening', false, false, false), 'Waiting for microphone access');
  assert.equal(voiceHeading('listening', true, false, false), 'Cactea is listening');
});
test('transcription, reply generation, and actual playback are distinct', () => {
  assert.equal(voiceHeading('processing', false, true, false), 'Turning your recording into words');
  assert.equal(voiceHeading('processing', false, false, false), 'Cactea is thinking');
  assert.equal(voiceHeading('idle', false, false, true), 'Preparing the spoken reply');
  assert.equal(voiceHeading('speaking', false, false, false), 'Cactea is replying aloud');
});

test('recording copy distinguishes live captions from deferred transcription', () => {
  assert.deepEqual(captureCaptionPresentation(false, ''), {
    label: 'Recording audio',
    text: 'Keep speaking. Your question will be transcribed and sent when you finish.',
  });
  assert.deepEqual(captureCaptionPresentation(true, ''), {
    label: 'What I hear',
    text: 'Start speaking. Your words will appear here.',
  });
  assert.deepEqual(captureCaptionPresentation(false, 'Yellow leaves'), {
    label: 'Recording audio',
    text: 'Yellow leaves',
  });
});
