import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("../lib/wav-decode.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});

// The module has bare imports (wavefile, audio-decode), which cannot resolve
// from a data: URL - materialize it inside the project so Node's resolver
// finds node_modules, then delete it after the suite.
const tempModule = fileURLToPath(new URL("./.tmp-wav-decode.mjs", import.meta.url));
await writeFile(tempModule, outputText);
after(async () => {
  await rm(tempModule, { force: true });
});

const { decodeAudioToPcm, isSilent } = await import(pathToFileURL(tempModule).href);

function sinePcm16(sampleRate, seconds, amplitude, frequency = 440) {
  const count = Math.round(sampleRate * seconds);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = Math.round(
      amplitude * 32767 * Math.sin((2 * Math.PI * frequency * i) / sampleRate),
    );
  }
  return samples;
}

function buildWav(sampleRate, channels) {
  const channelCount = channels.length;
  const frames = channels[0].length;
  const dataBytes = frames * channelCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buffer.writeUInt16LE(channelCount * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      buffer.writeInt16LE(channel[frame], offset);
      offset += 2;
    }
  }
  return buffer;
}

function rms(samples) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

test("a 44.1 kHz mono WAV decodes to 16 kHz float PCM in [-1, 1]", async () => {
  const wav = buildWav(44100, [sinePcm16(44100, 1, 0.5)]);
  const pcm = await decodeAudioToPcm(wav);

  assert.ok(Math.abs(pcm.length - 16000) <= 2, `length ${pcm.length}`);
  assert.ok(Math.max(...Array.from(pcm, Math.abs)) <= 1);
  // 0.5 amplitude sine has RMS 0.5/sqrt(2)
  assert.ok(
    Math.abs(rms(pcm) - 0.5 / Math.SQRT2) < 0.05,
    `rms ${rms(pcm)}`,
  );
});

test("48 kHz input matches the same length ratio after resampling", async () => {
  const wav = buildWav(48000, [sinePcm16(48000, 0.5, 0.4)]);
  const pcm = await decodeAudioToPcm(wav);
  assert.ok(Math.abs(pcm.length - 8000) <= 2, `length ${pcm.length}`);
});

test("stereo input is mixed down to a single channel", async () => {
  const wav = buildWav(44100, [
    sinePcm16(44100, 0.5, 0.4),
    new Int16Array(22050),
  ]);
  const pcm = await decodeAudioToPcm(wav);
  // One loud channel plus one silent channel halves the amplitude.
  assert.ok(
    Math.abs(rms(pcm) - 0.4 / Math.SQRT2 / 2) < 0.05,
    `rms ${rms(pcm)}`,
  );
});

test("undecodable audio rejects instead of returning silence", async () => {
  await assert.rejects(decodeAudioToPcm(Buffer.from("not audio at all!!!")));
  // Fake RIFF magic with a corrupt body falls back to the generic decoder
  // and must reject as well, so the route reports failure rather than "".
  const corrupt = Buffer.alloc(64, 7);
  corrupt.write("RIFF", 0, "ascii");
  corrupt.write("WAVE", 8, "ascii");
  await assert.rejects(decodeAudioToPcm(corrupt));
});

test("the silence gate trips only below the noise floor", () => {
  assert.equal(isSilent(new Float32Array(0)), true);
  assert.equal(isSilent(new Float32Array(16000)), true);
  const quietNoise = new Float32Array(16000).fill(0.001);
  assert.equal(isSilent(quietNoise), true);
  const speech = Float32Array.from(sinePcm16(16000, 1, 0.05), (v) => v / 32767);
  assert.equal(isSilent(speech), false);
});
