import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(path) {
  let source = '';
  try { source = await readFile(new URL(path, import.meta.url), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
}
const detector = {};
vm.runInNewContext(await compile('../lib/lifewood.ts'), { exports: detector });
const hookCode = await compile('../app/dashboard/useLifewoodGreeting.ts');

test('recognizes Lifewood and speech spacing without matching other words', () => {
  assert.equal(typeof detector.heardLifewood, 'function');
  for (const phrase of ['Lifewood', 'Hello, LIFEWOOD!', 'I work at Life wood.', 'Life-wood']) {
    assert.equal(detector.heardLifewood(phrase), true, phrase);
  }
  for (const phrase of ['', 'wood', 'life', 'Lifewoodland', 'myLifewood', 'wildlife wood']) {
    assert.equal(detector.heardLifewood(phrase), false, phrase);
  }
});

function harness() {
  const slots = [];
  let cursor = 0;
  let cleanup;
  let id = 0;
  let now = 0;
  const timers = new Map();
  const hook = {};
  vm.runInNewContext(hookCode, {
    exports: hook,
    setTimeout: (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id; },
    clearTimeout: timer => timers.delete(timer),
    require: name => name === '@/lib/lifewood' ? detector : {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = value; }];
      },
      useRef: initial => {
        const index = cursor++;
        slots[index] ??= { current: initial };
        return slots[index];
      },
      useCallback: callback => callback,
      useEffect: effect => { cleanup ??= effect(); },
    },
  });
  assert.equal(typeof hook.default, 'function', 'The voice greeting controller must exist');
  const read = () => { cursor = 0; return hook.default(); };
  return {
    read, timers,
    advance: duration => {
      now += duration;
      for (const [timerId, timer] of timers) {
        if (timer.at <= now) { timers.delete(timerId); timer.callback(); }
      }
    },
    cleanup: () => cleanup?.(),
  };
}

test('a voice mention shows one brief greeting per recording then returns to normal', () => {
  const app = harness();
  app.read().trigger('How do I water my fern?');
  assert.equal(app.read().active, false);
  app.read().trigger('Hello Lifewood');
  assert.equal(app.read().active, true);
  app.advance(1500);
  app.read().trigger('Lifewood again');
  app.advance(499);
  assert.equal(app.read().active, true);
  app.advance(1);
  assert.equal(app.read().active, false);
  app.read().trigger('Lifewood');
  assert.equal(app.read().active, false);
  app.read().reset();
  app.read().trigger('Lifewood');
  assert.equal(app.read().active, true);
});

test('starting another recording clears the greeting and cancels its expiry', () => {
  const app = harness();
  app.read().trigger('Lifewood');
  const staleExpiry = [...app.timers.values()][0].callback;
  app.read().reset();
  assert.equal(app.read().active, false);
  assert.equal(app.timers.size, 0);
  app.read().trigger('Life wood');
  staleExpiry();
  assert.equal(app.read().active, true, 'An old timer cannot end a newer greeting');
});

test('unmount cancels pending greeting work', () => {
  const app = harness();
  app.read().trigger('Lifewood');
  app.cleanup();
  assert.equal(app.timers.size, 0);
});

function elements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}

const jsx = (type, props) => ({ type, props });
const styles = { default: new Proxy({}, { get: (_, name) => name }) };
const panel = {};
vm.runInNewContext(await compile('../app/dashboard/CompanionPanel.tsx'), {
  exports: panel,
  require: name => {
    if (name === 'react') return { useState: value => [value, () => {}], useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('.css')) return styles;
    if (name.includes('useHomeMascotFollow')) return { useMascotEyeFollow: () => ({ current: null }) };
    return { default: name };
  },
});

test('the greeting replaces companion suggestions and returns to normal status afterwards', () => {
  const props = { mode: 'processing', state: 'lifewood', actionsDisabled: true, children: null };
  const greeting = panel.default(props);
  const status = elements(greeting, node => node.props?.role === 'status');
  assert.ok(status.length >= 1);
  assert.match(status[0].props.children, /Hello, Lifewood/);
  assert.equal(elements(greeting, node => node.type === 'button').length, 0);
  const normal = panel.default({ ...props, state: 'thinking' });
  assert.equal(elements(normal, node => node.props?.role === 'status').length, 0);
  assert.ok(elements(normal, node => node.type === 'p').some(node => node.props.children === 'Let’s work it out.'));
});

test('the greeting includes a compact mascot outside the companion section hidden on small screens', () => {
  const greeting = panel.default({ mode: 'processing', state: 'lifewood', actionsDisabled: true, children: 'Normal greeting strip' });
  assert.equal(greeting.props['data-greeting'], 'lifewood');
  const compact = greeting.props.children.find(child => child?.props?.className === 'lifewoodMobile');
  assert.ok(compact, 'Small screens need a greeting outside the hidden garden section');
  const mascot = elements(compact, node => node.type === '@/app/components/cactea/Cactea');
  assert.equal(mascot.length, 1);
  assert.equal(mascot[0].props.state, 'lifewood');
  assert.equal(mascot[0].props.size, 'sm');
  assert.match(elements(compact, node => node.props?.role === 'status')[0].props.children, /Lifewood/);
  const normal = panel.default({ mode: 'idle', state: 'idle', actionsDisabled: true, children: null });
  assert.equal(elements(normal, node => node.props?.className === 'lifewoodMobile').length, 0);
});

const mascot = {};
vm.runInNewContext(await compile('../app/components/cactea/Cactea.tsx'), {
  exports: mascot,
  require: name => {
    if (name === 'react') return { memo: component => component };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('.css')) return styles;
    if (name === './useCacteaIdleAnimations') return { default: () => ({ mascotRef: { current: null }, jump() {} }) };
    if (name === './useCacteaSmile') return { default() {} };
    return { default: name, ClosedEye: 'closed-eye', OpenMouth: 'open-mouth', WorriedBrow: 'worried-brow', AngryBrow: 'angry-brow', FrownMouth: 'frown-mouth' };
  },
});

test('fresh leaves appear only during the greeting and the mascot has an accessible greeting label', () => {
  const greeting = mascot.default({ state: 'lifewood', interactive: true, chatExpressions: true });
  assert.match(greeting.props['aria-label'], /Lifewood/);
  assert.equal(elements(greeting, node => node.type === 'path' && ['sproutLeft', 'sproutRight'].includes(node.props.className)).length, 2);
  const normal = mascot.default({ state: 'thinking', interactive: true, chatExpressions: true });
  assert.equal(elements(normal, node => node.type === 'svg').length, 0);
});

test('off-topic questions show an angry face and a plant reminder on desktop and small screens', () => {
  const reaction = mascot.default({ state: 'angry', interactive: true, chatExpressions: true });
  assert.match(reaction.props['aria-label'], /angry/i);
  assert.equal(elements(reaction, node => node.props?.className === 'angryBrow').length, 2);
  assert.equal(elements(reaction, node => node.props?.className === 'frownMouth').length, 1);
  const tree = panel.default({ state: 'angry', mode: 'speaking', actionsDisabled: true, children: null });
  const statuses = elements(tree, node => node.props?.role === 'status');
  assert.equal(statuses.length, 2);
  assert.ok(statuses.every(node => /plant questions/.test(node.props.children)));
  const compact = tree.props.children.find(node => node?.props?.className === 'lifewoodMobile');
  assert.equal(elements(compact, node => node.type === '@/app/components/cactea/Cactea')[0].props.state, 'angry');
  assert.equal(elements(tree, node => node.type === 'button').length, 0);
});
