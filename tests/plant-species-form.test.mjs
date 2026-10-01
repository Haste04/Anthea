import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(path) {
  let source = '';
  try { source = await readFile(new URL(path, import.meta.url), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const catalog = {};
vm.runInNewContext(await compile('../lib/plant-species.ts'), { exports: catalog });
const source = await compile('../app/components/workspace/PlantSpeciesFields.tsx');

function form({ species = '', fetcher = async () => Response.json({ matches: [] }) } = {}) {
  let draft = { id: 'p', name: '', species };
  let cursor = 0;
  const slots = [];
  const cleanups = [];
  const react = {
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect: callback => { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(callback()); } },
  };
  const component = {};
  vm.runInNewContext(source, { exports: component, AbortController, AbortSignal, fetch: fetcher, require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
    if (name === '@/lib/plant-species') return catalog;
    throw new Error(name);
  } });
  function render() {
    assert.equal(typeof component.default, 'function');
    cursor = 0;
    return component.default({ plant: draft, onChange: changes => { draft = { ...draft, ...changes }; } });
  }
  function nodes(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
  }
  function input(name) { return nodes(render(), node => node.type === 'input' && node.props.name === name)[0]; }
  function button(label) { return nodes(render(), node => node.type === 'button' && node.props.children === label)[0]; }
  return {
    draft: () => draft, render,
    name: value => input('plant-name').props.onChange({ target: { value } }),
    species: value => input('plant-species').props.onChange({ target: { value } }),
    lookup: () => button('Look up species').props.onClick(),
    choose: name => button(name).props.onClick(),
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

test('typing a known name fills species locally; changing it clears an obsolete automatic value', () => {
  const app = form({ fetcher: () => assert.fail('Local names must not make network requests') });
  app.name('Spider plant');
  assert.equal(app.draft().species, 'Chlorophytum comosum');
  app.name('Snake plant');
  assert.equal(app.draft().species, 'Dracaena trifasciata');
  app.name('My cactus');
  assert.equal(app.draft().species, '');
});

test('manual and previously saved species survive name edits', () => {
  const saved = form({ species: 'User species' });
  saved.name('Spider plant');
  assert.equal(saved.draft().species, 'User species');
  const app = form();
  app.name('Spider plant');
  app.species('My corrected species');
  app.name('Snake plant');
  assert.equal(app.draft().species, 'My corrected species');
});

test('ambiguous local names require a choice and never call Perenual', () => {
  const app = form({ fetcher: () => assert.fail('Ambiguous local names need local choices') });
  app.name('Monstera');
  assert.equal(app.draft().species, '');
  app.choose('Monstera adansonii');
  assert.equal(app.draft().species, 'Monstera adansonii');
});

test('fallback is explicit and repeated queries reuse the in-session cache', async () => {
  let calls = 0;
  const app = form({ fetcher: async () => { calls++; return Response.json({ matches: [{ commonName: 'Example', scientificName: 'Example species' }] }); } });
  app.name('Example');
  assert.equal(calls, 0);
  await app.lookup();
  assert.equal(app.draft().species, 'Example species');
  app.name('Another');
  app.name('Example');
  await app.lookup();
  assert.equal(app.draft().species, 'Example species');
  assert.equal(calls, 1);
});

test('late fallback results cannot overwrite changed names, manual input, or closed forms', async () => {
  for (const change of [app => app.name('Spider plant'), app => app.species('Manual species'), app => app.unmount()]) {
    let resolve;
    const app = form({ fetcher: () => new Promise(done => { resolve = done; }) });
    app.name('Unknown');
    const pending = app.lookup();
    change(app);
    const before = app.draft().species;
    resolve(Response.json({ matches: [{ commonName: 'Wrong', scientificName: 'Wrong species' }] }));
    await pending;
    assert.equal(app.draft().species, before);
  }
});

test('failed fallback leaves a manually editable and saveable species field', async () => {
  const app = form({ fetcher: async () => Response.json({ error: 'Unavailable' }, { status: 503 }) });
  app.name('Unknown');
  await app.lookup();
  assert.equal(app.draft().species, '');
  app.species('Manual species');
  assert.equal(app.draft().species, 'Manual species');
});
