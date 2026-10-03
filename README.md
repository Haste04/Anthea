# Anthea 🌿

### Talk through plant care with Cactea.

Yellow leaves? Unsure when to water? Anthea helps you turn what you notice into a practical next step. Speak to Cactea, check what it heard, and listen to a short answer—with the fuller explanation ready in chat.

**Voice first. Typing always available. No sign-in required.**

- Next.js (App Router) + TypeScript, single deployment (frontend + serverless API routes together — no separate backend service)
- Gemini Live transcription with saved plant-name vocabulary hints, browser Web Speech API recognition, and Web Audio RMS silence detection. A pause sends the question; uncertain names trigger a recording retry and review.
- Recorded speech recognition (`POST /api/transcribe`) uses Gemini 3.5 Transcribe with vocabulary hints and the existing Gemini key. Local Whisper (`onnx-community/whisper-base.en`, quantized ONNX via transformers.js) provides a fallback when the key or provider is unavailable.
- Web Speech Synthesis for spoken replies
- Google Gemini (`@google/genai` SDK, function calling) — assistant models can be set with `GEMINI_TEXT_MODEL` and `GEMINI_FALLBACK_MODEL`. Transcription models are configured separately; see [voice accuracy and microphone checks](docs/voice-accuracy.md).
- Perenual API for confirmed care data (watering, sunlight, soil), used only _after_ the LLM already has a species guess — Perenual has no trait-search endpoint
- Local `data/disease-rules.json` (12 rules, keyword-overlap matched, not exact string match)

## Tech stack

The dependency versions below reflect [package.json](package.json).

| Layer | Technologies | Purpose |
| --- | --- | --- |
| Framework and API | Next.js 16.3 App Router, Node.js route handlers | Frontend and API endpoints in one deployment |
| Interface | React 19.2, TypeScript 5 | Components, application state, and typed data |
| Styling and animation | Tailwind CSS 4, CSS Modules, custom CSS, Motion 13 | Layout, styling, and interactive visuals |
| AI assistant | Google Gemini, `@google/genai` | Text/photo reasoning, structured replies, and tool calling |
| Live transcription | Gemini Live API, WebSocket, Web Audio AudioWorklet | Stream microphone audio using short-lived tokens |
| Browser voice | Web Speech API, Web Audio API, MediaRecorder | Recognition, device speech synthesis, recording, and silence detection |
| Recorded transcription | Gemini 3.5 Transcribe; Transformers.js 4 / ONNX Whisper fallback | Vocabulary-aware recorded recognition with local recovery |
| Audio processing | `audio-decode`, `wavefile` | Decode, resample, and prepare audio for transcription |
| Plant data | Perenual API, local species mappings, JSON symptom rules | Scientific-name suggestions and care lookups |
| Image processing | Sharp, browser canvas | Resize and validate plant photos |
| Storage | IndexedDB, localStorage, JSON backups | Browser workspace records and preferences |
| Rate limiting | Upstash Redis, `@upstash/ratelimit` | Shared production API limits |
| Quality checks | Node.js test runner, `fake-indexeddb`, ESLint 9, TypeScript | Behavior/storage tests, linting, and type checks |
| Deployment | Vercel-compatible Next.js deployment | Host the interface and server routes together |

## Meet your plant-care companion

Cactea keeps the conversation approachable: visible listening, thinking, and speaking states; one question at a time; and advice you can act on.

| What you want to do | How Anthea helps |
| --- | --- |
| Ask without typing | Start with **Talk to Cactea**, speak naturally, then pause to review your words. |
| Correct a misheard question | Use the compact **What I heard** card to edit, record again, or send. |
| Understand a plant problem | For yellow leaves, Cactea asks about missing soil moisture, watering, and light details before suggesting a cause. |
| Get the useful part quickly | Read the main advice and highlighted **Next step**. Open **Details** or choose **Hear more** for the full explanation. |
| Show what you see | Attach a plant photo and ask a question about it. |
| Follow through on advice | Say “Remind me to check the soil tomorrow,” review the care action, and choose **Confirm reminder**. |
| Keep your garden organized | Save plant photos, species, location, and notes; link conversations and reminders; search, rename, and revisit chats. |
| Continue care across conversations | Cactea uses saved plant details and up to four recent successful exchanges from linked chats. Messages and photos retain their plant association when you switch plants; ambiguous names require a selection. |
| Find a scientific name | A local list of 50 plants suggests names without API calls. Broad names offer choices, and **Look up species** queries Perenual for other names. Manual entry remains available. |
| Back up your workspace | Export or restore validated JSON backups in Settings. Records stay in this browser; voice and care preferences are configured separately. |
| Make the voice your own | Turn spoken replies on or off, select an available device voice, and preview it in Settings. |

