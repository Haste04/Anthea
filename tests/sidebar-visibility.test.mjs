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
const recentChatCode = await compile('../app/components/workspace/RecentChat.tsx', true);
const workspaceData = {};
vm.runInNewContext(await compile('../lib/workspace-data.ts'), { exports: workspaceData });
const KEY = 'anthea.sidebar-visible.v1';

function harness({ saved = null, blockedRead = false, blockedWrite = false, chats = [] } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  const data = { chats };
  let activeChatId = null;
  let promptAnswer = null;
  let confirmAnswer = false;
  const navigations = [];
  window.prompt = () => promptAnswer;
  window.confirm = () => confirmAnswer;
  const values = new Map(saved === null ? [] : [[KEY, saved]]);
  window.localStorage = {
    getItem: key => { if (blockedRead) throw new Error('Blocked storage'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (blockedWrite) throw new Error('Blocked storage'); values.set(key, value); },
  };
  let snapshot;
  let serverSnapshot;
  let unsubscribe;
  let notifications = 0;
  const state = [];
  let stateIndex = 0;
  let effects = [];
  let nextId = 0;
  const react = {
    useId: () => `options-${++nextId}`,
    useSyncExternalStore: (subscribe, read, serverRead) => {
      snapshot = read;
      serverSnapshot = serverRead;
      unsubscribe ??= subscribe(() => notifications++);
      return read();
    },
    useEffect: effect => { effects.push(effect()); },
    useLayoutEffect: effect => { effects.push(effect()); },
    useRef: () => ({ current: null }),
    useState: initial => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
  };
  const exports = {};
  vm.runInNewContext(hookCode, { exports, window, Event, require: name => {
    assert.equal(name, 'react'); return react;
  } });
  assert.equal(typeof exports.default, 'function', 'Sidebar visibility hook must exist');
  function read() { return exports.default(); }
  const element = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
  const recentChat = {};
  vm.runInNewContext(recentChatCode, { exports: recentChat, document, window, require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element };
    return { default: name };
  } });
  function renderShell(pathname = '/home') {
    for (const cleanup of effects) cleanup?.();
    effects = [];
    stateIndex = 0;
    const shell = {};
    vm.runInNewContext(shellCode, { exports: shell, window, require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'fragment' };
      if (name === './useSidebarVisibility') return exports;
      if (name === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ push: path => navigations.push(path) }) };
      if (name === './RecentChat') return recentChat.default ? recentChat : { default: './RecentChat' };
      if (name === './WorkspaceProvider') return { useWorkspace: () => ({ data, ready: true, activeChatId,
        setActiveChatId: id => { activeChatId = id; }, newChat: () => { activeChatId = 'draft'; },
        save: (collection, record) => { assert.equal(collection, 'chats'); data.chats = data.chats.map(chat => chat.id === record.id ? record : chat); },
        remove: (collection, id) => { assert.equal(collection, 'chats'); data.chats = data.chats.filter(chat => chat.id !== id); if (activeChatId === id) activeChatId = null; },
      }) };
      if (name === '@/lib/workspace-data') return workspaceData;
      return { default: name };
    } });
    return shell.default({ children: 'Page content' });
  }
  return {
    read, renderShell, values, data, navigations,
    activeChat: () => activeChatId,
    prompt: value => { promptAnswer = value; }, confirm: value => { confirmAnswer = value; },
    snapshot: () => snapshot(), serverSnapshot: () => serverSnapshot(),
    notifications: () => notifications,
    storage: (key, value) => {
      if (value === null) values.delete(KEY); else values.set(KEY, value);
      const event = new Event('storage');
      Object.assign(event, { key, storageArea: window.localStorage });
      window.dispatchEvent(event);
    },
    keydown: key => {
      const event = new Event('keydown');
      Object.assign(event, { key });
      window.dispatchEvent(event);
    },
    cleanup: () => { unsubscribe(); for (const cleanup of effects) cleanup?.(); },
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return;
  }
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = find(child, predicate);
    if (match) return match;
  }
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node?.props?.['aria-hidden'] === 'true' ? '' : textOf(node?.props?.children ?? '');
}
function savedChats() {
  return [
    { id: 'old', title: 'Older fern', updatedAt: 1, messages: [{ id: 'u1', role: 'user', text: 'Fern care' }] },
    { id: 'new', title: 'Newer cactus', updatedAt: 2, messages: [{ id: 'u2', role: 'user', text: 'Cactus care' }] },
  ];
}
function container(app, mobile = false) { return find(app.renderShell('/dashboard'), node => node.type === (mobile ? 'dialog' : 'aside')); }
function options(app, title, mobile = false) {
  const button = find(container(app, mobile), node => node.type === 'button' && node.props['aria-label'] === `Options for ${title}`);
  assert.ok(button, `Options missing for ${title}`);
  return button;
}
function action(app, label, mobile = false) {
  const actions = find(container(app, mobile), node => node.props?.role === 'group' && !node.props.hidden);
  const button = find(actions, node => node.type === 'button' && textOf(node) === label);
  assert.ok(button, `${label} action missing`);
  return button;
}

