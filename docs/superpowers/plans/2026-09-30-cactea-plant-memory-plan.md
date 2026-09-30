# Cactea Plant Memory and Care Follow Through Implementation Plan

> **For agentic workers:** Execution is in this session. Implement the tasks in order and preserve the existing local-first, voice-review and confirmation flows.

**Goal:** Ground Cactea's follow-up questions in the selected plant's saved record and recent linked conversation, then celebrate a confirmed plant-care reminder with a brief named spoken reply.

**Architecture:** Add a bounded pure helper that resolves an explicitly named or already linked plant and builds a compact context from that plant's record and recent successful chats. Pass the context through the existing assistant request; keep photos attached to their original message and current chat. Update reminder confirmation so the selected plant is persisted and the existing success animation and speech occur only after a valid one-time save.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, IndexedDB workspace records, existing Gemini assistant and browser speech synthesis.

**Spec:** `docs/superpowers/specs/2026-09-30-cactea-plant-memory-design.md`

## Constraints

- Preserve WorkspaceData version 1 and current backup compatibility.
- Use only the explicitly linked or unambiguously named plant's notes and chats.
- Exclude pending, failed, and cancelled exchanges; never use historical photos as current proof.
- Keep current photo attachments on their user messages; do not silently attach an older photo to a new question.
- Reminder proposals remain unsaved until a valid explicit confirmation; duplicate saves remain blocked.
- Do not claim a browser hardware demonstration was performed.

## Review Focus

- Multiple plants with overlapping names resolve only when a single exact name is clear.
- A linked plant keeps priority over an unrelated plant name in old context; current message can explicitly switch plants only when unambiguous.
- Empty notes, empty chat history, failed replies, and long histories create bounded useful context without throwing.
- A saved reminder with no linked plant, a deleted/unmatched plant, or an incomplete due date does not speak a false named success.
- A user photo is never detached from the question it was submitted with.

---

### Task 1: Resolve plants and assemble conversation memory

**Files:** Create `lib/plant-memory.ts`; modify `app/dashboard/ChatDashboard.tsx`; document context behavior in `docs/full-app.md`.

**Interfaces:** `resolveConversationPlant(plants: Plant[], linkedPlantId: string | undefined, utterance: string): PlantResolution`, where `PlantResolution` is `{ plant: Plant | null; ambiguousNames: string[] }`. `buildPlantMemory(plant: Plant, chats: Chat[], currentChatId: string, maxChars?: number): string` returns a bounded, readable context, or an empty string when there is no useful saved context.

- [ ] Resolve linked plant first; otherwise match normalized whole saved plant names in the current transcript, report multiple matching candidates without selecting one.
- [ ] Build memory from saved name/species/location/notes and the newest complete exchanges in other chats linked to the same plant. Exclude pending/error/rejected reminder messages and limit total context to 2,400 characters.
- [ ] In ChatDashboard, pass selected plant memory as `plantContext` to the existing assistant endpoint for normal questions, retries, and transcript-sent voice questions. When explicitly ambiguous, ask the user to select a plant in the existing selector before calling the API; preserve the question draft.
- [ ] Keep current image attachment data flow intact and do not add historical photos to the plant memory.
- [ ] Run TypeScript and lint checks after the helper and integration are implemented.

### Task 2: Link voice-created reminders and celebrate confirmation

**Files:** Modify `app/dashboard/ChatDashboard.tsx`, `app/dashboard/ReminderProposalCard.tsx` only if necessary.

**Interfaces:** Extend current reminder confirmation callback data only if the UI needs to pass a plant ID not already retained by `initialPlantId`.

- [ ] Resolve plant for reminder intent using the same selected/named plant logic before creating the pending proposal; never infer a plant from reminder wording alone when multiple saved plants exist.
- [ ] Initialize the reminder editor with that plant and persist its ID only after existing title/date/duplicate guards pass and `save('reminders', ...)` is invoked.
- [ ] Build the success response from the saved title and linked plant name, e.g. “Got it—I’ll remind you to check Monstera’s soil tomorrow.” Use “your plant” when the proposal is not linked to a saved plant.
- [ ] Trigger Cactea's existing success feedback only from successful reminder confirmation. Remove the generic success gesture from ordinary answer completion so it marks a completed care action.
- [ ] Keep voice acknowledgement on `readReadAloud()` and use the same saved reminder message ID. Do not speak on cancellation or rejected duplicate confirmation.
- [ ] Run TypeScript and lint checks.

### Task 3: Check the user journey and docs

**Files:** Modify `docs/voice-demo.md`, `README.md` if the user journey needs clarification.

- [ ] Update the demo script to add a saved Monstera, link the chat, attach a leaf image, ask the initial question, answer one follow-up, and create/confirm a soil reminder.
- [ ] Clarify that saved-memory follow-ups use text and care notes from linked chats, while old images are not represented as current visual evidence.
- [ ] Run `npm.cmd run lint`, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, and `npm.cmd run build`; do not claim live browser microphone/speech proof.
