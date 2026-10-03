import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

let source = '';
try { source = await readFile(new URL('../lib/voice-activity.ts', import.meta.url), 'utf8'); } catch {}
const voice = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: voice, Date, Math, JSON });

test('silence never submits until sustained speech, then waits 900ms', () => {
  assert.equal(typeof voice.VoiceActivityDetector, 'function');
  const vad = new voice.VoiceActivityDetector();
  assert.equal(vad.update(0, 0), false);
  assert.equal(vad.update(0, 5000), false);
  vad.update(0.1, 5020);
  vad.update(0.1, 5180);
  assert.equal(vad.hasSpeech, true);
  assert.equal(vad.update(0, 6079), false);
  assert.equal(vad.update(0, 6080), true);
});

test('a brief click and a pause within speech do not end a turn', () => {
  const vad = new voice.VoiceActivityDetector();
  vad.update(0.4, 0);
  assert.equal(vad.update(0, 20), false);
  assert.equal(vad.hasSpeech, false);
  vad.update(0.1, 1000); vad.update(0.1, 1160);
  assert.equal(vad.update(0, 1700), false);
  vad.update(0.1, 1800);
  assert.equal(vad.update(0, 2600), false);
  assert.equal(vad.update(0, 2700), true);
});

test('calibration separates ambient noise and speech, and rejects silence/noisy samples', () => {
  const calibration = voice.calibrateVoice(Array(100).fill(0.003), Array(150).fill(0.06));
  assert.ok(calibration.startThreshold > 0.003 && calibration.startThreshold < 0.06);
  assert.ok(calibration.stopThreshold < calibration.startThreshold);
  assert.equal(calibration.noiseFloor, 0.003);
  assert.equal(calibration.speechLevel, 0.06);
  assert.throws(() => voice.calibrateVoice([], []));
  assert.throws(() => voice.calibrateVoice(Array(100).fill(0.02), Array(150).fill(0.021)));
  assert.throws(() => voice.calibrateVoice(Array(100).fill(0), Array(150).fill(0)));
  const vad = new voice.VoiceActivityDetector(calibration);
  vad.update(0.06, 0); vad.update(0.06, 160);
  assert.equal(vad.update(0.003, 1060), true);
});

test('invalid stored thresholds fall back safely, valid calibration round-trips', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.equal(voice.readCalibration(storage), null);
  const calibration = voice.calibrateVoice(Array(100).fill(0.003), Array(150).fill(0.06));
  assert.equal(voice.saveCalibration(calibration, storage), true);
  assert.equal(voice.readCalibration(storage).startThreshold, calibration.startThreshold);
  values.set(voice.CALIBRATION_KEY, JSON.stringify({ ...calibration, stopThreshold: -1 }));
  assert.equal(voice.readCalibration(storage), null);
  values.set(voice.CALIBRATION_KEY, '{invalid');
  assert.equal(voice.readCalibration(storage), null);
  assert.equal(voice.readCalibration({ getItem() { throw Error('blocked'); } }), null);
  assert.equal(voice.saveCalibration(calibration, { setItem() { throw Error('blocked'); } }), false);
});
