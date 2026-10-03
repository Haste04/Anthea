import { enforceApiLimit, rateLimitResponse, readBodyWithLimit } from "@/lib/api-guard";
import { buildPlantVocabulary, normalizeVoiceVocabulary } from "@/lib/voice-vocabulary";

export const runtime = "nodejs";

const MODEL = "models/gemini-3.5-transcribe-live";

export async function POST(request: Request) {
  const limit = await enforceApiLimit(request, "transcribe");
  if (!limit.allowed) return rateLimitResponse(limit);

  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    return Response.json({ error: "Live transcription is unavailable." }, { status: 503 });
  }

  const bytes = await readBodyWithLimit(request, 64 * 1024);
  if (!bytes) return Response.json({ error: "Voice hints are too large." }, { status: 413 });
  let supplied: unknown = {};
  if (bytes.length) {
    try { supplied = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return Response.json({ error: "Invalid voice hints." }, { status: 400 }); }
  }
  const terms = typeof supplied === "object" && supplied !== null && "vocabulary" in supplied ? supplied.vocabulary : [];
  const inputAudioTranscription = {
    languageCodes: [],
    customVocabulary: normalizeVoiceVocabulary([...normalizeVoiceVocabulary(terms), ...buildPlantVocabulary([])]),
  };
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
            inputAudioTranscription,
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
    return Response.json({ token: name, inputAudioTranscription }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Live token request failed", error);
    return Response.json({ error: "Live transcription is unavailable." }, { status: 502 });
  }
}
