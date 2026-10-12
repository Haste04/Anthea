# Anthea 🌿

### Talk through plant care with Cactea.

Yellow leaves? Unsure when to water? Anthea helps you turn what you notice into a practical next step. Speak to Cactea, check what it heard, and listen to a short answer—with the fuller explanation ready in chat.

**Voice first. Typing always available. No sign-in required.**

- Next.js (App Router) + TypeScript, single deployment (frontend + serverless API routes together — no separate backend service)
- Web Speech API (live captions) + Web Audio RMS silence detection (1.2s pause auto-submits)
- Cloud speech-to-text fallback via a self-hosted Whisper model (`POST /api/transcribe`, transformers.js running `onnx-community/whisper-base.en` with int8 ONNX weights inside the serverless function — no transcription API key) when browser `SpeechRecognition` is unsupported or errors (this includes Brave with Shields on, which blocks the browser's built-in STT — Brave users should either disable Shields for this site or rely on the cloud fallback / text input)
- Web Speech Synthesis for spoken replies
- Google Gemini (`@google/genai` SDK, function calling) — assistant models can be set with `GEMINI_TEXT_MODEL` and `GEMINI_FALLBACK_MODEL`. Gemini is assistant-only; transcription runs on the local Whisper model configured in `lib/whisper.ts`.
- Perenual API for confirmed care data (watering, sunlight, soil), used only _after_ the LLM already has a species guess — Perenual has no trait-search endpoint
- Local `data/disease-rules.json` (12 rules, keyword-overlap matched, not exact string match)

## Documentation

The full documentation set lives in the [`docs/`](docs/README.md) folder:

| Guide | What it covers |
| --- | --- |
| [Documentation home](docs/README.md) | Overview, purpose, capabilities, quick facts, and the full index. |
| [Setup guide](docs/setup.md) | Install, environment variables, local run, first conversation, Vercel deploy, troubleshooting. |
| [Architecture](docs/architecture.md) | Tech stack, voice pipeline, reasoning pipeline, persistence, code map. |
| [API reference](docs/api-reference.md) | Every endpoint, request/response shapes, limits, and rate limiting. |
| [Development guide](docs/development.md) | Validation commands, test suite, debugging, and contribution notes. |

Feature walkthroughs also live in [`docs/full-app.md`](docs/full-app.md),
[`docs/voice-demo.md`](docs/voice-demo.md), and
[`docs/plant-species.md`](docs/plant-species.md).

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
| Keep your garden organized | Save plants, link conversations and reminders, revisit chats. |
| Make the voice your own | Turn spoken replies on or off, select an available device voice, and preview it in Settings. |
| Choose a comfortable appearance | Open **Settings → Appearance** and choose **Light** or **Dark**. Light is the default; your choice is saved in this browser and applies across pages. If browser storage is blocked, it applies for the current visit. |

### Cactea's animations

Cactea uses layered artwork so its eyes, mouth, arms, and body can move independently.

| Page / state | Animation and trigger |
| --- | --- |
| Home — idle | Gentle floating with a moving shadow, breathing, blinking, an occasional right-arm wave, and a recurring smile. Small automatic hops occur about every 15–25 seconds. |
| Home — interaction | Its eyes smoothly follow the mouse and return to center when the pointer leaves the window. Click or tap Cactea to make it hop. |
| Home — drag and toss | Drag the large mascot with a mouse or touch, then release to toss it. It falls and bounces within the window, settles, and automatically returns to its starting spot. Press **Escape** to bring it back sooner. |
| Chat — idle | Blinking, a subtle bounce and wave, recurring smiles, and mouse-following eyes. Hovering lifts and tilts the mascot; clicking or tapping makes it jump. |
| Chat — listening | An attentive body tilt, slightly enlarged eyes, and an arm movement. The surrounding aura responds to microphone volume. |
| Chat — thinking | A slow float with a tilted body, a hand-to-face pose, upward glances, and a thoughtful mouth while an assistant reply is pending. Eye tracking and click-to-jump pause during this state. |
| Chat — speaking | Alternating mouth shapes and a right-arm gesture accompany spoken playback. |
| Chat — feedback poses | The model supports a success hop with raised arms and closed eyes; request errors trigger a questioning tilt with worried brows. |
| Chat — off-topic reply | An angry shake, angled brows, and a frown reinforce the prompt to return to plant questions. |
| Chat — “six seven” | Recognizing “six seven,” “6 7,” or “67” in a voice transcript triggers a brief body sway with alternating arm movements. |
| Chat — “Lifewood” | Recognizing “Lifewood” in a voice transcript triggers a smiling wave and two growing leaves. |
| Chat — barrel-roll Easter egg | While idle, click or tap Cactea 15 times within five seconds, with no gap longer than 800 ms, to trigger a full 360° roll. |

Animations respect the device's **Reduce motion** preference: continuous motion and eye tracking are disabled, conversation states retain readable poses, and click-triggered jumps or rolls become a brief opacity pulse. Dragging remains available, with toss physics and the animated return disabled. Timed smiles, automatic hops, and eye tracking pause when the tab is hidden.

The shared implementation lives in [`app/components/cactea/`](app/components/cactea/), with the home scene and drag physics in [`app/home/`](app/home/), mouse tracking in [`useHomeMascotFollow.ts`](app/components/workspace/useHomeMascotFollow.ts), and chat state selection in [`ChatDashboard.tsx`](app/dashboard/ChatDashboard.tsx).

### Your first conversation

1. Check `https://ai.google.dev/gemini-api/docs/models` for the current Stable list.
2. Test one isolated request via PowerShell/curl (see "Debugging" below), then inspect the server log for `404` (model unavailable), `429 RESOURCE_EXHAUSTED` (quota), or `503 UNAVAILABLE` (temporary overload). Public responses use safe messages instead of exposing raw provider errors.
3. Set `GEMINI_TEXT_MODEL` if you need a different assistant model. It must support function calling. Transcription does not go through Gemini — it runs on the local Whisper model in `lib/whisper.ts`.

Prefer a keyboard? Type your question or use a starting prompt. If microphone access or transcription fails, the chat offers retry and typing options while preserving your draft or captured words.

### Your data and expectations

1. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY` (required for the assistant; mic transcription runs locally on Whisper and needs no key)
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

The `/api/assistant` and `/api/transcribe` endpoints are limited to 10 requests per IP per minute. Assistant transcripts are capped at 4,000 characters; audio uploads are capped at 5 MB and restricted to supported audio MIME types. Production uses the shared Upstash Redis limiter so limits apply across serverless instances.

Voice input uses the mic with RMS silence detection. If the browser `SpeechRecognition` service fails (common `network` error, or Brave Shields blocking it), audio is recorded locally and transcribed by Whisper (`POST /api/transcribe`), then sent to the assistant. There's also a manual text-input fallback shown automatically if the mic is unsupported.

The Whisper model (~75 MB int8) is downloaded from Hugging Face on the first transcription request and cached — in `.cache/whisper/` locally (git-ignored) and in `/tmp` on Vercel (per-instance, so a cold function re-downloads it). The model id and quantization live in `lib/whisper.ts`. Silent recordings are detected by RMS before the model runs, so an empty room returns `{"transcript": ""}` instead of a hallucinated sentence.

### Configuration

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side key for assistant replies and cloud transcription. |
| `PERENUAL_API_KEY` | Server-side key for species confirmation and care lookups. |
| `GEMINI_TEXT_MODEL` | Assistant model; defaults to the value shown in `.env.example`. Requires function calling. |
| `GEMINI_FALLBACK_MODEL` | Fallback after repeated provider overload. Set empty to disable. |
| `UPSTASH_REDIS_REST_URL` | Shared production rate limiter connection. |
| `UPSTASH_REDIS_REST_TOKEN` | Shared production rate limiter credential. |

Keep real keys in `.env.local` or your host’s secret environment settings. Do not commit them or expose them through `NEXT_PUBLIC_` variables. Cloud transcription has a separate `AUDIO_MODEL` constant in `app/api/transcribe/route.ts`; changing the text model does not change that setting. Provider model availability and quotas depend on your account and can change.

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
- **Listening:** browser speech recognition for live captions, recorded audio for Gemini transcription fallback, and Web Audio silence detection. A pause opens review; it does not automatically send the question.
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
| `app/api/transcribe/route.ts` | Validates recorded audio and requests cloud transcription. |
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

In the Vercel project settings, add `GEMINI_API_KEY` and `PERENUAL_API_KEY` as environment variables (Production + Preview). Redeploy after setting them. Keys must never ship in the client bundle. Transcription needs no environment variable — the Whisper model downloads at runtime to the function's `/tmp`.

This script makes real provider requests. Set `ANTHEA_URL` to target another deployment. It checks API behavior; use the [live demo and recovery checklist](docs/voice-demo.md) to verify actual microphone capture, transcript editing, and audible playback on your presentation device.

### Deploy

Deploy the repository as a Next.js project on Vercel. Configure the Gemini, Perenual, and **both Upstash** environment variables for each deployment environment, then redeploy. Production AI routes return `503` if the shared limiter is unavailable or a trusted proxy cannot provide the client IP. Other hosts must supply trusted proxy headers.

Each AI endpoint allows 10 requests per IP per minute. Questions are limited to 4,000 characters; transcription audio is limited to 5 MB. Configure HTTPS for microphone access. Browser-saved records remain on each user’s device after deployment.

- **When something breaks, test `/api/assistant` directly first**, bypassing the browser entirely — this isolates whether the bug is frontend or backend, and only `/api/assistant` burns Gemini quota (`/api/transcribe` runs on the local Whisper model):

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
