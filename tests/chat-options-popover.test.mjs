import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/components/workspace/RecentChat.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function find(node, predicate) {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return;
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function harness({ width = 1280, height = 800, sidebarRight = 260, buttonTop = 420 } = {}) {
  const document = new EventTarget();
  const window = Object.assign(new EventTarget(), { innerWidth: width, innerHeight: height });
  const refs = [];
  let cursor = 0;
  let pending = [];
  let cleanup = [];
  let open = true;
  const menuDom = { style: {}, isConnected: true, getBoundingClientRect: () => ({ width: 176, height: 128 }),
    showPopover() {}, hidePopover() {}, contains: node => node === menuDom || node === actionDom };
  const actionDom = {};
  const rowDom = { contains: node => node === buttonDom || menuDom.contains(node) };
  const buttonDom = { getBoundingClientRect: () => ({ top: buttonTop, right: sidebarRight - 24 }),
    closest: () => ({ getBoundingClientRect: () => ({ right: sidebarRight }) }), focus() {} };
  const react = {
    useId: () => 'chat-actions',
    useRef: initial => { const i = cursor++; return refs[i] ??= { current: initial }; },
    useEffect: effect => pending.push(effect), useLayoutEffect: effect => pending.unshift(effect),
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(code, { exports, document, window, require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    return { default: name };
  } });
  const render = () => {
    cleanup.forEach(fn => fn?.());
    pending = []; cleanup = []; cursor = 0;
    const tree = exports.default({ chat: { id: 'chat', title: 'Fern care', updatedAt: 1 }, open, selected: false,
      onOpenChange: value => { open = value; }, onNavigate() {}, onPin() {}, onRename() {}, onDelete() {} });
    tree.props.ref.current = rowDom;
    find(tree, node => node.props?.className === 'ws-chat-options').props.ref.current = buttonDom;
    const menu = find(tree, node => node.props?.className === 'ws-chat-actions');
    assert.ok(menu.props.ref, 'Floating options must measure the menu separately from the conversation row');
    menu.props.ref.current = menuDom;
    pending.forEach(effect => cleanup.push(effect()));
    return tree;
  };
  const pointer = target => { const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: target }); document.dispatchEvent(event); };
  return { render, menuDom, actionDom, document, window, pointer, isOpen: () => open,
    cleanup: () => cleanup.forEach(fn => fn?.()) };
}

test('floating chat options align beyond the desktop sidebar', () => {
  const app = harness();
  app.render();
  assert.equal(app.menuDom.style.left, '268px');
  assert.equal(app.menuDom.style.top, '420px');
  app.cleanup();
});

test('floating options stay within narrow screens and above the bottom edge', () => {
  const app = harness({ width: 320, height: 600, sidebarRight: 290, buttonTop: 560 });
  app.render();
  assert.equal(app.menuDom.style.left, '136px');
  assert.equal(app.menuDom.style.top, '464px');
  app.cleanup();
});

test('menu interaction remains open while outside clicks, scrolling, and resizing dismiss it', () => {
  for (const dismiss of [app => app.pointer({}), app => app.document.dispatchEvent(new Event('scroll')), app => app.window.dispatchEvent(new Event('resize'))]) {
    const app = harness();
    app.render();
    app.pointer(app.actionDom);
    assert.equal(app.isOpen(), true);
    dismiss(app);
    assert.equal(app.isOpen(), false);
    app.render();
    app.cleanup();
  }
});
