import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Use the existing compiler so this suite also works on Node without TS stripping.
const source = await readFile(new URL("../lib/visualizer.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { startVisualizer } = await import(
  `data:text/javascript;base64,${Buffer.from(`${outputText}\n//# sourceURL=visualizer.ts`).toString("base64")}`
);

function browserHarness(t, { reduced = false, hidden = false } = {}) {
  const frames = new Map();
  const cleanups = [];
  const media = new EventTarget();
  media.matches = reduced;
  const doc = new EventTarget();
  doc.hidden = hidden;
  let nextId = 0;
  let time = 0;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousComputedStyle = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      matchMedia: () => media,
      requestAnimationFrame(callback) {
        frames.set(++nextId, callback);
        return nextId;
      },
      cancelAnimationFrame(id) { frames.delete(id); },
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({
      getPropertyValue: (name) => ({
        "--primary": "#046241",
        "--lw-forest": "#133020",
        "--accent": "#ffb347",
        "--selected-strong": "#d9e9dc",
        "--selected": "#e8f1e9",
      })[name] ?? "",
    }),
  });
  t.after(() => {
    cleanups.forEach((cleanup) => cleanup());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
    if (previousComputedStyle) Object.defineProperty(globalThis, "getComputedStyle", previousComputedStyle);
    else delete globalThis.getComputedStyle;
  });

  return {
    frames,
    cleanup(callback) { cleanups.push(callback); },
    step() {
      time += 16;
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback(time));
    },
    reduce(value) {
      media.matches = value;
      media.dispatchEvent(new Event("change"));
    },
    hide(value) {
      doc.hidden = value;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

function canvasHarness() {
  const draws = [];
  let radii = [];
  const context = {
    clearRect() { radii = []; },
    beginPath() {},
    arc(_x, _y, radius) { radii.push(radius); },
    stroke() {},
    createRadialGradient() { return { addColorStop() {} }; },
    fill() { draws.push(radii.at(-1)); },
  };
  return { draws, canvas: { getContext: () => context } };
}

test("idle avatars draw once without scheduling ongoing frames", (t) => {
  const browser = browserHarness(t);
  const { canvas, draws } = canvasHarness();
  const stop = startVisualizer(canvas, { current: 0 }, "idle");
  browser.cleanup(stop);
  assert.equal(draws.length, 1);
  assert.equal(browser.frames.size, 0);
  browser.step();
  assert.equal(draws.length, 1);
});

test("listening reads fresh amplitude without restarting the visualizer", (t) => {
  const browser = browserHarness(t);
  const { canvas, draws } = canvasHarness();
  const amplitude = { current: 0 };
  const stop = startVisualizer(canvas, amplitude, "listening");
  browser.cleanup(stop);
  browser.step();
  const quietRadius = draws.at(-1);
  amplitude.current = 1;
  browser.step();
  assert.ok(draws.at(-1) > quietRadius);
  assert.equal(browser.frames.size, 1);
});

for (const mode of ["listening", "processing", "speaking"]) {
  test(`${mode} pauses and resumes when reduced motion changes`, (t) => {
    const browser = browserHarness(t, { reduced: true });
    const { canvas, draws } = canvasHarness();
    const stop = startVisualizer(canvas, { current: 0.5 }, mode);
    browser.cleanup(stop);
    assert.equal(draws.length, 1);
    assert.equal(browser.frames.size, 0);
    browser.reduce(false);
    assert.equal(browser.frames.size, 1);
    browser.step();
    browser.reduce(true);
    assert.equal(browser.frames.size, 0);
    const stoppedDraws = draws.length;
    browser.step();
    assert.equal(draws.length, stoppedDraws);
  });
}

test("a hidden tab schedules no drawing and resumes one loop when visible", (t) => {
  const browser = browserHarness(t, { hidden: true });
  const { canvas } = canvasHarness();
  const stop = startVisualizer(canvas, { current: 0 }, "speaking");
  browser.cleanup(stop);
  assert.equal(browser.frames.size, 0);
  browser.hide(false);
  assert.equal(browser.frames.size, 1);
  browser.hide(true);
  assert.equal(browser.frames.size, 0);
  browser.hide(false);
  assert.equal(browser.frames.size, 1);
});

test("cleanup and a remount leave no extra frame or event subscriptions", (t) => {
  const browser = browserHarness(t);
  const { canvas } = canvasHarness();
  const firstStop = startVisualizer(canvas, { current: 0 }, "processing");
  firstStop();
  const secondStop = startVisualizer(canvas, { current: 0 }, "processing");
  assert.equal(browser.frames.size, 1);
  secondStop();
  assert.equal(browser.frames.size, 0);
  browser.reduce(true);
  browser.reduce(false);
  browser.hide(true);
  browser.hide(false);
  assert.equal(browser.frames.size, 0);
});

test("conversation history adds no loops alongside the active avatar", (t) => {
  const browser = browserHarness(t);
  const stops = Array.from({ length: 30 }, () =>
    startVisualizer(canvasHarness().canvas, { current: 0 }, "idle"),
  );
  stops.push(startVisualizer(canvasHarness().canvas, { current: 0 }, "processing"));
  browser.cleanup(() => stops.forEach((stop) => stop()));
  assert.equal(browser.frames.size, 1);
  browser.step();
  assert.equal(browser.frames.size, 1);
});