### Your first conversation

1. Open `/dashboard` and choose **Talk to Cactea**, or type a plant-care question.
2. Speak naturally, then pause to review the transcript. Edit it or record again if needed, then send.
3. Read the advice and **Next step**, listen to the brief reply, or choose **Hear more** for the fuller explanation.

Prefer a keyboard? Type your question or use a starting prompt. If microphone access or transcription fails, the chat offers retry and typing options while preserving your draft or captured words.

### Run locally

1. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY` (required for the assistant and Gemini Live transcription tokens; recorded-audio Whisper fallback needs no separate key)
   - `PERENUAL_API_KEY`
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for production API rate limiting. Local development uses a process-local limiter when these are omitted; production API requests fail closed with `503` until both values are configured.
2. **Do not commit real key values into `.env.example`** — it's a template meant to be safe to commit, with placeholder text only. If you ever see a real-looking key in `.env.example`, treat it as compromised and rotate it immediately in Google AI Studio / Perenual's dashboard.
3. Install and run:

```bash
git clone https://github.com/Haste04/Anthea.git
cd Anthea
npm install
```

Copy `.env.example` to `.env.local` and replace the placeholders. In PowerShell:

```powershell
Copy-Item .env.example .env.local
```

For local development without Redis, leave both Upstash variables empty rather than keeping the template’s placeholder values.

```bash
npm run dev
```

Open `http://localhost:3000`. The workspace includes `/home`, `/dashboard`, `/plants`, and `/settings`.

### Your data and expectations

Plants, chats, reminders, and photos are saved in IndexedDB in the current browser and site origin, without cross-device sync. Voice and care preferences use localStorage. Export a backup before clearing site data; restoring a backup replaces the workspace collections after validation. Questions, relevant plant context, photos, and audio are sent to the services used to answer or transcribe them.

Reminders are date-based in-app checks, without background notifications. Spoken or typed reminder requests require confirmation before saving. Completing a recurring reminder advances its due date to the next occurrence after today.

The `/api/assistant` and `/api/transcribe` endpoints are limited to 10 requests per IP per minute. Assistant transcripts are capped at 4,000 characters; audio uploads are capped at 5 MB and restricted to supported audio MIME types. Production uses the shared Upstash Redis limiter so limits apply across serverless instances.

Voice input uses the mic with RMS silence detection. Gemini Live streams captions using a short-lived token from `POST /api/transcribe/live-token`. Live and recorded Gemini transcription receive up to 100 plant-name hints, prioritizing saved names and species. Uncertain names trigger a complete-recording retry, then require confirmation or editing if still unresolved. Browser recognition and local Whisper provide recovery paths. See [voice accuracy](docs/voice-accuracy.md) for limitations and a repeatable microphone test.

The Whisper model (~75 MB int8) is downloaded from Hugging Face on the first transcription request and cached — in `.cache/whisper/` locally (git-ignored) and in `/tmp` on Vercel (per-instance, so a cold function re-downloads it). The model id and quantization live in `lib/whisper.ts`. Silent recordings are detected by RMS before the model runs, so an empty room returns `{"transcript": ""}` instead of a hallucinated sentence.

### Configuration

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side key for assistant replies, live transcription tokens, and recorded transcription. |
| `PERENUAL_API_KEY` | Server-side key for species confirmation and care lookups. |
| `GEMINI_TEXT_MODEL` | Assistant model; defaults to the value shown in `.env.example`. Requires function calling. |
| `GEMINI_FALLBACK_MODEL` | Fallback after repeated provider overload. Set empty to disable. |
| `UPSTASH_REDIS_REST_URL` | Shared production rate limiter connection. |
| `UPSTASH_REDIS_REST_TOKEN` | Shared production rate limiter credential. |

Keep real keys in `.env.local` or your host’s secret environment settings. Do not commit them or expose them through `NEXT_PUBLIC_` variables. Live transcription has a separate model configured in `lib/live-transcription.ts` and `app/api/transcribe/live-token/route.ts`; recorded transcription uses `lib/whisper.ts`. Changing the assistant model does not change those transcription models. Provider model availability and quotas depend on your account and can change.

### How it works

```text
Talk → microphone capture + silence detection → transcript review
                                                    ↓ Send question
Type or attach a photo ──────────────────────→ assistant API
                                                    ↓
                                  care context + tools + AI response
                                                    ↓
                                  main advice + next step + details
                                                    ↓
                                  brief spoken reply → follow-up

“Remind me…” → local proposal → explicit confirmation → saved reminder
```

