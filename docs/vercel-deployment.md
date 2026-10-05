# Deploying Anthea to Vercel

Import this repository with the **Next.js** framework preset and the repository root as the root directory. Use the default output directory and `npm run build`. Commit `package-lock.json` so the dependency versions are reproducible. Keep Fluid Compute enabled; the assistant and recorded transcription routes declare a 60-second function duration.

Set these secrets in Vercel for **Production** and **Preview**, then redeploy:

| Environment variable | Required for |
| --- | --- |
| `GEMINI_API_KEY` | Assistant, live transcription tokens, and cloud recorded transcription |
| `PERENUAL_API_KEY` | Species lookup and confirmed care data |
| `UPSTASH_REDIS_REST_URL` | Shared API rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Shared API rate limiting |

Set `GEMINI_TEXT_MODEL` and `GEMINI_FALLBACK_MODEL` if your account needs different models from `.env.example`. Confirm that the Gemini key has access to the live and recorded transcription models as well. Local `.env.local` values are not uploaded through a Git deployment. Missing or unavailable Upstash configuration causes production API requests to return `503` by design.

Before deploying, run:

```powershell
npm test
npm run lint
npm run build
```

On a Vercel preview, open `/home`, `/dashboard`, `/plants`, and `/settings`. Save a plant, reload, ask a typed question, attach a photo, and check scientific-name lookup. Check microphone permission, live captions, a complete recorded transcription, and audible brief/full replies on the intended browser. These checks require real provider credentials and hardware; automated tests do not verify them.

For an API check against an accessible preview:

```powershell
$env:ANTHEA_URL = 'https://your-preview.vercel.app'
node scripts/verify-voice-conversation.mjs
```

This makes real provider requests. A protected preview must be accessible to the script; an authentication page is not an API response.

Recorded audio is limited to **4 MiB**, with **64 KiB** allowed for multipart overhead. This leaves the request below [Vercel's 4.5 MB body limit](https://vercel.com/docs/functions/limitations#request-body-size). Larger recordings offer a shorter recording or typing.

Whisper is the fallback when recorded cloud transcription fails. The Next.js config traces the native ONNX runtime for the build platform; Vercel builds on Linux. Model weights are downloaded at runtime to `/tmp` and each cold instance can need a fresh download. Verify a cold fallback on the preview and inspect function logs for download, native-library, memory, or timeout errors. A Windows build cannot verify Linux execution. Check the resulting function bundle against [Vercel's bundle limits](https://vercel.com/docs/functions/limitations#bundle-size-limits).

Data is stored in the browser for each site origin. Localhost, a preview URL, and the production domain have separate workspaces; export/import a backup to move records. Older reminder records are preserved in backups, but the current interface does not create or manage reminders.
