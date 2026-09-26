import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Check https://ai.google.dev/gemini-api/docs/models before deploying —
// this must match the model constant used in lib/gemini.ts.
const AUDIO_MODEL = "gemini-3.8-flash";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return key;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json(
        { transcript: "", error: "No audio provided" },
        { status: 400 },
      );
    }

    const mimeType = audio.type || "audio/wav";
    const buffer = Buffer.from(await audio.arrayBuffer());
    const base64 = buffer.toString("base64");

    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const result = await ai.models.generateContent({
      model: AUDIO_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: "Transcribe the spoken audio into plain English text only. Do not add quotes, labels, markdown, or commentary. If the audio is silent or unintelligible, return an empty string.",
            },
          ],
        },
      ],
    });

    let transcript = (result.text ?? "").trim();

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
        error: err instanceof Error ? err.message : "Transcription failed",
      },
      { status: 500 },
    );
  }
}
