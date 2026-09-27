# Anthea — AI Plant Voice Agent

Hands-free voice assistant that identifies a plant from spoken traits, diagnoses issues from a local rule table, calculates a watering schedule, and looks up care data via the Perenual API.

**Status: working end-to-end.** Voice in → transcript → plant identification → symptom diagnosis → watering calculation → care data lookup → spoken reply, all confirmed working as of this README's last update. See "Known issues" below for the one open item worth checking before a live demo.

## Stack

- Next.js (App Router) + TypeScript, single deployment (frontend + serverless API routes together — no separate backend service)
- Web Speech API (live captions) + Web Audio RMS silence detection (1.2s pause auto-submits)
- Cloud speech-to-text fallback via Gemini (`POST /api/transcribe`) when browser `SpeechRecognition` is unsupported or errors (this includes Brave with Shields on, which blocks the browser's built-in STT — Brave users should either disable Shields for this site or rely on the cloud fallback / text input)
- Web Speech Synthesis for spoken replies
- Google Gemini (`@google/genai` SDK, function calling) — model is set in **one place**: the `TEXT_MODEL` constant in `lib/gemini.ts`, and must match `AUDIO_MODEL` in `app/api/transcribe/route.ts`
- Perenual API for confirmed care data (watering, sunlight, soil), used only _after_ the LLM already has a species guess — Perenual has no trait-search endpoint
- Local `data/disease-rules.json` (12 rules, keyword-overlap matched, not exact string match)

## ⚠️ On the Gemini model name — read this before debugging anything else

**Gemini model names and availability change frequently**, sometimes within days. During this project alone, `gemini-1.5-flash`, `gemini-2.5-flash`, and the entire `gemini-2.0-*` line were all retired or blocked for new users while we were actively building. `gemini-3.8-flash` worked but only had a 20-requests/day free quota and hit frequent "high demand" 503 errors.

**Current setting: `gemini-3.5-flash-lite`** — confirmed Stable (not preview) on Google's official model list as of this writing, with a 500 requests/day free-tier quota (vs. 20 for 3.8-flash).

If the assistant starts failing with every request returning the same generic fallback message, **the model name is retired again** is the first thing to check, not a code bug. To confirm:

1. Check `https://ai.google.dev/gemini-api/docs/models` for the current Stable list.
2. Test one isolated request via PowerShell/curl (see "Debugging" below) — the JSON response will contain the real Google API error, e.g. `404 not found` (retired) or `429 RESOURCE_EXHAUSTED` (quota) or `503 UNAVAILABLE` (temporary overload, already retried once automatically — see below).
3. Update the model string in **both** `lib/gemini.ts` (`TEXT_MODEL`) and `app/api/transcribe/route.ts` (`AUDIO_MODEL`) — they must stay in sync.

The code already retries automatically once on transient `503` overload errors (short backoff, not user-visible). It does **not** retry on `429` quota errors, since retrying an exhausted quota just wastes another request for no chance of success — that class of error surfaces to the user as the generic fallback message immediately.

## Setup

1. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY` (required for the assistant **and** cloud mic transcription)
   - `PERENUAL_API_KEY`
2. **Do not commit real key values into `.env.example`** — it's a template meant to be safe to commit, with placeholder text only. If you ever see a real-looking key in `.env.example`, treat it as compromised and rotate it immediately in Google AI Studio / Perenual's dashboard.
3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Voice input uses the mic with RMS silence detection. If the browser `SpeechRecognition` service fails (common `network` error, or Brave Shields blocking it), audio is recorded locally and transcribed via Gemini (`POST /api/transcribe`), then sent to the assistant. There's also a manual text-input fallback shown automatically if the mic is unsupported.

## API

`POST /api/assistant`

```json
{
  "transcript": "square stems, purple flowers, yellowing lower leaves, sandy soil"
}
```

Response:

```json
{
  "response_text": "plain spoken sentences",
  "species_candidate": "red deadnettle",
  "watering_days": 5,
  "is_estimate": false,
  "diagnosis_confidence": "high"
}
```

Keys stay server-side only. Spoken text is plain (no markdown). When Perenual cannot confirm a species, `is_estimate` is `true` and the spoken reply should hedge with "based on typical care for this type of plant" rather than presenting a guess as a real lookup.

**In practice, `is_estimate: true` shows up more often than we'd like** — see "Known issues" below.

## Known issues / open items

- **Perenual confirmation frequently misses.** In testing, a description of "square stems, purple flowers, yellowing lower leaves" returned a species guess of "sweet basil" with `is_estimate: true`, meaning `confirmSpecies()` in `lib/perenual.ts` never matched it against Perenual's `species-list` endpoint even though sweet basil is a common, real entry there. Needs investigation: check whether the LLM is calling `get_care_data` with a name that doesn't match Perenual's exact `common_name` string, and whether the scientific-name fallback in `confirmSpecies()` is actually firing. Worth adding a console log of the exact query string sent to `species-list?q=` to see what's actually being searched.
- **Species identification can be ambiguous.** The demo trait description above is genuinely mint-family-ish (basil, deadnettle, and others share square stems/purple flowers), so the LLM may not converge on the same guess every run. If you need a more reliable demo, consider a more distinctive trait description, or treat variability here as expected LLM behavior rather than a bug.
- **`app/api/debug-log/route.ts` was removed** along with the `dbgLog()` debug scaffolding that used to fire on every UI interaction (it posted to a nonexistent `127.0.0.1:7448` local debug server, cluttering Network tab logs and slowing down debugging). If you still see references to it anywhere, delete them — it was never part of the intended app.

## Deploy (Vercel)

```bash
npx vercel login
npx vercel
```

In the Vercel project settings, add `GEMINI_API_KEY` and `PERENUAL_API_KEY` as environment variables (Production + Preview). Redeploy after setting them. Keys must never ship in the client bundle.

## Demo queries

1. Primary: agricultural plant, square stems, purple flowers, yellowing lower leaves, sandy soil watering.
2. Secondary: white powdery coating on leaves (powdery mildew path).
3. Failure: unclear mumble / nonsense — expect hedge or cannot-identify reply.

Offline rule checks (no API keys): yellowing lower leaves → overwatering; powdery coating → powdery mildew; nonsense → confidence none; sandy soil base 7 days @ 22C → 5-day interval.

## Debugging tips (for co-developers)

- **When something breaks, test `/api/assistant` directly first**, bypassing the browser entirely — this isolates whether the bug is frontend or backend, and doesn't burn through your daily Gemini quota the way repeated full-UI voice attempts do (each UI attempt can trigger both `/api/transcribe` and `/api/assistant`):

  ```powershell
  try {
      Invoke-RestMethod -Uri http://localhost:3000/api/assistant -Method POST -ContentType "application/json" -Body '{"transcript":"Hello"}'
  } catch {
      $resp = $_.Exception.Response
      if ($resp) {
          $stream = $resp.GetResponseStream()
          $reader = New-Object System.IO.StreamReader($stream)
          $reader.ReadToEnd()
      } else { $_.Exception.Message }
  }
  ```

- **Double-check the file breadcrumb before pasting code.** `app/api/assistant/route.ts` and `app/api/transcribe/route.ts` both just show as "route.ts" in VS Code tabs — it's easy to paste one's content into the other by accident (this happened during development and caused a confusing, hard-to-diagnose bug where `/api/assistant` was silently running the transcribe handler's code). Check the breadcrumb path at the top of the editor before every paste into either file.
- **Check the terminal running `npm run dev` for `console.error` output**, not just the browser's Network tab — DevTools' Response panel can sometimes show stale content from a previously-selected request rather than the one you actually clicked, which caused real confusion during development. The terminal's `[/api/assistant]` or `[/api/transcribe]` prefixed log lines are the ground truth.
