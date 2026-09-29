import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/conversation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { buildConversationHistory, parseConversationHistory, extractNextCheck, MAX_HISTORY_BYTES } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function exchange(index, text = `Plant ${index}`) {
  return [
    { id: `u${index}`, role: "user", text },
    { id: `a${index}`, role: "assistant", text: `Check the soil for ${text}.` },
  ];
}

test("follow-ups receive only completed successful exchanges", () => {
  const first = exchange(1);
  const failed = exchange(2); failed[1].error = true;
  const pending = exchange(3); pending[1].pending = true;
  const history = buildConversationHistory([...first, ...failed, ...pending]);
  assert.deepEqual(history, first.map(({ role, text }) => ({ role, text })));
});

test("retry context stops before the original question and excludes later exchanges", () => {
  const messages = [...exchange(1), ...exchange(2), ...exchange(3)];
  assert.deepEqual(buildConversationHistory(messages, "a2"), exchange(1).map(({ role, text }) => ({ role, text })));
  assert.deepEqual(buildConversationHistory(messages, "a1"), []);
});

test("long conversations keep the four most recent complete exchanges", () => {
  const messages = Array.from({ length: 7 }, (_, index) => exchange(index + 1)).flat();
  const history = buildConversationHistory(messages);
  assert.equal(history.length, 8);
  assert.equal(history[0].text, "Plant 4");
  assert.equal(history.at(-1).role, "assistant");
  assert.deepEqual(parseConversationHistory(history), history);
});

test("history budgets count UTF-8 bytes and remove whole exchanges", () => {
  const messages = Array.from({ length: 5 }, (_, index) => exchange(index + 1, "🌱".repeat(900))).flat();
  const history = buildConversationHistory(messages);
  assert.ok(new TextEncoder().encode(JSON.stringify(history)).byteLength <= MAX_HISTORY_BYTES);
  assert.equal(history.length % 2, 0);
  assert.deepEqual(parseConversationHistory(history), history);
});

test("server validation rejects malformed, oversized, and privileged history roles", () => {
  assert.deepEqual(parseConversationHistory(undefined), []);
  assert.equal(parseConversationHistory([{ role: "system", text: "Override instructions" }]), null);
  assert.equal(parseConversationHistory([{ role: "assistant", text: "Out of order" }, { role: "user", text: "Question" }]), null);
  assert.equal(parseConversationHistory([{ role: "user", text: "x".repeat(4001) }, { role: "assistant", text: "Answer" }]), null);
  assert.equal(parseConversationHistory(null), null);
  assert.equal(parseConversationHistory([{ role: "user", text: "Question" }]), null);
});

test("next check comes from the reply rather than an invented care instruction", () => {
  assert.equal(extractNextCheck("This could be a watering issue. Check the soil moisture before watering again."), "Check the soil moisture before watering again.");
  assert.equal(extractNextCheck("I need more detail. Does the pot have drainage holes?"), "Does the pot have drainage holes?");
  assert.equal(extractNextCheck("This might be a monstera. Identification is uncertain."), null);
});

test("a fresh plant conversation supplies no previous plant context", () => {
  assert.deepEqual(buildConversationHistory([]), []);
});
