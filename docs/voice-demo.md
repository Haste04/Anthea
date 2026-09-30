# Anthea live voice demo

Lead with the plant-care conversation. Use the same chat for both questions so the follow-up demonstrates context.

## Before presenting

- Open `/dashboard` over HTTPS or localhost in a browser with a real microphone. Open **Voice settings** and enable **Read replies aloud** and check speaker volume.
- Verify that microphone permission is allowed and the AI provider can answer a question. Keep API keys in server environment variables.
- Rehearse on the actual presentation browser and device. Automated tests do not establish that microphone capture or speaker output works there.

## Three-minute presentation

1. Explain: “Anthea helps plant owners decide what to check when a plant looks unhealthy.”
2. Choose **Talk to Cactea**. Show that permission waiting is distinct from listening. Once it says **Listening — pause when finished**, say: “My monstera’s lower leaves are yellow. What should I check?”
3. Pause for about a second. Show the **What I heard** card, choose **Edit** to correct a word if necessary, and choose **Send question**.
4. Hear Cactea ask one care question at a time. For this example, answer “The soil feels wet,” then “I watered it yesterday,” then “It gets bright indirect light.” Review each transcript before sending. Cactea should gather context before proposing a cause.
5. Hear the brief care answer. Point out the highlighted **Next step** and expand **Details** in chat, then choose **Hear more** if the audience wants the details. **Replying aloud** appears when the browser starts speech.
6. Ask “How do I check if the soil is too wet?” to demonstrate a contextual follow-up.
7. Say “Remind me to check the soil tomorrow.” Review the proposed title, date, and optional plant. Show that nothing appears in Reminders until you choose **Confirm reminder**. Then briefly open Reminders to show the saved action.
8. In Settings, choose a device voice and use **Preview voice**. Rehearse voice selection before the presentation so the chosen voice is ready on that device.

Keep plants and the guide out of the main presentation unless they directly help with this care problem. Reminder creation is part of carrying out the advice, rather than a separate feature tour.

## Recovery rehearsal

- Deny microphone access: verify that site-permission instructions, **Retry microphone**, and **Type instead** appear, and that an existing typed draft survives.
- Edit a reviewed transcript, choose **Record again**, then deny access or cancel: the edited transcript must return.
- Stay silent: verify that the interface offers another attempt instead of sending an empty question.
- If transcription fails: retry the retained recording or edit any captured words. The recording remains in memory only for this chat session; reload discards it.
- Check **Stop audio**, **Hear brief answer**, and **Hear more** on an existing reply. If playback does not start, the UI should offer retry guidance rather than stay in the speaking state.
- Cancel a reminder proposal: no reminder should be created. Try a request without a date: confirmation must stay disabled until you select a valid date. Refresh with a pending proposal and confirm it once; refreshing a saved proposal must not create another reminder.
- A request with a time such as “tomorrow at 9 AM” must explain that this version stores dates only and sends no timed notifications. Saving remains an explicit choice.
- Change the speaking voice in Settings, preview it, and return to chat. Brief and full replies must use that choice. If a saved voice is unavailable on another device, the device default is used.

## Evidence to record after rehearsal

Record browser/device, date, permission result, exact question and reviewed transcript, whether the reply was audible, and whether the contextual follow-up succeeded. Do not label the live loop verified until someone has spoken into the microphone and heard both replies on that device.

The original recording, transcript review, spoken reply, and follow-up loop was reported working by the user on September 29, 2026. The new API triage flow and separate full/brief replies were verified against the running local answer service with `node scripts/verify-voice-conversation.mjs`.

The browser connector still reports no available browsers. The new reminder card, device voice picker/preview, and updated speech summaries need a browser rehearsal on the presentation device. Automated tests and API requests do not establish audible hardware playback.