- **Interface:** Next.js App Router, React, TypeScript, CSS, and Cactea’s state-driven mascot.
- **Listening:** Gemini Live captions, browser speech recognition, recorded audio for server-side Whisper fallback, and Web Audio silence detection. A pause opens review; it does not automatically send the question.
- **Reasoning:** deterministic yellow-leaf follow-ups gather missing context; Gemini can call species, symptom-rule, watering, and care-data tools.
- **Speaking:** browser speech synthesis uses the selected device voice. Detailed and short spoken answers are kept separately; the UI marks speaking only when playback starts.
- **Persistence:** IndexedDB stores workspace records; localStorage stores care and voice preferences. Workspace backups exclude those preferences.
- **Reliability:** bounded requests, shared production rate limits, provider overload retries, explicit error recovery, and confirmation before saving voice-created reminders.

### Find your way around

| Location | Responsibility |
| --- | --- |
| `app/dashboard/` | Voice conversation, transcript review, answer layout, Cactea companion, and reminder proposals. |
| `app/components/workspace/` | Shared navigation, workspace records, and supporting pages. |
| `app/api/assistant/route.ts` | Validates questions, history, and photos before requesting an answer. |
| `app/api/transcribe/route.ts` | Validates recorded audio and runs server-side Whisper transcription. |
| `app/api/transcribe/live-token/route.ts` | Issues short-lived Gemini Live transcription tokens. |
| `app/api/species/route.ts` | Optional Perenual scientific-name lookup. |
| `lib/live-transcription.ts`, `lib/whisper.ts` | Streaming captions and server-side recorded-audio transcription. |
| `lib/plant-memory.ts`, `lib/plant-species.ts` | Saved plant context and local scientific-name suggestions. |
| `lib/gemini.ts` | Assistant prompt, tool calling, and provider fallback. |
| `lib/care-dialogue.ts` | Yellow-leaf follow-up flow and brief answer handling. |
| `lib/reminder-intent.ts` | Parses reminder commands and validates proposed actions. |
| `lib/workspace-data.ts` | Browser persistence and backup validation. |
| `lib/api-guard.ts` | Request bounds and local/distributed rate limiting. |
| `tests/` | Automated coverage for conversations, storage, reminders, voice behavior, and API handling. |

Before modifying Next.js code, follow [AGENTS.md](AGENTS.md) and read the relevant bundled guides in `node_modules/next/dist/docs/`.

### Validate changes

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

For a live API check with the development server running:

```bash
node scripts/verify-voice-conversation.mjs
```

This script makes real provider requests. Set `ANTHEA_URL` to target another deployment. It checks API behavior; use the [live demo and recovery checklist](docs/voice-demo.md) to verify actual microphone capture, transcript editing, and audible playback on your presentation device.

### Deploy

Deploy the repository as a Next.js project on Vercel. Configure the Gemini, Perenual, and **both Upstash** environment variables for each deployment environment, then redeploy. Production AI routes return `503` if the shared limiter is unavailable or a trusted proxy cannot provide the client IP. Other hosts must supply trusted proxy headers.

Each AI endpoint allows 10 requests per IP per minute. Questions are limited to 4,000 characters; transcription audio is limited to 5 MB. Configure HTTPS for microphone access. Browser-saved records remain on each user’s device after deployment.

### Troubleshooting

Test `/api/assistant` directly to isolate API failures from interface problems. Assistant and live transcription use Gemini services; `/api/transcribe` runs Whisper on the application server. Inspect server logs for model access, quota, and provider availability errors.

| Symptom | First thing to check |
| --- | --- |
| Microphone does not start | Site permission and HTTPS/localhost; use **Retry microphone** or **Type instead**. |
| Words need correction | Choose **Edit** in **What I heard**, or **Record again**. |
| Reply is visible but silent | **Voice settings**, device volume, and **Hear brief answer**. |
| Assistant requests fail | Server logs, API keys, model access, and provider quota. |
| Production returns `503` | Upstash configuration and trusted proxy IP headers, then provider availability. |
| Care data is estimated | Species confirmation may be ambiguous or unavailable; estimates remain labeled. |
| Saved records are missing | Check the browser and site origin used; restore a previously exported backup. |

For contribution ideas, start with a concrete plant-care problem, include steps to reproduce, and describe the expected behavior. For voice changes, include the browser/device and results from a real microphone-and-speaker rehearsal.
