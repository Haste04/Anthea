# Anthea — Architecture

This guide explains the technology behind Anthea, how the pieces fit together,
how voice input and output work end to end, how the assistant reasons about
plant care, and where every file lives.

## Technology stack

Anthea is intentionally a **single deployment**: one Next.js application that
serves both the frontend and the serverless API routes. There is no separate
backend service and no CORS boundary.

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS | UI, routing, client state, voice capture, playback. |
| Animations | `motion` | Cactea's state-driven mascot and page motion. |
| Assistant LLM | Google Gemini via `@google/genai`, function calling | Answers questions, identifies plants, plans care steps. |
| Speech-to-text (primary) | Web Speech API (`SpeechRecognition`) | Live captions while the user speaks. |
| Speech-to-text (fallback) | Self-hosted Whisper (`onnx-community/whisper-base.en`, int8 ONNX via `@huggingface/transformers`) | Transcribes recorded audio server-side when the browser STT is unavailable or errors. |
| Silence detection | Web Audio API (RMS amplitude) | A ~1.2s pause ends recording and opens transcript review. |
| Speech-to-speech | Web Speech Synthesis API | Reads the short answer aloud with a user-selected device voice. |
| Care data | Perenual API | Confirms the species and returns real watering/sunlight/soil data. |
| Disease rules | Local `data/disease-rules.json` | 12 symptoms → cause rules, matched by keyword-token overlap. |
| Rate limiting | `@upstash/ratelimit` + `@upstash/redis` | 10 requests per IP per minute per endpoint (process-local in dev). |
| Persistence | IndexedDB (`anthea-workspace`) + localStorage | Chats/plants/reminders, photos, and care/voice preferences. |
| Image processing | `sharp` | Decodes and re-encodes uploaded photos server-side before they reach Gemini. |
| Audio processing | `wavefile`, `audio-decode` | Decodes uploaded audio to PCM for Whisper. |

## High-level architecture

```text
┌────────────────────────────── Browser ──────────────────────────────┐
│  Landing / Welcome / Home / Dashboard / Plants / Settings           │
│                                                                    │
│  Mic ──► SpeechRecognition (captions)  ─┐                           │
│    │       └─ unsupported/error ─┐      │  review + edit            │
│    │  Recorder (Web Audio, RMS)  └─► audio file ──► Whisper ────────┤
│    │                                            (fallback)           │
│    ▼                                                                │
│  "What I heard" card ── edit / record again / send                 │
│    │                                                                │
│    ▼                                                                │
│  POST /api/assistant { transcript, history, profile, photo,         │
│                       photoContext, plantContext }                  │
│    │                                                                │
│    ▼                                                                │
│  chat answer (response_text) + short spoken reply (spoken_text)     │
│    │                                                                │
│    ├─► speech synthesis reads the brief answer aloud                │
│    └─► "Hear more" reads the full answer                            │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────────────── Vercel (Node) ───────────────────────────┐
│ POST /api/assistant                                                 │
│   rate limit → validate → Gemini (tools: identify_plant,            │
│   diagnose_symptoms, get_care_data, calculate_watering)             │
│   ├─► Perenual species/details (real care data)                     │
│   └─► data/disease-rules.json (local rules)                         │
│ POST /api/transcribe  → decode → silence gate → Whisper (ONNX)      │
│ POST /api/transcribe/live-token → Gemini auth token                 │
│ GET  /api/species?q= → Perenual species-list (cached 24h)           │
└──────────────────────────────────────────────────────────────────────┘
```

## The voice pipeline

### 1. Listening

1. The user grants microphone permission and presses **Talk to Cactea**.
2. When the browser supports it, `SpeechRecognition` produces **live captions**
   during speech.
3. Independently, a Web Audio `AnalyserNode` measures the **RMS amplitude** of
   the microphone input. When speech pauses for roughly **1.2 seconds**, the
   app stops recording and opens the **Review your question** card.
   - A pause *reviews* the question; it does **not** auto-send it.
   - If the browser STT is unsupported or fails (a common `network` error, or
     Brave with Shields enabled), the recording is kept and sent to
     `POST /api/transcribe` for Whisper.

### 2. Review

The reviewed card shows the captured words, allows **Edit words**, **Record
again**, or **Type instead** (shown automatically if the mic is unsupported).
Sending is always an explicit action, so misheard words never go out as-is.

### 3. Reasoning

The question goes to `POST /api/assistant`. The server validates it, attaches
optional context (conversation history, saved plant notes, a photo, care
preferences), asks Gemini, and returns a structured answer.

### 4. Speaking

The response contains two fields:

- `response_text` — the full answer rendered in chat (short plain paragraphs
  with one actionable **next step**).
- `spoken_text` — a 1–2 sentence summary (≤ 45 words) with the main advice and
  ONE next step, read aloud by `speechSynthesis` using the device voice chosen
  in Settings.

The UI marks "speaking" only when playback actually starts, and there are
separate **Hear brief answer** and **Hear more** controls.

## The reasoning pipeline

Gemini is the assistant-only brain and uses **function calling** with four
tools:

| Tool | What it does |
| --- | --- |
| `identify_plant` | Guesses common + scientific names from spoken physical traits using the model's own reasoning (no external lookup). |
| `diagnose_symptoms` | Matches spoken symptoms against the local 12-rule table (`data/disease-rules.json`) via keyword-token overlap. |
| `get_care_data` | Confirms the species on Perenual and pulls real watering/sunlight/soil data. |
| `calculate_watering` | Adjusts the watering interval for soil type and temperature. |

