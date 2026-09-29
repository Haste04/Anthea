import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const intent = {};
vm.runInNewContext(await compile('../lib/reminder-intent.ts'), { exports: intent });
const card = {};
vm.runInNewContext(await compile('../app/dashboard/ReminderProposalCard.tsx'), {
  exports: card,
  require: name => {
    if (name === 'react') return { useState: value => [value, () => {}] };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === '@/lib/reminder-intent') return intent;
    return { default: {} };
  },
});
function proposal(overrides = {}) {
  return { id: 'r1', status: 'pending', title: 'Check soil', due: '2026-10-01', timeRequested: false, ...overrides };
}
test('rendering a spoken reminder does not save; only confirmation calls the action', () => {
  let saves = 0;
  const tree = card.default({ proposal: proposal(), plants: [], disabled: false, onConfirm: draft => { saves++; assert.equal(draft.due, '2026-10-01'); }, onCancel: () => {} });
  assert.equal(saves, 0);
  assert.equal(tree.type, 'form');
  tree.props.onSubmit({ preventDefault() {} });
  assert.equal(saves, 1);
});
test('missing dates and a busy conversation cannot confirm a reminder', () => {
  let saves = 0;
  for (const props of [{ proposal: proposal({ due: '' }), disabled: false }, { proposal: proposal(), disabled: true }]) {
    const tree = card.default({ ...props, plants: [], onConfirm: () => saves++, onCancel: () => {} });
    tree.props.onSubmit({ preventDefault() {} });
  }
  assert.equal(saves, 0);
});
test('saved and cancelled proposals expose no confirmation form after reload', () => {
  for (const status of ['saved', 'cancelled']) {
    const tree = card.default({ proposal: proposal({ status }), plants: [], disabled: false, onConfirm: () => assert.fail('Must not save again'), onCancel: () => {} });
    assert.notEqual(tree.type, 'form');
    assert.equal(tree.props.onSubmit, undefined);
  }
});
test('an already persisted reminder prevents an interrupted chat update from showing another confirmation', () => {
  const tree = card.default({ proposal: proposal(), savedReminder: { title: 'Edited soil check', due: '2026-10-03' }, plants: [], disabled: false, onConfirm: () => assert.fail('Must not save twice'), onCancel: () => {} });
  assert.notEqual(tree.type, 'form');
  assert.equal(tree.props.onSubmit, undefined);
});