test('recent chat options open independently of navigation and pin or unpin the targeted chat', () => {
  const app = harness({ chats: savedChats() });
  options(app, 'Older fern').props.onClick();
  assert.equal(options(app, 'Older fern').props['aria-expanded'], true);
  assert.equal(app.activeChat(), null);
  assert.equal(app.navigations.length, 0);
  action(app, 'Pin').props.onClick();
  assert.equal(app.data.chats.find(chat => chat.id === 'old').pinned, true);
  assert.equal(app.data.chats.find(chat => chat.id === 'old').updatedAt, 1);
  assert.equal(app.data.chats.find(chat => chat.id === 'new').pinned, undefined);
  assert.equal(options(app, 'Older fern').props['aria-expanded'], false);
  const firstChat = find(container(app), node => node.type === 'button' && node.props.className === 'ws-recent-chat-link');
  assert.match(textOf(firstChat), /Older fern/);
  options(app, 'Older fern').props.onClick();
  action(app, 'Unpin').props.onClick();
  assert.equal(app.data.chats.find(chat => chat.id === 'old').pinned, false);
  const chatButton = find(container(app), node => node.type === 'button' && node.props.className === 'ws-recent-chat-link');
  assert.match(textOf(chatButton), /Newer cactus/);
  chatButton.props.onClick();
  assert.equal(app.activeChat(), 'new');
  assert.deepEqual(app.navigations, ['/dashboard']);
  app.cleanup();
});

test('sidebar rename trims and bounds only the selected title and ignores cancelled or empty names', () => {
  const app = harness({ chats: savedChats() });
  for (const answer of [null, '   ', `  ${'F'.repeat(130)}  `]) {
    app.prompt(answer);
    options(app, 'Older fern').props.onClick();
    action(app, 'Rename').props.onClick();
    assert.equal(app.data.chats[0].title, answer?.trim() ? 'F'.repeat(120) : 'Older fern');
  }
  assert.equal(app.data.chats[1].title, 'Newer cactus');
  assert.equal(app.data.chats[0].messages[0].text, 'Fern care');
  assert.equal(app.navigations.length, 0);
  app.cleanup();
});

test('sidebar deletion asks for confirmation and removes only the chosen conversation', () => {
  const app = harness({ chats: savedChats() });
  options(app, 'Older fern').props.onClick();
  action(app, 'Delete').props.onClick();
  assert.equal(app.data.chats.length, 2);
  app.confirm(true);
  options(app, 'Older fern').props.onClick();
  action(app, 'Delete').props.onClick();
  assert.deepEqual(app.data.chats.map(chat => chat.id), ['new']);
  assert.equal(app.navigations.length, 0);
  app.cleanup();
});

test('desktop and mobile chat options have unique controls, one open menu, and Escape dismissal', () => {
  const app = harness({ chats: savedChats() });
  const desktop = options(app, 'Older fern');
  const mobile = options(app, 'Older fern', true);
  assert.notEqual(desktop.props['aria-controls'], mobile.props['aria-controls']);
  desktop.props.onClick();
  options(app, 'Newer cactus', true).props.onClick();
  assert.equal(options(app, 'Older fern').props['aria-expanded'], false);
  assert.equal(options(app, 'Newer cactus', true).props['aria-expanded'], true);
  assert.ok(action(app, 'Pin', true));
  const row = find(container(app, true), node => node.props?.className?.includes('ws-recent-chat') && typeof node.props.onKeyDown === 'function');
  // Select the row containing the open options control.
  const openRow = find(container(app, true), node => typeof node.props?.onKeyDown === 'function' && find(node, child => child.props?.['aria-label'] === 'Options for Newer cactus'));
  assert.ok(row && openRow);
  let prevented = false;
  openRow.props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(options(app, 'Newer cactus', true).props['aria-expanded'], false);
  app.cleanup();
});

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

