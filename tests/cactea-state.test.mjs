import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/cactea-state.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resolveCacteaState } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("maps Anthea activity to the matching Cactea state", () => {
  assert.equal(resolveCacteaState("idle", null), "idle");
  assert.equal(resolveCacteaState("listening", null), "listening");
  assert.equal(resolveCacteaState("processing", null), "thinking");
  assert.equal(resolveCacteaState("speaking", null), "speaking");
});

test("brief response feedback takes precedence over ongoing speech state", () => {
  assert.equal(resolveCacteaState("speaking", "success"), "success");
  assert.equal(resolveCacteaState("speaking", "error"), "error");
});
