# Anthea Documentation 🌿

> **Talk through plant care with Cactea.**

Anthea is a **voice-first AI plant-care companion**. Yellow leaves? Unsure when to
water? Anthea turns what you notice into a practical next step: speak to Cactea,
review what it heard, and listen to a short answer — with the fuller explanation
ready in chat. Typing is always available and **no sign-in is required**.

This is the central hub for everything about Anthea: what it does, how it works,
how to set it up, and how to build on it.

---

## What is Anthea?

Anthea is a single Next.js application (frontend + serverless API in one
deployment) that lets people talk through plant care hands-free. Its mascot,
**Cactea**, listens, reasons, and speaks back.

| Purpose pillar | What Anthea does |
| --- | --- |
| **Ask without typing** | Talk to Cactea, pause, review the transcript, then send. |
| **Diagnose problems** | Gathers missing context (soil, watering, light) before suggesting a cause — one question per turn. |
| **Identify plants** | Guesses a species from spoken physical traits, then confirms it and pulls real care data from Perenual. |
| **Give actionable advice** | Main advice + highlighted **Next step** in chat, plus a short spoken reply. |
| **Show what you see** | Attaches a plant photo to a question; photos are re-encoded server-side before reaching the model. |
| **Keep your garden organized** | Saves plants, chats, and reminders in the browser's IndexedDB. |
| **Follow through** | Turns "Remind me to check the soil tomorrow" into a reviewable, confirmable in-app reminder. |
| **Be honest about data** | Care numbers from a confirmed lookup are labeled separately from LLM estimates (`is_estimate`). |

## Quick facts

| | |
| --- | --- |
| Project name | `plant-voice-agent` (v0.1.0) |
| Repository | [github.com/Haste04/Anthea](https://github.com/Haste04/Anthea) |
| Primary stack | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS |
| Runtime | Single Vercel deployment (frontend + serverless API routes) |
| Assistant brain | Google Gemini with function calling |
| Speech-to-text | Browser Web Speech API, with a self-hosted Whisper fallback (no STT API key) |
| Speech-to-speech | Web Speech Synthesis for spoken replies |
| Plant care data | Perenual API (watering, sunlight, soil) |
| Health data | Local rule table (`data/disease-rules.json`, 12 rules) |
| Persistence | IndexedDB (workspace records) + localStorage (preferences) |
| Rate limiting | Upstash Redis in production; process-local limiter in development |
| Testing | Node's built-in test runner (`node --test`) |

## Capabilities at a glance

- **Voice-first conversation** — live captions, silence detection, transcript
  review before sending, and a typing fallback.
- **Reliable transcription** — browser `SpeechRecognition` when available;
  self-hosted Whisper (`onnx-community/whisper-base.en`, int8 ONNX) otherwise
  (including Brave with Shields enabled).
- **Plant identification** — from spoken physical traits via the LLM, confirmed
  against Perenual.
- **Symptom diagnosis** — keyword-overlap matching against a local 12-rule table,
  never presented as fact without supporting care context.
- **Care advice** — watering intervals adjusted for soil and climate, with a
  clear estimate vs. confirmed–lookup label.
- **Photo questions** — attach a JPEG/PNG/WebP photo; follow-ups reuse the
  conversation's latest photo.
- **Plants & memory** — plant records (photos, species, location, notes) and
  Cactea reusing saved notes and recent successful exchanges per plant.
- **Reminders** — one-time, date-only in-app reminders with explicit
  confirmation before saving; watering reminders prompt a soil check.
- **Voice settings** — turn spoken replies on/off and pick a device voice with a
  preview.
- **Backups** — export/import JSON workspace backups with validation.

## The documentation index

| Guide | What it covers |
| --- | --- |
| [Setup guide](setup.md) | Prerequisites, installation, environment variables, running locally, first conversation, Vercel deployment, troubleshooting. |
| [Architecture](architecture.md) | Tech stack details, system design, the voice pipeline, the reasoning pipeline, persistence model, and the code map. |
| [API reference](api-reference.md) | Every endpoint (`/api/assistant`, `/api/transcribe`, `/api/transcribe/live-token`, `/api/species`), request/response shapes, limits, and rate limiting. |
| [Development guide](development.md) | Validation commands, the test suite, the real-API verification script, debugging, and contribution notes. |

### Feature-focused references

| Document | What it covers |
| --- | --- |
| [Full app walkthrough](full-app.md) | The complete botanical workspace: chat memory, plant records, species lookup, reminders, settings, and backups. |
| [Live voice demo](voice-demo.md) | A rehearsed three-minute presentation plus a failure-recovery checklist for live microphone + speaker testing. |
| [Species lookup](plant-species.md) | The local species catalog: coverage, sources, and the Perenual lookup path. |
| [Cactea plant memory design](superpowers/specs/2026-09-30-cactea-plant-memory-design.md) | Design spec for per-plant memory and linked reminders. |

## Getting started in 30 seconds

```bash
git clone https://github.com/Haste04/Anthea.git
cd Anthea
npm install
Copy-Item .env.example .env.local   # then fill in GEMINI_API_KEY and PERENUAL_API_KEY
npm run dev
```

Open http://localhost:3000, go to the **dashboard**, and start talking to
Cactea. The full walkthrough is in the [Setup guide](setup.md).

---

*Next: [Read the Setup guide →](setup.md)*