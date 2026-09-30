# Botanical workspace

Open `/home` for the overview or `/dashboard` for Cactea chat. The shared sidebar links to plants, the plant guide, reminders, and settings. The original public landing and welcome flow remain available.

- Chats save automatically, can be renamed/deleted, and remain accessible through sidebar search and “View all”. Linking or naming a saved plant lets Cactea reuse its notes and up to four recent successful exchanges from chats linked to that plant. Each exchange and photo keeps its plant association when a chat switches plants, so memory and image context stay with the right plant. Ambiguous plant names require an explicit selection; switching chats stops the old microphone/audio/request. Interrupted replies offer retry.
- Plant records include photos, species, location, notes, and linked chats/reminders. Removing a plant keeps its chats and reminders, without the link.
- Photo questions accept JPEG, PNG, and WebP. Browser preparation resizes the image; the server bounds the request and decodes/re-encodes it before Gemini receives it. Follow-ups may reuse the latest photo in that conversation.
- Reminders are in-app checks, not scheduled background notifications. Recurring completion advances from the original due date to the next occurrence after today. Watering reminders prompt a soil check.
- Spoken or typed â€œRemind me to check the soil tomorrowâ€ prepares a review card in chat, linked to the selected saved plant. Confirming saves a one-time local reminder and gives a brief spoken acknowledgement and Cactea success gesture; cancelling saves nothing. Today, tomorrow, dates in YYYY-MM-DD form, and â€œin two days/weeksâ€ are supported. Other dates need manual selection. Time requests explicitly require accepting a date-only reminder; timed notifications are not added.
- Yellow-leaf conversations gather missing soil moisture, watering, and light one question per turn before suggesting causes. General care replies retain the full explanation in chat while reading a shorter summary; **Hear more** reads the full answer. Neither symptoms nor a tool match alone establish a diagnosis.
- Settings provides a device voice selector and preview. The selection applies to Cacteaâ€™s replies and is stored separately from backups. Voices load initially and through the browserâ€™s `voiceschanged` event; unavailable selections fall back to the device default. See [MDN getVoices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices) and [voiceschanged](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event).
- Records and photos use IndexedDB in this browser. Settings exports/imports JSON backups; imports validate before replacing all three record collections atomically. Voice/care preferences retain their existing localStorage keys and are configured separately.
- Storage failures show a banner. Export before closing if a write fails. Data does not sync between devices; simultaneous edits to the same record in multiple tabs use the last saved version.
- The guide contains four introductory articles with links to the RHS sources. It is a starting library, not a comprehensive species database.

## Visual asset

`public/images/workspace-garden.webp` was generated with the built-in image generation tool and optimized to WebP (about 90 KB). Prompt: a wide photorealistic sunlit indoor room, empty ivory wall across the left two thirds, sheer linen curtain, monstera and terracotta plant on a pale stone windowsill at the far right, morning light, no text/UI/mascot. The existing layered Cactea artwork is rendered separately.

## Validation

`npm test`, `npm run lint`, and `npm run build`. Tests cover record persistence, transactional restore, cross-tab plant unlinking, interrupted replies, complete history search, recurrence, backup validation, stale photo draft results, bounded photo requests, image decoding, Gemini image forwarding and existing voice state/history/provider behavior.

Browser visual verification and real microphone/speech testing require a connected browser. Live AI availability depends on the configured Gemini service.

`node scripts/verify-voice-conversation.mjs` checks the real local APIâ€™s soil â†’ watering â†’ light triage and separate detailed/spoken answer. Set `ANTHEA_URL` to exercise another deployment. This script makes real answer requests and does not simulate microphone input or audio output. Presentation and recovery rehearsal steps are in [voice-demo.md](voice-demo.md).
