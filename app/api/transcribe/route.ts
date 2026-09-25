import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

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
        { status: 400 }
      );
    }

    const mimeType = audio.type || "audio/wav";
    const buffer = Buffer.from(await audio.arrayBuffer());
    const base64 = buffer.toString("base64");

    const genAI = new GoogleGenerativeAI(getApiKey());
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
      {
        text: "Transcribe the spoken audio into plain English text only. Do not add quotes, labels, markdown, or commentary. If the audio is silent or unintelligible, return an empty string.",
      },
    ]);

    let transcript = "";
    try {
      transcript = (result.response.text() ?? "").trim();
    } catch {
      transcript = "";
    }

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
      { status: 500 }
    );
  }
}
