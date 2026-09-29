import { NextRequest, NextResponse } from "next/server";
import {
  enforceApiLimit,
  rateLimitResponse,
  readBodyWithLimit,
} from "@/lib/api-guard";
import { isProviderOverloaded, runAssistant } from "@/lib/gemini";
import { parsePlantProfile } from "@/lib/plant-profile";
import { parseConversationHistory } from "@/lib/conversation";
import { validPhoto } from "@/lib/workspace-data";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 2_900_000;
const MAX_TRANSCRIPT_LENGTH = 4_000;

export async function POST(req: NextRequest) {
  const rate = await enforceApiLimit(req, "assistant");
  if (!rate.allowed) return rateLimitResponse(rate);

  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request body." }, { status: 415 });
  }

  const bytes = await readBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bytes) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const transcript =
    typeof body === "object" && body !== null && "transcript" in body &&
    typeof body.transcript === "string"
      ? body.transcript.trim()
      : "";

  if (!transcript) {
    return NextResponse.json(
      {
        response_text:
          "I did not catch any words. Please try speaking again.",
        species_candidate: null,
        watering_days: null,
        is_estimate: true,
        diagnosis_confidence: "none",
      },
      { status: 400 },
    );
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return NextResponse.json(
      { error: `Transcript must be ${MAX_TRANSCRIPT_LENGTH} characters or fewer.` },
      { status: 413 },
    );
  }

  const rawHistory = typeof body === "object" && body !== null && "history" in body ? body.history : undefined;
  const history = parseConversationHistory(rawHistory);
  if (!history) return NextResponse.json({ error: "Invalid conversation history." }, { status: 400 });

  const record = body as Record<string, unknown>;
  if (record.photo !== undefined && !validPhoto(record.photo)) return NextResponse.json({ error: "Choose a valid JPEG, PNG or WebP photo under 2 MB." }, { status: 400 });
  if (record.plantContext !== undefined && (typeof record.plantContext !== 'string' || record.plantContext.length > 2600)) return NextResponse.json({ error: "Invalid plant context." }, { status: 400 });
  let photo = record.photo as string | undefined;
  if (photo) {
    try {
      // Decode and re-encode rather than trusting an image signature alone.
      const bytes = Buffer.from(photo.split(',')[1], 'base64');
      const normalized = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      photo = `data:image/jpeg;base64,${normalized.toString('base64')}`;
    } catch { return NextResponse.json({ error: "This photo could not be read. Try another JPEG, PNG or WebP image." }, { status: 400 }); }
  }

  try {
    const rawProfile = typeof body === "object" && body !== null && "profile" in body ? body.profile : null;
    const profile = parsePlantProfile(rawProfile);
    if (rawProfile != null && !profile) {
      return NextResponse.json({ error: "Invalid plant-care preferences." }, { status: 400 });
    }
    const payload = await runAssistant(transcript, profile, history, photo, record.photoContext === true, record.plantContext as string | undefined);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/assistant]", err);
    const overloaded = isProviderOverloaded(err);
    return NextResponse.json(
      {
        response_text: overloaded
          ? "Anthea is temporarily busy. Please wait a moment and try again."
          : "I couldn't process that, please try again.",
        species_candidate: null,
        watering_days: null,
        is_estimate: true,
        diagnosis_confidence: "none",
        error: overloaded ? "Assistant temporarily unavailable." : "Assistant request failed.",
      },
      { status: overloaded ? 503 : 500, headers: overloaded ? { "Retry-After": "30" } : undefined },
    );
  }
}
