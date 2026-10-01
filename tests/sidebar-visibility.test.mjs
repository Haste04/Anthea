import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(path, optional = false) {
  let source = '';
  try { source = await readFile(new URL(path, import.meta.url), 'utf8'); }
  catch (error) { if (!optional || error.code !== 'ENOENT') throw error; }
  return ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
}
const hookCode = await compile('../app/components/workspace/useSidebarVisibility.ts', true);
const shellCode = await compile('../app/components/workspace/WorkspaceShell.tsx');
const KEY = 'anthea.sidebar-visible.v1';

function harness({ saved = null, blockedRead = false, blockedWrite = false } = {}) {
  const window = new EventTarget();
  const values = new Map(saved === null ? [] : [[KEY, saved]]);
  window.localStorage = {
    getItem: key => { if (blockedRead) throw new Error('Blocked storage'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (blockedWrite) throw new Error('Blocked storage'); values.set(key, value); },
  };
  let snapshot;
  let serverSnapshot;
  let unsubscribe;
  let notifications = 0;
  const react = {
    useSyncExternalStore: (subscribe, read, serverRead) => {
      snapshot = read;
      serverSnapshot = serverRead;
      unsubscribe ??= subscribe(() => notifications++);
      return read();
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useState: initial => [initial, () => {}],
  };
  const exports = {};
  vm.runInNewContext(hookCode, { exports, window, Event, require: name => {
    assert.equal(name, 'react'); return react;
  } });
  assert.equal(typeof exports.default, 'function', 'Sidebar visibility hook must exist');
  function read() { return exports.default(); }
  const element = (type, props) => ({ type, props });
  function renderShell() {
    const shell = {};
    vm.runInNewContext(shellCode, { exports: shell, require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'fragment' };
      if (name === './useSidebarVisibility') return exports;
      if (name === 'next/navigation') return { usePathname: () => '/home', useRouter: () => ({ push() {} }) };
      if (name === './WorkspaceProvider') return { useWorkspace: () => ({ data: { chats: [] }, ready: true }) };
      if (name === '@/lib/workspace-data') return { visibleChats: () => [] };
      return { default: name };
    } });
    return shell.default({ children: 'Page content' });
  }
  return {
    read, renderShell, values,
    snapshot: () => snapshot(), serverSnapshot: () => serverSnapshot(),
    notifications: () => notifications,
    storage: (key, value) => {
      if (value === null) values.delete(KEY); else values.set(KEY, value);
      const event = new Event('storage');
      Object.assign(event, { key, storageArea: window.localStorage });
      window.dispatchEvent(event);
    },
    cleanup: () => unsubscribe(),
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = find(child, predicate);
    if (match) return match;
  }
}

test('sidebar defaults to visible and toggles persist for a new visit', () => {
  const app = harness();
  assert.equal(app.read().sidebarVisible, true);
  app.read().toggleSidebar();
  assert.equal(app.snapshot(), false);
  assert.equal(app.values.get(KEY), 'false');
  const nextVisit = harness({ saved: app.values.get(KEY) });
  assert.equal(nextVisit.read().sidebarVisible, false);
  nextVisit.read().toggleSidebar();
  assert.equal(nextVisit.snapshot(), true);
  assert.equal(nextVisit.values.get(KEY), 'true');
  app.cleanup(); nextVisit.cleanup();
});

test('server rendering stays deterministic while hydration restores the saved choice', () => {
  const app = harness({ saved: 'false' });
  app.read();
  assert.equal(app.serverSnapshot(), true);
  assert.equal(app.snapshot(), false);
  app.cleanup();
});

test('blocked storage keeps hide and show working for the current visit', () => {
  for (const options of [{ blockedRead: true, blockedWrite: true }, { blockedWrite: true }]) {
    const app = harness(options);
    assert.equal(app.read().sidebarVisible, true);
    app.read().toggleSidebar();
    assert.equal(app.snapshot(), false);
    app.read().toggleSidebar();
    assert.equal(app.snapshot(), true);
    assert.equal(app.notifications(), 2);
    app.cleanup();
  }
});

test('storage changes sync the preference and subscriptions clean up', () => {
  const app = harness();
  app.read();
  app.storage('unrelated-setting', 'false');
  assert.equal(app.notifications(), 0);
  app.storage(KEY, 'false');
  assert.equal(app.snapshot(), false);
  assert.equal(app.notifications(), 1);
  app.storage(null, null);
  assert.equal(app.snapshot(), true);
  assert.equal(app.notifications(), 2);
  app.cleanup();
  app.storage(KEY, 'false');
  assert.equal(app.notifications(), 2);
});

test('the toggle remains reachable when hidden and marks the desktop sidebar inert', () => {
  const app = harness();
  let tree = app.renderShell();
  const toggle = find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'workspace-sidebar');
  assert.ok(toggle);
  assert.equal(toggle.props.type, 'button');
  assert.equal(toggle.props['aria-expanded'], true);
  assert.equal(toggle.props['aria-label'], 'Hide sidebar');
  toggle.props.onClick();
  tree = app.renderShell();
  const hidden = find(tree, node => node.type === 'aside');
  assert.equal(hidden.props.inert, true);
  assert.equal(hidden.props['aria-hidden'], true);
  assert.match(tree.props.className, /ws-app--sidebar-hidden/);
  const restore = find(tree, node => node.props?.['aria-controls'] === 'workspace-sidebar');
  assert.equal(restore.props['aria-expanded'], false);
  assert.equal(restore.props['aria-label'], 'Show sidebar');
  assert.ok(find(tree, node => node.type === 'dialog'));
  restore.props.onClick();
  const shown = app.renderShell();
  assert.equal(find(shown, node => node.type === 'aside').props.inert, false);
  assert.doesNotMatch(shown.props.className, /ws-app--sidebar-hidden/);
  app.cleanup();
});
