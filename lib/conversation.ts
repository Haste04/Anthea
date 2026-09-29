export type ConversationTurn = { role: "user" | "assistant"; text: string };
type ConversationMessage = ConversationTurn & { id: string; pending?: boolean; error?: boolean };

export const MAX_HISTORY_TURNS = 8;
export const MAX_HISTORY_BYTES = 16_000;
export const MAX_MESSAGE_LENGTH = 4_000;

function historyBytes(turns: ConversationTurn[]): number {
  return new TextEncoder().encode(JSON.stringify(turns)).byteLength;
}

// Keep complete, successful exchanges. A retry sees only the conversation
// before its original question, so that question is not repeated in context.
export function buildConversationHistory(messages: ConversationMessage[], retryId?: string): ConversationTurn[] {
  const retryIndex = retryId ? messages.findIndex((message) => message.id === retryId) : -1;
  const end = retryIndex >= 0 ? retryIndex - 1 : messages.length;
  const history: ConversationTurn[] = [];
  for (let index = 0; index + 1 < end; index++) {
    const question = messages[index];
    const answer = messages[index + 1];
    if (question.role !== "user" || answer.role !== "assistant" || answer.pending || answer.error) continue;
    if (!question.text.trim() || !answer.text.trim() || question.text.length > MAX_MESSAGE_LENGTH || answer.text.length > MAX_MESSAGE_LENGTH) continue;
    history.push({ role: "user", text: question.text }, { role: "assistant", text: answer.text });
    while (history.length > MAX_HISTORY_TURNS || historyBytes(history) > MAX_HISTORY_BYTES) history.splice(0, 2);
    index++;
  }
  return history;
}

export function parseConversationHistory(value: unknown): ConversationTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_TURNS || value.length % 2 !== 0) return null;
  const history: ConversationTurn[] = [];
  for (let index = 0; index < value.length; index++) {
    const turn = value[index];
    if (!turn || typeof turn !== "object" || turn.role !== (index % 2 === 0 ? "user" : "assistant") || typeof turn.text !== "string" || !turn.text.trim() || turn.text.length > MAX_MESSAGE_LENGTH) return null;
    history.push({ role: turn.role, text: turn.text.trim() });
  }
  return historyBytes(history) <= MAX_HISTORY_BYTES ? history : null;
}

// Surface an actionable sentence already present in the assistant's reply.
// No extra AI request or invented diagnosis is needed for the summary card.
export function extractNextCheck(reply: string): string | null {
  const sentences = reply.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const action = /\b(check|inspect|look for|look at|feel|examine|describe|tell me|share|try|make sure|allow|move|wait|let the|start by|avoid|remove)\b/i;
  return sentences.map((sentence) => sentence.trim()).find((sentence) => sentence.length <= 280 && (action.test(sentence) || sentence.endsWith("?"))) ?? null;
}
