# Anthea — API Reference

Anthea exposes four serverless API routes. All live under `/api`, accept JSON
or form data, and are rate-limited per IP. Authentication is implicit — the
server uses its own environment-variable keys; the browser never sends API
keys.

## Endpoints overview

| Method | Path | Purpose | Limits |
| --- | --- | --- | --- |
| `POST` | `/api/assistant` | Ask the plant-care assistant a question. | 10 req/min/IP · 4,000-char transcript · 2.9 MB body · optional photo < 2 MB |
| `POST` | `/api/transcribe` | Transcribe recorded audio with the local Whisper model. | 10 req/min/IP · 5 MB audio |
| `POST` | `/api/transcribe/live-token` | Get a short-lived Gemini Live API transcription token. | 10 req/min/IP |
| `GET` | `/api/species?q=…` | Search Perenual for a species name. | 10 req/min/IP · query 2–120 chars |

All routes use the **Node.js runtime** (`maxDuration = 60` for the two longer-
running routes).

## Common conventions

### Rate limiting

- **Policy:** 10 requests per IP per minute per endpoint (sliding window).
- **Development:** when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
  are missing, a process-local bucket limiter is used.
- **Production:** a shared Upstash Redis limiter is used so limits hold across
  serverless instances. If the limiter is unavailable or the client IP cannot
  be determined from trusted proxy headers, AI routes **fail closed** with
  `503` rather than spending paid provider quota.
- On a rate-limit hit the API returns `429` with a `Retry-After` header.

### Content types

- `/api/assistant` and `/api/transcribe/live-token` accept JSON
  (`application/json`); anything else returns `415`.
- `/api/transcribe` accepts `multipart/form-data` (with a file field named
  `audio`); anything else returns `415`.

### Error style

- Validation failures return JSON with an `error` string and a `4xx` status.
- Provider/availability failures return `500`, `502`, or `503` with safe,
  public-facing messages — raw provider errors are never exposed to clients.

---

## `POST /api/assistant`

The core endpoint: send the reviewed question, optional conversation context,
care profile, photo, and plant memory, and get back a structured answer.

### Request body (`application/json`)

| Field | Type | Notes |
| --- | --- | --- |
| `transcript` | `string` | **Required.** The user's question, trimmed; ≤ 4,000 characters. |
| `history` | `array` | Optional; validated conversation history sent to the model for follow-ups. |
| `profile` | `object` | Optional; plant-care preferences (soil type, climate, etc.), parsed and validated. |
| `photo` | `string` | Optional; a data-URL (base64) JPEG/PNG/WebP image. If present, the server decodes and re-encodes it (via `sharp`) before forwarding to Gemini. |
| `photoContext` | `boolean` | Optional; `true` means the photo is context for a follow-up rather than a new observation. |
| `plantContext` | `string` | Optional; compact text from a linked saved plant (notes + recent exchanges), ≤ 2,600 characters. |

Example:

```json
{
  "transcript": "My Monstera has yellowing lower leaves. What should I check?",
  "history": [],
  "plantContext": "Plant: Monstera deliciosa. Last check: soil felt wet."
}
```

### Response (`200 OK`)

```json
{
  "response_text": "Lemon trees like full sun. Start by checking the soil... ",
  "spoken_text": "Check the soil a couple of inches down. If it feels dry, water it slowly.",
  "next_check": null,
  "species_candidate": "Monstera deliciosa",
  "watering_days": 7,
  "is_estimate": true,
  "diagnosis_confidence": "low"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `response_text` | `string` | Full chat answer: short plain paragraphs, usually 3–6 sentences, with one actionable next step. |
| `spoken_text` | `string` | Brief spoken summary: 1–2 natural sentences, ≤ 45 words. |
| `next_check` | `string \| null` | Suggested follow-up check, when the model extracts one. |
| `species_candidate` | `string \| null` | The model's best-guess species, if any. |
| `watering_days` | `number \| null` | Suggested watering interval in days, when calculated. |
| `is_estimate` | `boolean` | `true` when care data is an estimate (not a confirmed Perenual lookup). |
| `diagnosis_confidence` | `string` | One of `none`, `low`, `medium`, `high` (rule-table driven). |

### Error responses

| Status | When | Body |
| --- | --- | --- |
| `400` | Empty transcript (nothing was said) | A safe `response_text` telling the user to try again, plus `is_estimate: true`, `diagnosis_confidence: "none"`. |
| `400` | Invalid request (bad JSON, bad history/photo/profile/plantContext) | `{ "error": "..." }` |
| `413` | Transcript > 4,000 chars, or body > 2.9 MB | `{ "error": "..." }` |
| `415` | Wrong content type | `{ "error": "Expected a JSON request body." }` |
| `429` | Rate limited | Rate-limit message + `Retry-After` |
| `500` | Assistant request failed | Safe `response_text` + `error: "Assistant request failed."` |
| `503` | Provider overload | Safe busy message + `error: "Assistant temporarily unavailable."` and `Retry-After: 30` |

---

## `POST /api/transcribe`

Transcribes recorded audio with the **self-hosted Whisper model** — no
transcription API key required.

### Request (`multipart/form-data`)

- A file field named `audio`.
- Accepted MIME types: `audio/mp4`, `audio/mpeg`, `audio/ogg`, `audio/wav`,
  `audio/webm`, `audio/x-wav`.
- Size ≤ 5 MB.

### Response

- `200 OK` → `{ "transcript": "…" }`. Silent recordings detected by the RMS
  gate return `{ "transcript": "" }` instead of a hallucinated sentence.
- `400` / `413` / `415` → `{ "transcript": "", "error": "…" }` for invalid
  multipart, oversize, or wrong content type.
- `500` → a safe error message; the route fails fast on timeout (45 s deadline,
  25 s inference budget on top of the model's first-download time).

### Runtime notes

- Model: `onnx-community/whisper-base.en`, int8 ("q8") ONNX weights (~75 MB).
- First call downloads the model: cached at `.cache/whisper/` locally
  (git-ignored) and `/tmp` on Vercel (per instance; a cold function
  re-downloads).
- CPU inference is slower than a cloud STT call; the route time-boxes it and
  the client aborts at 65 s.

---

## `POST /api/transcribe/live-token`

Issues a **single-use, short-lived token** for Gemini Live API transcription.

- Requires `GEMINI_API_KEY`. Missing or incorrect key → `503` /
  `{ "error": "Live transcription is unavailable." }`.
- Proxies the Google `auth_tokens` endpoint for
  `models/gemini-3.5-transcribe-live` with response modality `TEXT`, uses=1,
  10-minute token expiry, 60-second session expiry.
- Success → `{ "token": "…" }` with `Cache-Control: no-store`.
- Provider failure → `502` with a public-safe error message.

---

## `GET /api/species?q=…`

Searches Perenual's species list for the plant form's **Look up species**
button (the local name catalog in `lib/plant-species.ts` handles known names
client-side without an API call).

### Request

- `q` — plant name, 2–120 characters.

### Response

```json
{ "matches": [ { "commonName": "Monstera deliciosa", "scientificName": "Monstera deliciosa" } ] }
```

- Up to 10 options, deduplicated by scientific name; matches cache in memory
  for the browser session (up to one day), and provider fetches are cached for
  one day via Next.js fetch cache.
- `400` → query length invalid; `503` → lookup unavailable (the UI still lets
  users save a manual name).

---

*Back to the [documentation home](README.md).*