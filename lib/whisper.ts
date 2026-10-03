import os from "node:os";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { decodeAudioToPcm, isSilent } from "@/lib/wav-decode";

// Quantized Whisper running locally via transformers.js (ONNX). Swap the
// model id here to use a different size; q8 keeps the download ~75 MB.
const MODEL_ID = "onnx-community/whisper-base.en";
const MODEL_DTYPE = "q8";

const INFERENCE_TIMEOUT_MS = 25000;

// Vercel's filesystem is read-only outside /tmp, so the Hugging Face model
// cache has to live there; locally it stays in the project for reuse.
env.cacheDir = process.env.VERCEL
  ? path.join(os.tmpdir(), "anthea-whisper-cache")
  : path.join(process.cwd(), ".cache", "whisper");

type AudioOutput = { text?: string };
type Transcriber = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<AudioOutput>;

let transcriberPromise: Promise<Transcriber> | null = null;

function getTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (
      pipeline("automatic-speech-recognition", MODEL_ID, {
        dtype: MODEL_DTYPE,
      }) as Promise<unknown>
    ).then((instance) => instance as Transcriber);
    transcriberPromise.catch(() => {
      // A failed first download must not poison the singleton; let the
      // next request retry from scratch.
      transcriberPromise = null;
    });
  }
  return transcriberPromise;
}

/** Load weights and ONNX sessions ahead of the first recorded-audio fallback. */
export async function warmTranscriber(): Promise<void> {
  await getTranscriber();
}

/** Decode an uploaded recording and transcribe it with the local Whisper model. */
export async function transcribeAudio(buffer: Buffer): Promise<string> {
  const samples = await decodeAudioToPcm(buffer);
  if (isSilent(samples)) return "";

  const transcriber = await getTranscriber();
  // No `task`/`language` options: the .en model rejects both.
  const output = await withTimeout(
    transcriber(samples, { chunk_length_s: 10, stride_length_s: 2 }),
    INFERENCE_TIMEOUT_MS,
  );
  return (output.text ?? "").trim();
}

// Model download plus CPU inference must never hang a voice request;
// the route adds its own overall deadline on top of this.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Transcription timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
