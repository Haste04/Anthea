# Anthea — Setup Guide

This guide walks you through running Anthea locally and deploying it to Vercel.

## Prerequisites

- **Node.js** (v20.9.0 or later — required by Next.js 16; LTS v22 recommended)
  and **npm**.
- **A Google AI Studio API key** (`GEMINI_API_KEY`) — required for the
  assistant. Get one at <https://aistudio.google.com/apikey>. The free tier is
  sufficient.
- **A Perenual API key** (`PERENUAL_API_KEY`) — used to confirm species and
  fetch real care data (watering, sunlight, soil). Get one at
  <https://perenual.com>. The free tier is sufficient.
- **Optional: an Upstash Redis database** for production rate limiting.
  Local development works without it (a process-local limiter is used instead).

You do **not** need a transcription API key: mic transcription runs on a
self-hosted Whisper model inside the app.

## 1. Get the code

```bash
git clone https://github.com/Haste04/Anthea.git
cd Anthea
npm install
```

## 2. Configure environment variables

Copy the template and open it in an editor:

```powershell
Copy-Item .env.example .env.local
```

Then replace the placeholders with your real values.

> ⚠️ **Never** put real key values into `.env.example` — that file is meant to
> be safe to commit. Real keys belong in `.env.local` (git-ignored) or your
> host's secret environment settings. If you ever see a real-looking key in
> `.env.example`, treat it as compromised and rotate it immediately.

### Environment variable reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | ✅ Required | Server-side key for assistant replies (and live-transcription token issuance). Transcription itself is local and needs no key. |
| `PERENUAL_API_KEY` | ✅ Required | Server-side key for species confirmation and real care-data lookups. |
| `GEMINI_TEXT_MODEL` | Optional | Assistant model. Defaults to `gemini-3.5-flash-lite`. Must support function calling. |
| `GEMINI_FALLBACK_MODEL` | Optional | Used once after repeated provider overload (`503`). Defaults to `gemini-3.1-flash-lite`. Set empty to disable. |
| `UPSTASH_REDIS_REST_URL` | Prod only | Shared production rate-limiter connection. |
| `UPSTASH_REDIS_REST_TOKEN` | Prod only | Shared production rate-limiter credential. |

**For local development without Redis**, leave both Upstash variables empty
rather than keeping the template's placeholder values. The app then uses a
process-local rate limiter.

Check <https://ai.google.dev/gemini-api/docs/models> for the current Stable
list before changing `GEMINI_TEXT_MODEL`. The text model does **not** affect
transcription — that model is fixed in `lib/whisper.ts`.

## 3. Run locally

```bash
npm run dev
```

Open <http://localhost:3000>. The app has several areas:

| Route | What it is |
| --- | --- |
| `/` | Public landing page. |
| `/welcome` | First-run welcome flow. |
| `/home` | Botanical workspace overview. |
| `/dashboard` | The Cactea voice chat — start here. |
| `/plants` | My Plants — saved plant records. |
| `/settings` | Voice settings and JSON backups. |

### First conversation

1. Open `/dashboard` over **HTTPS or localhost** (microphone access requires a
   secure context).
2. Allow microphone permission when prompted. Keep an eye on **Voice settings**
   → **Read replies aloud** and check your speaker volume.
3. Press the mic button and speak naturally — for example:
   *"My Monstera has yellowing lower leaves. What should I check?"*
4. Pause for about a second. Cactea shows a **Review your question** card —
   edit the words if needed, then choose **Send question**.
5. Answer Cactea's follow-up care questions (soil feel, last watering, light)
   one turn at a time.
6. Read the chat answer with its highlighted **Next step**, or choose
   **Hear more** to listen to the full explanation.
7. Try a reminder: *"Remind me to check the soil tomorrow."* Confirm the
   proposal card to save it.

### Transcription without a key

When the browser's built-in `SpeechRecognition` is unsupported or errors out
(which includes Brave with Shields enabled), audio is recorded locally and
transcribed by Whisper through `POST /api/transcribe`:

- Model: `onnx-community/whisper-base.en` (int8/"q8" ONNX, ~75 MB).
- The model downloads from Hugging Face on the first transcription request and
  is cached in `.cache/whisper/` locally (git-ignored) and in `/tmp` on Vercel
  (per serverless instance, so a cold function re-downloads it).
- Silent recordings are detected by RMS **before** the model runs, so an empty
  room returns an empty transcript instead of a hallucinated sentence.

## 4. Validate your setup

Run the project's quality gates:

```bash
npm test          # Node test runner
npm run lint      # ESLint
npx tsc --noEmit --incremental false
npm run build     # Production build
```

To exercise the real API (assistant + transcription service without a browser):

```bash
node scripts/verify-voice-conversation.mjs
```

This makes real provider requests and checks the soil → watering → light
triage flow. Set `ANTHEA_URL` to target another deployment. It does **not**
simulate microphone input or speaker output — do a browser rehearsal too
(see [voice-demo.md](voice-demo.md)).

## 5. Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel as a Next.js project.
2. In **Project → Settings → Environment Variables**, add for **Production**
   and **Preview**:
   - `GEMINI_API_KEY`
   - `PERENUAL_API_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - (optionally `GEMINI_TEXT_MODEL` / `GEMINI_FALLBACK_MODEL`)
3. Redeploy after setting them. Keys live server-side only and must never ship
   in the client bundle.
4. Make sure HTTPS is enabled (Vercel provides it automatically) — microphone
   access requires a secure context.

### Production behavior to know

- Every AI endpoint allows **10 requests per IP per minute**. The limits apply
  across serverless instances because production uses the shared Upstash Redis
  limiter.
- Production AI routes return **`503`** if the shared limiter is unavailable or
  a trusted proxy cannot provide the client IP (the app fails **closed** before
  spending paid provider quota).
- Transcripts are capped at **4,000 characters**; audio uploads at **5 MB**;
  photos must be valid JPEG/PNG/WebP and are re-encoded server-side.
- The Whisper model re-downloads on cold serverless instances, so the first
  transcription may be slow. The route has a hard deadline (45s) and the client
  aborts at 65s.
- Saved workspace records live in each browser's IndexedDB and are not synced
  between devices.

## Troubleshooting

| Symptom | First thing to check |
| --- | --- |
| Microphone does not start | Site permission and HTTPS/localhost. Use **Retry microphone** or **Type instead**. |
| Words are misheard | Choose **Edit** in the **What I heard** card, or **Record again**. |
| Reply is visible but silent | **Voice settings**, device volume, and **Hear brief answer**. |
| Assistant requests fail | Server logs, `GEMINI_API_KEY`, model access, and provider quota. |
| Production returns `503` | Upstash configuration and trusted proxy IP headers, then provider availability. |
| Care data says "estimate" | Species confirmation was ambiguous or unavailable; estimates are always labeled. |
| Saved records are missing | Check the browser and site origin used; restore a previously exported backup. |
| First transcription is slow | Expected on a cold instance (model download). Retry or keep the instance warm. |

When something breaks on the backend, **test `/api/assistant` and
`/api/transcribe` directly first** (see the [API reference](api-reference.md))
— this isolates whether the bug is frontend or backend, and only
`/api/assistant` burns Gemini quota.

---

*Back to the [documentation home](README.md).*