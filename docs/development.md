# Anthea — Development Guide

This guide covers the commands, test suite, verification scripts, and
debugging workflow for working on Anthea.

## Quality gates

Run all of these before considering a change safe:

```bash
npm test                            # Node test runner (tests/*.test.mjs)
npm run lint                        # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit --incremental false  # TypeScript type check
npm run build                       # Production build (catches build-time issues)
```

> **Before editing Next.js code**, follow [AGENTS.md](../AGENTS.md) and read the
> relevant bundled guides in `node_modules/next/dist/docs/` — this repo pins a
> Next.js 16 version whose APIs can differ from older Next.js knowledge.

## The test suite

Tests use Node's built-in test runner (`node --test tests/*.test.mjs`). Several
transpile the relevant `lib`/component TypeScript at test time; `fake-indexeddb`
provides an in-memory IndexedDB for persistence tests. No browser or network is
required.

| Test file | Covers |
| --- | --- |
| `assistant-photo.test.mjs` | Photo validation, decoding, and Gemini image forwarding. |
| `assistant-request.test.mjs` | Assistant request bounds and request validation. |
| `cactea-idle-animations.test.mjs` | Mascot idle animation/state behavior. |
| `cactea-state.test.mjs` | Cactea's state machine transitions. |
| `chat-draft.test.mjs` | Chat draft vs. captured transcript workflows. |
| `conversation.test.mjs` / `conversation-improvements.test.mjs` | History validation, next-check extraction, complete history search. |
| `gemini-fallback.test.mjs` | Provider fallback and overload retries. |
| `home-mascot-follow.test.mjs` | Home-page mascot follow behavior. |
| `live-transcription.test.mjs` | Live transcription token/client logic. |
| `plant-species.test.mjs` / `plant-species-form.test.mjs` | Local catalog matching and the species form flow. |
| `reminder-confirmation.test.mjs` | Explicit confirmation before saving reminders. |
| `sidebar-visibility.test.mjs` | Sidebar visibility logic. |
| `six-seven.test.mjs` | Six-seven helper behavior. |
| `species-api.test.mjs` | `/api/species` behavior. |
| `speech-playback.test.mjs` | Brief/full speech replay behavior. |
| `visualizer.test.mjs` | Waveform/visualizer state. |
| `voice-feedback.test.mjs` | Voice feedback prompts. |
| `voice-preferences.test.mjs` | Voice preference persistence. |
| `wav-decode.test.mjs` | Audio decode/resample and the transcription silence gate. |
| `workspace.test.mjs` / `workspace-db.test.mjs` | Record persistence, transactional restore, cross-tab plant unlinking, backups. |

## Real-API verification

`scripts/verify-voice-conversation.mjs` checks the **real** local API behavior —
the soil → watering → light triage and the separate detailed/spoken answers:

```bash
node scripts/verify-voice-conversation.mjs
```

- Makes real provider requests to the running service.
- Set `ANTHEA_URL` to target another deployment (defaults to localhost).
- Does **not** simulate microphone input or speaker output. For a true
  end-to-end check, rehearse on a real browser/device and record the results
  (see [voice-demo.md](voice-demo.md)).

## Debugging workflow

### Isolate backend vs. frontend

When something breaks, hit the API directly first — bypassing the browser
isolates the layer. Only `/api/assistant` burns Gemini quota;
`/api/transcribe` runs on the local Whisper model.

```powershell
# Assistant (uses Gemini)
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/assistant" `
  -ContentType "application/json" `
  -Body '{"transcript":"My plant has yellowing lower leaves."}'

# Transcription (local Whisper; a multipart upload)
# Species lookup (Perenual)
Invoke-RestMethod -Uri "http://localhost:3000/api/species?q=monstera"
```

Check the server log for `404` (model unavailable), `429 RESOURCE_EXHAUSTED`
(provider quota), and `503 UNAVAILABLE` (temporary provider overload). Public
responses use safe messages instead of exposing raw provider errors.

### Common failure triage

| Area | Look for |
| --- | --- |
| Microphone never starts | Site permission + HTTPS/localhost; use **Retry microphone** / **Type instead**. |
| Misheard words | Edit the **What I heard** card or **Record again**. |
| Silent reply | Voice settings, device volume, **Hear brief answer**. |
| `503` in production | Upstash env vars, trusted-proxy IP headers, then provider availability. |
| Whisper cold-start slowness | First-call model download (~75 MB); subsequent calls use the cache. |
| Rate-limited requests (`429`) | 10 req/min/IP per endpoint in the current window. |

## Working on voice features

Voice changes must be rehearsed on a real microphone + speaker setup — browser
engine differences (especially Brave blocking the built-in STT) mean automated
tests cannot prove audible playback. Keep the recovery rehearsal checklist in
[docs/voice-demo.md](../docs/voice-demo.md) up to date.

## Contribution notes

- Start from a concrete plant-care problem; include reproduction steps and the
  expected behavior in the issue/PR description.
- Keep answer honesty rules intact: `is_estimate` labels, one-question-per-turn
  triage, confidence hedging, and the "no diagnosis from symptoms alone" rule.
- Never add API keys to client bundles; all provider keys stay in server-side
  environment variables.
- Run the [quality gates](#quality-gates) above before submitting.

---

*Back to the [documentation home](README.md).*