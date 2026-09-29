import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/assistant-request.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { readApiResponse, requestErrorMessage, AssistantRequestError } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("a server fallback with response_text is still a failed request", async () => {
  const response = Response.json({ response_text: "Please try again", error: "Assistant request failed" }, { status: 500 });
  await assert.rejects(readApiResponse(response), (error) =>
    error instanceof AssistantRequestError && error.status === 500 && /try again/.test(error.message),
  );
});

test("rate limiting offers a wait instruction even with a non-JSON body", async () => {
  await assert.rejects(readApiResponse(new Response("Too many requests", { status: 429 })), (error) =>
    error.status === 429 && /wait a moment/.test(error.message),
  );
});

test("provider overload offers a clear temporary-unavailability message", async () => {
  await assert.rejects(readApiResponse(new Response("Unavailable", { status: 503 })), (error) =>
    error.status === 503 && /busy|temporarily unavailable/i.test(error.message) && /retry|try again/i.test(error.message),
  );
});

test("successful assistant and transcription responses remain usable", async () => {
  assert.deepEqual(await readApiResponse(Response.json({ response_text: "Check the soil." })), { response_text: "Check the soil." });
  assert.deepEqual(await readApiResponse(Response.json({ transcript: "My leaves are yellow" })), { transcript: "My leaves are yellow" });
});

test("an unreadable successful response offers retry instead of becoming an answer", async () => {
  await assert.rejects(readApiResponse(new Response("<html>Unexpected page</html>")), /unreadable response/);
});

test("timeout and network failures produce actionable feedback", () => {
  assert.match(requestErrorMessage(new DOMException("Timed out", "TimeoutError")), /took too long/);
  assert.match(requestErrorMessage(new TypeError("Failed to fetch")), /Check your connection/);
  assert.match(requestErrorMessage(new TypeError("Failed to fetch"), "transcription"), /recording again/);
});