test('collapsing preserves accessible navigation and new chat, and can expand again', () => {
  const app = harness();
  let tree = app.renderShell();
  const toggle = find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'workspace-sidebar');
  assert.ok(toggle);
  assert.equal(toggle.props.type, 'button');
  assert.equal(toggle.props['aria-expanded'], true);
  assert.equal(toggle.props['aria-label'], 'Collapse sidebar');
  toggle.props.onClick();
  tree = app.renderShell();
  const rail = find(tree, node => node.type === 'aside');
  assert.ok(!rail.props.inert);
  assert.ok(!rail.props['aria-hidden']);
  assert.match(tree.props.className, /ws-app--sidebar-collapsed/);
  assert.ok(find(rail, node => node.props?.['aria-controls'] === 'workspace-sidebar'));
  for (const [label, href] of [['Home', '/home'], ['Chat', '/dashboard'], ['My Plants', '/plants'], ['Settings', '/settings']]) {
    const link = find(rail, node => node.props?.href === href && node.props['aria-label'] === label);
    assert.ok(link, `${label} remains accessible in the rail`);
    assert.ok(find(rail, node => node.props?.role === 'tooltip' && node.props.children === label));
  }
  assert.ok(find(rail, node => node.type === 'button' && node.props['aria-label'] === 'New Chat' && !node.props.disabled));
  const restore = find(tree, node => node.props?.['aria-controls'] === 'workspace-sidebar');
  assert.equal(restore.props['aria-expanded'], false);
  assert.equal(restore.props['aria-label'], 'Expand sidebar');
  assert.ok(find(tree, node => node.type === 'dialog'));
  restore.props.onClick();
  const shown = app.renderShell();
  assert.ok(!find(shown, node => node.type === 'aside').props.inert);
  assert.doesNotMatch(shown.props.className, /ws-app--sidebar-collapsed/);
  app.cleanup();
});

test('each workspace route marks only its own primary navigation link active', () => {
  const app = harness({ saved: 'false' });
  for (const pathname of ['/home', '/dashboard', '/plants', '/settings']) {
    const rail = find(app.renderShell(pathname), node => node.type === 'aside');
    for (const href of ['/home', '/dashboard', '/plants', '/settings']) {
      const link = find(rail, node => node.props?.href === href && node.props.className?.includes('ws-nav-item'));
      assert.equal(link.props['aria-current'], href === pathname ? 'page' : undefined);
      assert.equal(link.props.className.includes('is-active'), href === pathname);
    }
  }
  app.cleanup();
});

test('rail tooltips dismiss with Escape and return for the next focused action', () => {
  const app = harness({ saved: 'false' });
  let rail = find(app.renderShell(), node => node.type === 'aside');
  const hovered = find(rail, node => node.props?.className === 'ws-rail-action');
  hovered.props.onPointerEnter({ currentTarget: { getBoundingClientRect: () => ({ right: 54, top: 60, height: 44 }) } });
  app.renderShell();
  app.keydown('Escape');
  rail = find(app.renderShell(), node => node.type === 'aside');
  assert.equal(rail.props['data-tooltip-dismissed'], true);
  const action = find(rail, node => node.props?.className === 'ws-rail-action');
  action.props.onFocusCapture({ currentTarget: { getBoundingClientRect: () => ({ right: 54, top: 60, height: 44 }) } });
  rail = find(app.renderShell(), node => node.type === 'aside');
  assert.equal(rail.props['data-tooltip-dismissed'], false);
  const tooltip = find(rail, node => node.props?.role === 'tooltip');
  assert.equal(tooltip.props.style.left, 66);
  assert.equal(tooltip.props.style.top, 82);
  app.cleanup();
});