Example flow for *"How do I water my plant with purple flowers in sandy soil?"*:

```text
identify_plant → get_care_data → calculate_watering (soil/climate factor)
```

### Guardrails that keep answers honest

- **One question per turn.** For symptoms, Cactea first gathers missing care
  context — soil moisture, last watering, light — before suggesting a cause.
  Facts already supplied (or saved in plant notes) are not re-asked.
- **Yellow-leaf triage.** `lib/care-dialogue.ts` runs a deterministic
  soil → watering → light sequence. Symptoms alone or a tool match alone never
  establish a diagnosis.
- **`is_estimate` flag.** When care numbers come from model estimation rather
  than a confirmed Perenual match, `is_estimate` is `true` and replies say
  "based on typical care for this type of plant" instead of quoting a
  confirmed number.
- **Confidence hedging.** If `diagnosis_confidence` is `none` the assistant
  says it cannot identify a specific issue; if `low` it hedges with "this
  could suggest…".
- **Saved plant memory.** When a chat is linked to a saved plant, a compact
  context is built from that plant's record and up to four recent successful
  exchanges, so follow-ups can "pick up where you left off". Photos stay
  attached to their original message and plant.

## Persistence model

All workspace data lives **in the browser** — there is no server-side user
database.

| Store | Holds |
| --- | --- |
| IndexedDB — `anthea-workspace` (v1) | Three object stores with `id` keypath: `chats`, `plants`, `reminders` (including record photos). |
| localStorage | Care preferences and voice preferences (kept separate from workspace backups). |

- **Chats** auto-save, can be renamed/deleted, and are searchable. Each message
  may carry a `plantId` and a `meta` snapshot of its answer.
- **Plants** hold photos, species, location, notes, and links to chats and
  reminders. Deleting a plant un-links (but keeps) its chats and reminders.
- **Reminders** are date-only, one-time, in-app checks — not scheduled
  background notifications. Recurring completion advances from the original due
  date to the next occurrence after today.
- **Backups**: Settings exports/imports a JSON backup of the three collections.
  Imports validate before atomically replacing all records. Preferences are
  configured separately.

Concurrency rules: data does not sync between devices; simultaneous edits in
multiple tabs use the last-saved version; storage failures show a banner with
an "export before closing" prompt.

## Code map

| Path | Responsibility |
| --- | --- |
| `app/dashboard/` | Voice conversation, transcript review, answer layout, Cactea companion, reminder proposals. |
| `app/components/workspace/` | Shared navigation, workspace records, and supporting pages. |
| `app/components/cactea/` | The Cactea mascot: module, audio aura, face expressions, idle animations. |
| `app/components/` | `MicButton`, `Visualizer`, `VoiceSettings`. |
| `app/home/` `app/welcome/` `app/plants/` `app/settings/` | Overview, onboarding flow, My Plants, and settings pages. |
| `app/api/assistant/route.ts` | Validates questions, history, photos, and plant context before requesting an answer. |
| `app/api/transcribe/route.ts` | Validates recorded audio, decodes it, and requests Whisper transcription. |
| `app/api/transcribe/live-token/route.ts` | Issues a short-lived Gemini Live API transcription token. |
| `app/api/species/route.ts` | Perenual species search for the form's **Look up species** button. |
| `lib/gemini.ts` | Assistant prompt, tool calling, provider fallback, structured answer assembly. |
| `lib/care-dialogue.ts` | Yellow-leaf follow-up flow and brief/full answer handling. |
| `lib/reminder-intent.ts` | Parses reminder commands and validates proposed actions. |
| `lib/workspace-data.ts` / `workspace-db.ts` | Browser persistence (IndexedDB) and backup validation. |
| `lib/api-guard.ts` | Request bounds and local/distributed rate limiting. |
| `lib/whisper.ts` | Self-hosted Whisper pipeline (ONNX, cached model). |
| `lib/wav-decode.ts` | Decodes uploads to PCM and gates silent recordings. |
| `lib/perenual.ts` | Perenual lookups: species confirm + real care data. |
| `lib/plant-species.ts` | Local curated species-name catalog (see [plant-species.md](plant-species.md)). |
| `lib/diagnose.ts` | Keyword-token matching against the rule table. |
| `lib/watering.ts` | Watering-interval math (soil + climate factors). |
| `lib/plant-profile.ts` / `plant-profile-store.ts` | Plant-care preference schema and storage. |
| `lib/conversation.ts` | History validation and extraction (incl. `next_check`). |
| `lib/plant-memory.ts` | Builds per-plant context from saved notes and recent exchanges. |
| `lib/live-transcription.ts` | Gemini Live API transcription client options. |
| `lib/prepare-photo.ts` | Client-side photo resize before upload. |
| `lib/visualizer.ts` / `voice-feedback.ts` / `speech-voice.ts` / `voice-preferences-store.ts` / `cactea-state.ts` / `six-seven.ts` | Supporting UI, audio feedback, voice selection, and state utilities. |
| `data/disease-rules.json` | The 12-entry local symptom → cause rule table. |
| `tests/` | Automated coverage (Node's test runner). |
| `scripts/verify-voice-conversation.mjs` | Real-API conversation verification script. |

## Build & runtime configuration notes

- API routes run on the **Node.js runtime** (`runtime = "nodejs"`) with
  `maxDuration = 60`.
- `next.config.ts` treats `wavefile` and `audio-decode` as external server
  packages (their optional codec imports must load at runtime), and includes the
  `onnxruntime-node` native binding explicitly in the `/api/transcribe` output
  trace so Whisper works after deployment.

---

*Back to the [documentation home](README.md).*