import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../app/components/VoiceCalibration.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function find(node, text) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'button' && node.props.children === text) return node;
  for (const child of [node.props?.children].flat(2)) { const result = find(child, text); if (result) return result; }
}
function harness({ permission, contextThrows = false } = {}) {
  let stopped = 0, cleanup;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  const exports = {};
  const react = {
    useRef: value => ({ current: value }), useState: value => [value, () => {}],
    useSyncExternalStore: () => 0, useEffect: callback => { cleanup = callback(); },
  };
  vm.runInNewContext(code, {
    exports, navigator: { mediaDevices: { getUserMedia: () => permission ?? Promise.resolve(stream) } },
    AudioContext: class { constructor() { if (contextThrows) throw Error('No audio context'); } },
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === '@/lib/voice-feedback') return { microphoneProblem: () => 'Microphone failed' };
      return { VOICE_AUDIO_CONSTRAINTS: {} };
    },
  });
  const tree = exports.default();
  return { start: () => find(tree, 'Start microphone test').props.onClick(), cleanup: () => cleanup(), stream, stopped: () => stopped };
}
test('calibration stops a granted microphone if audio context creation fails', async () => {
  const app = harness({ contextThrows: true });
  app.start();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(app.stopped(), 1);
  app.cleanup();
});
test('leaving calibration before permission resolves stops the late stream', async () => {
  let grant;
  const app = harness({ permission: new Promise(resolve => { grant = resolve; }) });
  app.start(); app.cleanup(); grant(app.stream);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(app.stopped(), 1);
});
