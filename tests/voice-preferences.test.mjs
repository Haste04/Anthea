import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/voice-preferences-store.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup() {
  const api = {};
  const values = new Map();
  const voiceListeners = new Set();
  const subscriptions = [];
  let blocked = false;
  let voices = [];
  vm.runInNewContext(js, {
    exports: api, Event: class { constructor(type) { this.type = type; } },
    require: () => ({ useSyncExternalStore: (subscribe, snapshot) => { subscriptions.push(subscribe(() => {})); return snapshot(); } }),
    window: {
      localStorage: { getItem: key => { if (blocked) throw new Error('Storage denied'); return values.get(key) ?? null; }, setItem: (key, value) => { if (blocked) throw new Error('Storage denied'); values.set(key, value); } },
      dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
      speechSynthesis: { getVoices: () => voices, addEventListener: (event, cb) => voiceListeners.add(cb), removeEventListener: (event, cb) => voiceListeners.delete(cb) },
    },
  });
  return { api, values, voiceListeners, subscriptions, block: () => { blocked = true; }, setVoices: value => { voices = value; } };
}
test('voice choice persists and observes external storage updates', () => {
  const h = setup();
  assert.equal(h.api.saveVoiceChoice('chosen'), true);
  assert.equal(h.api.readVoiceChoice(), 'chosen');
  h.values.set('anthea.voice-choice.v1', 'another-tab');
  assert.equal(h.api.useVoiceChoice(), 'another-tab');
});
test('blocked storage preserves voice choice for this visit', () => {
  const h = setup(); h.block();
  assert.equal(h.api.saveVoiceChoice('chosen'), false);
  assert.equal(h.api.readVoiceChoice(), 'chosen');
});
test('device voices can arrive after initial render and subscriptions clean up', () => {
  const h = setup();
  assert.equal(h.api.useDeviceVoices().length, 0);
  assert.equal(h.voiceListeners.size, 1);
  h.setVoices([{ voiceURI: 'chosen', name: 'Device voice', lang: 'en-GB', default: false }]);
  const voices = h.api.useDeviceVoices();
  assert.equal(voices[0].voiceURI, 'chosen');
  for (const unsubscribe of h.subscriptions) unsubscribe();
  assert.equal(h.voiceListeners.size, 0);
});
