# Anthea 🌿

### Talk through plant care with Cactea.

Yellow leaves? Unsure when to water? Anthea helps you turn what you notice into a practical next step. Speak to Cactea, check what it heard, and listen to a short answer—with the fuller explanation ready in chat.

**Voice first. Typing always available. No sign-in required.**

[Try Anthea](https://anthea.vercel.app) · [Run locally](#run-locally) · [Demo walkthrough](docs/voice-demo.md) · [Workspace documentation](docs/full-app.md)

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
| Keep your garden organized | Save plants, link conversations and reminders, revisit chats, and browse the introductory plant guide. |
| Make the voice your own | Turn spoken replies on or off, select an available device voice, and preview it in Settings. |

### Your first conversation

1. Open the chat and choose **Talk to Cactea**. Allow microphone access when prompted.
2. When you see **Listening — pause when finished**, say: “My monstera’s lower leaves are yellow. What should I check?”
3. Pause for about a second. Check **What I heard**, edit if needed, and choose **Send question**.
4. Answer Cactea’s follow-up questions in the same conversation. Enable **Read replies aloud** under **Voice settings** to hear its replies.
5. Turn the next step into a reminder when you’re ready. Review and confirm before saving.

Prefer a keyboard? Type your question or use a starting prompt. If microphone access or transcription fails, the chat offers retry and typing options while preserving your draft or captured words.

### Your data and expectations

- **Saved in this browser:** plants, chats, photos, and reminders use IndexedDB. Export or restore a JSON backup in Settings. There is no account or device sync; clearing browser storage can remove your records.
- **Online assistance:** answering questions uses Google Gemini and may use Perenual care lookups. Submitted questions, relevant conversation context, and attached photos are processed by these services. Cloud transcription sends recorded audio to Gemini when needed; browser speech recognition may use the browser’s own service.
- **Care reminders:** reminders appear inside Anthea. They do not send timed or background notifications. Voice-created reminders are one-time, date-based actions; a requested time requires explicit acceptance of a date-only reminder.
- **Guidance with context:** identification and diagnosis can be uncertain. Estimated watering intervals are labeled, and soil moisture should guide watering decisions. The guide is an introductory library.
- **Device-dependent voice:** microphone support and available speaking voices vary by browser and device. Microphone access requires HTTPS or localhost.

## For developers

Anthea is one Next.js application: the interface and API routes deploy together. Browser storage keeps workspace records local; server routes handle AI requests and protect API keys.

### Run locally

**Prerequisites:** Node.js 20.9 or newer, npm, a Gemini API key, and a Perenual API key for care lookups. The installed Next.js package declares the Node minimum; this project has been built with Node.js 24.

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

Open [localhost:3000](http://localhost:3000), or go directly to [the chat](http://localhost:3000/dashboard).

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

To exercise the running assistant API’s follow-up flow and separate full/brief replies:

```bash
node scripts/verify-voice-conversation.mjs
```

This script makes real provider requests. Set `ANTHEA_URL` to target another deployment. It checks API behavior; use the [live demo and recovery checklist](docs/voice-demo.md) to verify actual microphone capture, transcript editing, and audible playback on your presentation device.

### Deploy

Deploy the repository as a Next.js project on Vercel. Configure the Gemini, Perenual, and **both Upstash** environment variables for each deployment environment, then redeploy. Production AI routes return `503` if the shared limiter is unavailable or a trusted proxy cannot provide the client IP. Other hosts must supply trusted proxy headers.

Each AI endpoint allows 10 requests per IP per minute. Questions are limited to 4,000 characters; transcription audio is limited to 5 MB. Configure HTTPS for microphone access. Browser-saved records remain on each user’s device after deployment.

### Troubleshooting

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
