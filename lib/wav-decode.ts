import decode from "audio-decode";
import wavefile from "wavefile";

const { WaveFile } = wavefile;

/** Whisper consumes 16 kHz mono float32 PCM. */
export const WHISPER_SAMPLE_RATE = 16000;

/** RMS below this counts as an empty recording. */
export const SILENCE_RMS_THRESHOLD = 0.005;

/**
 * Decode an uploaded audio file to 16 kHz mono float32 PCM.
 * RIFF/WAVE input goes through wavefile (proper resampler); everything else
 * (webm/opus, mp4, mp3, ...) is decoded by audio-decode and resampled here.
 */
export async function decodeAudioToPcm(buffer: Buffer): Promise<Float32Array> {
  if (isRiffWave(buffer)) {
    try {
      return clampToUnit(decodeWaveFile(buffer));
    } catch {
      // Malformed WAV - fall through to the generic decoder.
    }
  }
  const { channelData, sampleRate } = await decode(buffer);
  const channels = channelData.filter((channel) => channel.length > 0);
  if (channels.length === 0) {
    // No decodable samples at all: fail loudly so the route reports an
    // error instead of pretending the recording was silent.
    throw new Error("Unable to decode audio");
  }
  const mono = clampToUnit(toMono(channels));
  return clampToUnit(resample(mono, sampleRate, WHISPER_SAMPLE_RATE));
}

/** True when the whole recording is quieter than the noise floor. */
export function isSilent(
  samples: Float32Array,
  threshold = SILENCE_RMS_THRESHOLD,
): boolean {
  if (samples.length === 0) return true;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length) < threshold;
}

function isRiffWave(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

function decodeWaveFile(buffer: Buffer): Float32Array {
  const wav = new WaveFile(buffer);
  wav.toBitDepth("32f");
  wav.toSampleRate(WHISPER_SAMPLE_RATE);
  const samples = wav.getSamples(false, Float32Array) as unknown;
  const channels = Array.isArray(samples)
    ? (samples as ArrayLike<number>[])
    : [samples as ArrayLike<number>];
  return toMono(channels);
}

function toMono(channels: ArrayLike<number>[]): Float32Array {
  const length = channels[0].length;
  const out = new Float32Array(length);
  if (channels.length === 1) {
    const only = channels[0];
    for (let i = 0; i < length; i++) out[i] = only[i];
    return out;
  }
  const scale = 1 / channels.length;
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += channel[i] * scale;
  }
  return out;
}

function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (
    !Number.isFinite(fromRate) ||
    fromRate <= 0 ||
    Math.round(fromRate) === toRate
  ) {
    return samples;
  }
  try {
    const wav = new WaveFile();
    wav.fromScratch(1, Math.round(fromRate), "32f", samples);
    wav.toSampleRate(toRate);
    const resampled = wav.getSamples(false, Float32Array) as unknown;
    return Array.isArray(resampled)
      ? toMono(resampled as ArrayLike<number>[])
      : (resampled as Float32Array);
  } catch {
    return resampleLinear(samples, fromRate, toRate);
  }
}

function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    out[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return out;
}

function clampToUnit(samples: Float32Array): Float32Array {
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (value > 1) samples[i] = 1;
    else if (value < -1) samples[i] = -1;
  }
  return samples;
}
