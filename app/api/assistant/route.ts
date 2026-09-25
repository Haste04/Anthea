import { NextRequest, NextResponse } from "next/server";
import { runAssistant } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { transcript?: unknown };
    const transcript =
      typeof body.transcript === "string" ? body.transcript.trim() : "";

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
        { status: 400 }
      );
    }

    const payload = await runAssistant(transcript);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/assistant]", err);
    return NextResponse.json(
      {
        response_text:
          "I couldn't process that, please try again.",
        species_candidate: null,
        watering_days: null,
        is_estimate: true,
        diagnosis_confidence: "none",
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
