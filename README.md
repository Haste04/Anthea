# Anthea — AI Plant Voice Agent

Hands-free voice assistant that identifies a plant from spoken traits, diagnoses issues from a local rule table, calculates a watering schedule, and looks up care data via the Perenual API.

## Stack

- Next.js (App Router) + TypeScript on Vercel
- Web Speech API + Web Audio RMS silence detection (1.2s)
- Web Speech Synthesis for replies
- Google Gemini (function calling)
- Perenual API for confirmed care data
- Local `data/disease-rules.json` (12 rules)

## Setup

1. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY` (required for the assistant **and** cloud mic transcription)
   - `PERENUAL_API_KEY`
2. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Voice input uses the mic with RMS silence detection. If the browser SpeechRecognition service fails (common `network` error), audio is recorded locally and transcribed via Gemini (`POST /api/transcribe`), then sent to the assistant.

## API

`POST /api/assistant`

```json
{ "transcript": "square stems, purple flowers, yellowing lower leaves, sandy soil" }
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

Keys stay server-side only. Spoken text is plain (no markdown). When Perenual cannot confirm a species, `is_estimate` is `true`.

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