test('hovering another action replaces the focused tooltip without overlapping labels', () => {
  const app = harness({ saved: 'false' });
  const event = { currentTarget: { getBoundingClientRect: () => ({ right: 54, top: 60, height: 44 }) } };
  let rail = find(app.renderShell(), node => node.type === 'aside');
  const home = find(rail, node => node.props?.className === 'ws-rail-action' && find(node, child => child.props?.['aria-label'] === 'Home'));
  home.props.onFocusCapture(event);
  rail = find(app.renderShell(), node => node.type === 'aside');
  assert.equal(find(rail, node => node.props?.role === 'tooltip' && node.props.children === 'Home').props['data-active'], true);
  const settings = find(rail, node => node.props?.className === 'ws-rail-action' && find(node, child => child.props?.['aria-label'] === 'Settings'));
  settings.props.onPointerEnter(event);
  rail = find(app.renderShell(), node => node.type === 'aside');
  assert.equal(find(rail, node => node.props?.role === 'tooltip' && node.props.children === 'Home').props['data-active'], false);
  assert.equal(find(rail, node => node.props?.role === 'tooltip' && node.props.children === 'Settings').props['data-active'], true);
  app.cleanup();
});

test('recent chats minimize and expand without changing search or full-history selection', () => {
  const chats = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, title: `Conversation ${i}`, updatedAt: i + 1, messages: [{ role: 'user', text: 'Help my fern' }] }));
  const app = harness({ chats });
  let rail = find(app.renderShell(), node => node.type === 'aside');
  find(rail, node => node.type === 'button' && node.props.children === 'View all 10 conversations').props.onClick();
  rail = find(app.renderShell(), node => node.type === 'aside');
  find(rail, node => node.props?.['aria-label'] === 'Search all conversations').props.onChange({ target: { value: 'Conversation 1' } });
  rail = find(app.renderShell(), node => node.type === 'aside');
  const toggle = find(rail, node => node.props?.['aria-label'] === 'Minimize recent chats');
  assert.ok(toggle, 'Recent chats needs its own minimize control');
  assert.equal(toggle.props['aria-expanded'], true);
  const contentId = toggle.props['aria-controls'];
  assert.equal(find(rail, node => node.props?.id === contentId).props.hidden, false);
  toggle.props.onClick();
  rail = find(app.renderShell(), node => node.type === 'aside');
  assert.equal(find(rail, node => node.props?.id === contentId).props.hidden, true);
  assert.ok(find(rail, node => node.type === 'h2' && node.props.children === 'All conversations'));
  const restore = find(rail, node => node.props?.['aria-label'] === 'Expand recent chats');
  assert.equal(restore.props['aria-expanded'], false);
  restore.props.onClick();
  rail = find(app.renderShell(), node => node.type === 'aside');
  assert.equal(find(rail, node => node.props?.id === contentId).props.hidden, false);
  assert.equal(find(rail, node => node.props?.['aria-label'] === 'Search all conversations').props.value, 'Conversation 1');
  assert.ok(find(rail, node => node.type === 'button' && node.props.children === 'Show recent chats'));
  app.cleanup();
});

test('desktop and mobile recent-chat controls have distinct targets and share minimized state', () => {
  const app = harness();
  let tree = app.renderShell();
  const rail = find(tree, node => node.type === 'aside');
  const drawer = find(tree, node => node.type === 'dialog');
  const desktop = find(rail, node => node.props?.['aria-label'] === 'Minimize recent chats');
  const mobile = find(drawer, node => node.props?.['aria-label'] === 'Minimize recent chats');
  assert.ok(desktop && mobile);
  assert.notEqual(desktop.props['aria-controls'], mobile.props['aria-controls']);
  mobile.props.onClick();
  tree = app.renderShell();
  for (const container of ['aside', 'dialog']) {
    const section = find(tree, node => node.type === container);
    const toggle = find(section, node => node.props?.['aria-label'] === 'Expand recent chats');
    assert.equal(toggle.props['aria-expanded'], false);
    assert.equal(find(section, node => node.props?.id === toggle.props['aria-controls']).props.hidden, true);
  }
  app.cleanup();
});
