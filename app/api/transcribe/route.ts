import { NextRequest, NextResponse } from "next/server";
import {
  enforceApiLimit,
  rateLimitResponse,
  readBodyWithLimit,
} from "@/lib/api-guard";
import { transcribeAudio } from "@/lib/whisper";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-wav",
]);

// First use downloads the Whisper model (~75 MB) and CPU inference is far
// slower than a cloud call, but the budget must stay under maxDuration (60s)
// and the client's own 65s abort.
const REQUEST_TIMEOUT_MS = 45000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`Transcription timed out after ${REQUEST_TIMEOUT_MS}ms`),
      );
    }, REQUEST_TIMEOUT_MS);
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

export async function POST(req: NextRequest) {
  const rate = await enforceApiLimit(req, "transcribe");
  if (!rate.allowed) return rateLimitResponse(rate);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return NextResponse.json(
      { transcript: "", error: "Expected a multipart audio upload." },
      { status: 415 },
    );
  }

  const bytes = await readBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bytes) {
    return NextResponse.json(
      { transcript: "", error: "Audio upload exceeds the 5 MB limit." },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    const bodyBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(bodyBuffer).set(bytes);
    form = await new Response(bodyBuffer, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return NextResponse.json(
      { transcript: "", error: "Invalid multipart request body." },
      { status: 400 },
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { transcript: "", error: "No audio provided." },
      { status: 400 },
    );
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { transcript: "", error: "Audio upload exceeds the 5 MB limit." },
      { status: 413 },
    );
  }

  const mimeType = (audio.type || "audio/wav").toLowerCase().split(";")[0];
  if (!ACCEPTED_AUDIO_TYPES.has(mimeType)) {
    return NextResponse.json(
      { transcript: "", error: "Unsupported audio type." },
      { status: 415 },
    );
  }

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());

    let transcript = await withTimeout(transcribeAudio(buffer));

    // Strip accidental quotes wrapping the whole transcript
    if (
      (transcript.startsWith('"') && transcript.endsWith('"')) ||
      (transcript.startsWith("'") && transcript.endsWith("'"))
    ) {
      transcript = transcript.slice(1, -1).trim();
    }

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[/api/transcribe]", err);
    return NextResponse.json(
      {
        transcript: "",
        error: "Transcription failed.",
      },
      { status: 500 },
    );
  }
}
