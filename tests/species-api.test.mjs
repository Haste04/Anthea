import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(path) {
  let source = '';
  try { source = await readFile(new URL(path, import.meta.url), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const perenualSource = await compile('../lib/perenual.ts');
const routeSource = await compile('../app/api/species/route.ts');
function setup({ allowed = true, status = 200, data = [], key = 'test-key' } = {}) {
  const calls = [];
  const provider = {};
  vm.runInNewContext(perenualSource, { exports: provider, process: { env: { PERENUAL_API_KEY: key } }, AbortSignal,
    fetch: async (url, options) => { calls.push({ url, options }); return Response.json({ data }, { status }); },
  });
  const route = {};
  vm.runInNewContext(routeSource, { exports: route, Response, URL, console: { error() {} }, require: name => {
    if (name === '@/lib/perenual') return provider;
    if (name === '@/lib/api-guard') return {
      enforceApiLimit: async () => ({ allowed }),
      rateLimitResponse: () => Response.json({ error: 'Limited' }, { status: 429 }),
    };
    throw new Error(name);
  } });
  return { calls, get: async name => {
    assert.equal(typeof route.GET, 'function');
    return route.GET(new Request(`http://localhost/api/species?q=${encodeURIComponent(name)}`));
  } };
}

test('lookup returns deduplicated species and configures provider caching', async () => {
  const app = setup({ data: [
    { id: 1, common_name: 'Test plant', scientific_name: ['Example species'] },
    { id: 2, common_name: 'Duplicate', scientific_name: ['Example species'] },
    { id: 3, common_name: 'Unknown', scientific_name: [] },
    { id: 4, common_name: 'Another plant', scientific_name: 'Example other' },
  ] });
  const response = await app.get('test plant');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).matches, [
    { commonName: 'Test plant', scientificName: 'Example species' },
    { commonName: 'Another plant', scientificName: 'Example other' },
  ]);
  assert.equal(app.calls.length, 1);
  assert.equal(new URL(app.calls[0].url).searchParams.get('q'), 'test plant');
  assert.ok(app.calls[0].options.next.revalidate >= 3600);
});

test('invalid queries and rate-limited requests never reach Perenual', async () => {
  const app = setup();
  for (const name of ['', 'x', 'a'.repeat(121)]) assert.equal((await app.get(name)).status, 400);
  assert.equal(app.calls.length, 0);
  const limited = setup({ allowed: false });
  assert.equal((await limited.get('fern')).status, 429);
  assert.equal(limited.calls.length, 0);
});

test('provider outages and missing credentials give safe recoverable errors', async () => {
  for (const config of [{ status: 429 }, { key: '' }]) {
    const app = setup(config);
    const response = await app.get('fern');
    assert.equal(response.status, 503);
    assert.ok((await response.json()).error);
  }
});
