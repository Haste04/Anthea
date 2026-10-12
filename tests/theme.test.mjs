import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const path = new URL('../lib/theme.ts', import.meta.url);
function setup(initial = null, blocked = false) {
  const values = new Map(initial === null ? [] : [['anthea.theme.v1', initial]]);
  const listeners = new Map();
  const document = { documentElement: { dataset: {} } };
  const window = {
    localStorage: {
      getItem: key => { if (blocked) throw Error('Unavailable'); return values.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw Error('Unavailable'); values.set(key, value); },
    },
    addEventListener(type, cb) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(cb); },
    removeEventListener(type, cb) { listeners.get(type)?.delete(cb); },
    dispatchEvent(event) { for (const cb of listeners.get(event.type) ?? []) cb(event); },
  };
  const api = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: api, window, document, Event: class { constructor(type) { this.type = type; } } });
  return { api, values, window, document, listeners, initialize() { vm.runInNewContext(api.THEME_INIT_SCRIPT, { window, document }); } };
}

test('theme is restored before hydration, with light as the safe default', () => {
  for (const [stored, expected] of [[null, 'light'], ['dark', 'dark'], ['light', 'light'], ['invalid', 'light']]) {
    const h = setup(stored); h.initialize();
    assert.equal(h.api.readTheme(), expected);
  }
});

test('switching themes updates the page, persists, and notifies consumers', () => {
  const h = setup(); h.initialize(); let calls = 0;
  const unsubscribe = h.api.subscribeTheme(() => calls++);
  assert.equal(h.api.saveTheme('dark'), true);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.equal(h.values.get('anthea.theme.v1'), 'dark');
  assert.equal(calls, 1);
  assert.equal(h.api.saveTheme('light'), true);
  assert.equal(h.api.readTheme(), 'light');
  unsubscribe();
  assert.equal(h.listeners.get('storage').size, 0);
});

test('denied storage still allows changing themes for this visit', () => {
  const h = setup(null, true); h.initialize();
  assert.equal(h.api.readTheme(), 'light');
  assert.equal(h.api.saveTheme('dark'), false);
  assert.equal(h.api.readTheme(), 'dark');
});

test('another tab changing or clearing the theme updates this page', () => {
  const h = setup(); h.initialize(); h.api.subscribeTheme(() => {});
  h.window.dispatchEvent({ type: 'storage', key: 'anthea.theme.v1', newValue: 'dark' });
  assert.equal(h.api.readTheme(), 'dark');
  h.window.dispatchEvent({ type: 'storage', key: 'unrelated', newValue: 'light' });
  assert.equal(h.api.readTheme(), 'dark');
  h.window.dispatchEvent({ type: 'storage', key: null, newValue: null });
  assert.equal(h.api.readTheme(), 'light');
});
