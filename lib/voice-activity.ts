export const CALIBRATION_KEY = "anthea.voice-calibration.v1";
export const TRAILING_SILENCE_MS = 900;
export const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 16000 },
};

export type VoiceCalibration = {
  version: 1;
  noiseFloor: number;
  speechLevel: number;
  startThreshold: number;
  stopThreshold: number;
  calibratedAt: number;
};

export function rmsLevel(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/** Hysteresis prevents noise near the cutoff from repeatedly starting a turn. */
export class VoiceActivityDetector {
  hasSpeech = false;
  private candidateAt: number | null = null;
  private lastSpeechAt = 0;
  constructor(private thresholds = { startThreshold: 0.02, stopThreshold: 0.012 }) {}

  update(rms: number, now: number): boolean {
    if (!Number.isFinite(rms)) return false;
    if (!this.hasSpeech) {
      if (rms >= this.thresholds.startThreshold) {
        this.candidateAt ??= now;
        if (now - this.candidateAt >= 140) {
          this.hasSpeech = true;
          this.lastSpeechAt = now;
        }
      } else this.candidateAt = null;
      return false;
    }
    if (rms >= this.thresholds.stopThreshold) this.lastSpeechAt = now;
    return now - this.lastSpeechAt >= TRAILING_SILENCE_MS;
  }
}

function percentile(samples: number[], fraction: number): number {
  const sorted = samples.filter(value => Number.isFinite(value) && value >= 0 && value <= 1).sort((a, b) => a - b);
  if (sorted.length < 30) throw new Error("Not enough audio was captured. Please try the test again.");
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

export function calibrateVoice(ambient: number[], speech: number[]): VoiceCalibration {
  const noiseFloor = percentile(ambient, 0.95);
  const speechLevel = percentile(speech, 0.75);
  if (speechLevel < 0.005 || speechLevel < noiseFloor * 2 || speechLevel - noiseFloor < 0.003) {
    throw new Error("Your voice was too close to the background noise. Move closer to the microphone or find a quieter spot, then retry.");
  }
  const gap = speechLevel - noiseFloor;
  return {
    version: 1, noiseFloor, speechLevel,
    startThreshold: Math.max(0.003, noiseFloor + gap * 0.3),
    stopThreshold: Math.max(0.002, noiseFloor + gap * 0.15),
    calibratedAt: Date.now(),
  };
}

export function readCalibration(storage?: Pick<Storage, "getItem">): VoiceCalibration | null {
  try {
    const value = JSON.parse((storage ?? window.localStorage).getItem(CALIBRATION_KEY) ?? "null");
    if (!value || value.version !== 1) return null;
    const { noiseFloor, speechLevel, startThreshold, stopThreshold, calibratedAt } = value;
    if (![noiseFloor, speechLevel, startThreshold, stopThreshold, calibratedAt].every(Number.isFinite)) return null;
    if (noiseFloor < 0 || speechLevel > 1 || speechLevel <= noiseFloor || stopThreshold < 0.002 ||
      stopThreshold <= noiseFloor || startThreshold <= stopThreshold || startThreshold >= speechLevel || calibratedAt <= 0) return null;
    return value;
  } catch { return null; }
}

export function saveCalibration(value: VoiceCalibration | null, storage?: Pick<Storage, "setItem" | "removeItem">): boolean {
  try {
    const target = storage ?? window.localStorage;
    if (value) target.setItem(CALIBRATION_KEY, JSON.stringify(value));
    else target.removeItem(CALIBRATION_KEY);
    return true;
  } catch { return false; }
}
