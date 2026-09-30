# Cactea Plant Memory and Care Follow Through

## Goal

Make Cactea feel like an ongoing plant-care companion by grounding voice follow-ups in saved plant details and linked chat history, carrying a plant photo through the conversation and reminder proposal, and acknowledging a reminder after the user confirms it.

## User experience

1. When a user asks about a named saved plant, or has linked the current chat to a plant, Anthea selects that plant's own record and prior linked chat context. It does not mix memories from different plants. If a name is ambiguous or no plant matches, Cactea asks which plant rather than guessing.
2. A follow-up can use the most recent completed exchanges from that plant's other linked conversations plus the plant's saved species, location and notes. Existing photo questions and their photos remain attached to the chat. Cactea may mention prior observations as historical context, not as a claim that the plant currently has that condition.
3. A voice request such as “Remind me to check the soil tomorrow” opens the existing review card, preselects the saved plant associated with the conversation and preserves the existing explicit-confirmation gate. The reminder stores the selected plant link.
4. Only after confirmation does Cactea show its success gesture and say a brief, plant-aware confirmation. A reminder with no linked plant gets a generic confirmation. Cancelling, invalid dates, storage not being ready, or duplicate confirmation must not trigger a success moment.

## Constraints

- Keep local browser storage and existing v1 backups compatible; do not add accounts, new record schema or automatic notifications.
- Keep current microphone, transcript review, photo upload and reminder parsing behavior.
- Bound plant context to the assistant API's existing input limits and use completed, non-error user/assistant exchanges only.
- Keep Cactea's success animation short and respect the existing reduced-motion behavior.
- Do not present AI guesses, estimates or old symptom observations as confirmed facts.

## Data flow

Resolve a plant from the chat's linked plant first; otherwise match a clearly named saved plant in the current utterance. Build a bounded context from that plant's saved record and latest complete exchanges in chats linked to that same plant, including only their text and assistant guidance metadata needed for a voice follow-up. Send that context to the existing assistant route. Do not forward historical images as implicit current evidence. Keep the user's current uploaded photo attached to the current question and stored in its user message. Carry the resolved plant ID through the pending reminder editor; when confirmed, persist it on the reminder and use the saved plant name and proposed care action in the spoken acknowledgement.

## Completion criteria

- A voice follow-up on a selected Monstera uses the saved plant notes and relevant last exchange, even if the prior exchange was in another linked chat.
- A named plant can be resolved without changing the chat link, but ambiguous names do not silently select the wrong plant.
- Photos remain visible on their originating messages and are sent only with the current photo question or an intentional follow-up that reuses conversation context.
- Confirming a reminder links it to the selected plant and produces one concise named acknowledgement plus Cactea's success animation.
- Canceling, retrying, or confirming twice never produces a false celebration or duplicate reminder.
