import { enforceApiLimit, rateLimitResponse } from "@/lib/api-guard";

export const runtime = "nodejs";

const MODEL = "models/gemini-3.5-transcribe-live";

export async function POST(request: Request) {
  const limit = await enforceApiLimit(request, "transcribe");
  if (!limit.allowed) return rateLimitResponse(limit);

  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    return Response.json({ error: "Live transcription is unavailable." }, { status: 503 });
  }

  try {
    const now = Date.now();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 10 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: ["TEXT"],
            inputAudioTranscription: { languageCodes: [] },
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Live token request failed", response.status);
      return Response.json({ error: "Live transcription is unavailable." }, { status: 502 });
    }
    const token: unknown = await response.json();
    const name = typeof token === "object" && token !== null && "name" in token ? token.name : null;
    if (typeof name !== "string" || !name) throw new Error("Missing live token");
    return Response.json({ token: name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Live token request failed", error);
    return Response.json({ error: "Live transcription is unavailable." }, { status: 502 });
  }
}
