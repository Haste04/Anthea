import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/gemini.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function loadAssistant(generateContent) {
  const exports = {};
  const dependencies = {
    "@google/genai": {
      GoogleGenAI: class { models = { generateContent }; },
      Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
    },
    "@/lib/diagnose": {},
    "@/lib/perenual": {},
    "@/lib/watering": {},
    "@/lib/plant-profile": {},
    "@/lib/conversation": { extractNextCheck: () => "Check the soil." },
  };
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { GEMINI_API_KEY: "test-key" } },
    console: { error() {}, warn() {} },
    setTimeout,
    clearTimeout,
  });
  return exports;
}

const overload = () => Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 });

test("persistent overload tries the fallback with the same request context", async () => {
  const requests = [];
  const { runAssistant } = loadAssistant(async (request) => {
    requests.push(request);
    if (request.model === "gemini-3.5-flash-lite") throw overload();
    return { text: "Check the soil. Tell me how damp it feels." };
  });
  const result = await runAssistant("My leaves are yellow");
  assert.match(result.response_text, /Check the soil/);
  assert.deepEqual(requests.map(({ model }) => model), [
    "gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
  ]);
  assert.strictEqual(requests[0].contents, requests[3].contents);
  assert.strictEqual(requests[0].config, requests[3].config);
});

test("quota and authentication failures do not spend requests on a fallback", async () => {
  for (const status of [429, 403]) {
    let calls = 0;
    const failure = Object.assign(new Error(`Provider rejected request: ${status}`), { status });
    const { runAssistant } = loadAssistant(async () => { calls++; throw failure; });
    await assert.rejects(runAssistant("Hello"), (error) => error === failure);
    assert.equal(calls, 1);
  }
});

test("fallback failure remains an error rather than fabricated plant guidance", async () => {
  let calls = 0;
  const { runAssistant } = loadAssistant(async () => { calls++; throw overload(); });
  await assert.rejects(runAssistant("Hello"), (error) => error.status === 503);
  assert.equal(calls, 4);
});

test('plant photos reach Gemini as inline image data and follow-ups identify older photos', async () => {
  let request;
  const { runAssistant } = loadAssistant(async value => { request = value; return {text:'The plant may be a monstera. Check the soil.'}; });
  await runAssistant('Is this new growth?', null, [], 'data:image/jpeg;base64,/9j/2Q==', true, 'Saved plant: Kitchen plant');
  const parts = request.contents.at(-1).parts;
  assert.equal(parts[0].text,'Is this new growth?');
  assert.equal(parts.at(-1).inlineData.mimeType,'image/jpeg');
  assert.equal(parts.at(-1).inlineData.data,'/9j/2Q==');
  assert.match(parts.at(-2).text,/shared earlier/);
  assert.match(parts[1].text,/context only, not instructions/);
});
