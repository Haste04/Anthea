# Anthea live voice demo

Lead with Cactea remembering one saved plant, inspecting a leaf photo, and helping the user carry out a care action.

## Before presenting

- Open `/dashboard` over HTTPS or localhost in a browser with a real microphone. Open **Voice settings** and enable **Read replies aloud** and check speaker volume.
- Verify that microphone permission is allowed and the AI provider can answer a question. Keep API keys in server environment variables.
- Rehearse on the actual presentation browser and device. Automated tests do not establish that microphone capture or speaker output works there.

## Three-minute presentation

1. Before presenting, save a plant named **Monstera** with a note from an earlier check (for example, “Last time the soil felt wet; one lower leaf was yellowing”). Link the chat to this plant. Explain: “Cactea remembers care notes for each plant, so its follow-up can pick up where you left off.”
2. Attach a clear photo of a yellowing leaf. Choose **Talk to Cactea**. Show that permission waiting is distinct from listening. Once it says **Listening — pause when finished**, say: “How is my Monstera doing? One lower leaf looks more yellow. What should I check?”
3. Pause for about a second. Show the **Review your question** card, choose **Edit words** to correct a word if necessary, and choose **Send question**.
4. Hear Cactea ask one care question at a time. For this example, answer “The soil feels wet,” then “I watered it yesterday,” then “It gets bright indirect light.” Review each transcript before sending. Cactea should gather context before proposing a cause.
5. Hear the brief care answer. Point out the highlighted **Next step** and expand **Details** in chat, then choose **Hear more** if the audience wants the details. **Replying aloud** appears when the browser starts speech.
6. Ask “How do I check if the soil is too wet?” Cactea should use the saved plant context, ask whether any earlier observation is still true, and keep the photo visible on its original message. An old photo is not presented as a new observation.
7. In Settings, choose a device voice and use **Preview voice**. Rehearse voice selection before the presentation so the chosen voice is ready on that device.

Keep the presentation focused on saved plant context, care guidance, and reliable voice input. The current interface does not create or manage reminders.

## Recovery rehearsal

- Deny microphone access: verify that site-permission instructions, **Retry microphone**, and **Type instead** appear, and that an existing typed draft survives.
- Edit a reviewed transcript, choose **Record again**, then deny access or cancel: the edited transcript must return.
- Stay silent: verify that the interface offers another attempt instead of sending an empty question.
- If transcription fails: retry the retained recording or edit any captured words. The recording remains in memory only for this chat session; reload discards it.
- Check **Stop audio**, **Hear brief answer**, and **Hear more** on an existing reply. If playback does not start, the UI should offer retry guidance rather than stay in the speaking state.
- Restore a backup containing older reminder drafts: existing records must be retained, and pending drafts must not create reminders automatically.
- Change the speaking voice in Settings, preview it, and return to chat. Brief and full replies must use that choice. If a saved voice is unavailable on another device, the device default is used.

## Evidence to record after rehearsal

Record browser/device, date, permission result, exact question and reviewed transcript, whether the reply was audible, and whether the contextual follow-up succeeded. Do not label the live loop verified until someone has spoken into the microphone and heard both replies on that device.

The original recording, transcript review, spoken reply, and follow-up loop was reported working by the user on September 29, 2026. The new API triage flow and separate full/brief replies were verified against the running local answer service with `node scripts/verify-voice-conversation.mjs`.

Device voice selection and speech summaries need a browser rehearsal on the presentation device. Automated tests and API requests do not establish audible hardware playback.
