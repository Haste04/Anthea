import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../app/components/workspace/WorkspacePages.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function buttonText(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(buttonText).join('');
  if (!node || node.props?.['aria-hidden'] === 'true') return '';
  return buttonText(node.props?.children);
}

function garden(count) {
  const data = { plants: Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`, name: `Plant ${i + 1}`, species: '', location: '', notes: '', updatedAt: 1,
  })), chats: [], reminders: [] };
  const slots = [];
  let cursor = 0;
  const react = {
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial ?? { showModal() {}, close() {} } }; },
  };
  const page = {};
  vm.runInNewContext(source, {
    exports: page, window: { location: { hash: '' }, confirm: () => true }, crypto: { randomUUID: () => 'new-plant' },
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      if (name === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      if (name === './WorkspaceProvider') return { useWorkspace: () => ({ data,
        save: (collection, record) => { const rows = data[collection]; data[collection] = rows.some(row => row.id === record.id) ? rows.map(row => row.id === record.id ? record : row) : [...rows, record]; },
        remove: (collection, id) => { data[collection] = data[collection].filter(row => row.id !== id); },
      }) };
      return { default: name };
    },
  });
  const render = () => { cursor = 0; return page.PlantsPage(); };
  const buttons = () => nodes(render(), node => node.type === 'button');
  const button = label => buttons().find(node => buttonText(node).includes(label));
  const cards = () => buttons().filter(node => node.props.className?.includes('ws-plant-card'));
  return {
    data, render, button, cards,
    ids: () => cards().map(node => node.key),
    search: value => nodes(render(), node => node.props?.['aria-label'] === 'Search your plants')[0].props.onChange({ target: { value } }),
    add: name => {
      button('Add a plant').props.onClick();
      nodes(render(), node => node.type === './PlantSpeciesFields')[0].props.onChange({ name });
      nodes(render(), node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    },
  };
}

test('the thirteenth plant starts the next page and navigation stays within bounds', () => {
  const app = garden(13);
  assert.deepEqual(app.ids(), Array.from({ length: 12 }, (_, i) => `p${i + 1}`));
  assert.equal(app.button('Previous').props.disabled, true);
  app.button('Next').props.onClick();
  assert.deepEqual(app.ids(), ['p13']);
  assert.equal(app.button('Next').props.disabled, true);
  app.button('Previous').props.onClick();
  assert.equal(app.cards().length, 12);
});

test('up to twelve plants need no pagination controls', () => {
  for (const count of [0, 1, 12]) {
    const app = garden(count);
    assert.equal(app.cards().length, count);
    assert.equal(app.button('Next'), undefined);
  }
});

test('search covers every page and returns to the first page of results', () => {
  const app = garden(25);
  app.button('Next').props.onClick();
  app.button('Next').props.onClick();
  assert.deepEqual(app.ids(), ['p25']);
  app.search('Plant 2');
  assert.deepEqual(app.ids(), ['p2', 'p20', 'p21', 'p22', 'p23', 'p24', 'p25']);
  app.search('missing');
  assert.equal(app.cards().length, 0);
  app.search('');
  assert.deepEqual(app.ids(), Array.from({ length: 12 }, (_, i) => `p${i + 1}`));
});

test('saving a thirteenth plant opens its page even from a filtered garden', () => {
  const app = garden(12);
  app.search('Plant 1');
  app.add('New fern');
  assert.equal(app.data.plants.length, 13);
  assert.deepEqual(app.ids(), ['new-plant']);
});

test('deleting the only plant on the last page returns to a populated page', () => {
  const app = garden(13);
  app.button('Next').props.onClick();
  app.cards()[0].props.onClick();
  app.button('Delete').props.onClick();
  assert.equal(app.data.plants.length, 12);
  assert.equal(app.cards().length, 12);
  assert.equal(app.button('Next'), undefined);
});
