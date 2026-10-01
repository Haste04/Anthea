import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function load(path) {
  let source = '';
  try { source = await readFile(new URL(path, import.meta.url), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const catalog = await load('../lib/plant-species.ts');

test('common names and scientific names resolve locally without substring guesses', () => {
  assert.equal(typeof catalog.localSpeciesMatches, 'function');
  assert.equal(catalog.localSpeciesMatches('  SPIDER   PLANT ')[0].scientificName, 'Chlorophytum comosum');
  assert.equal(catalog.localSpeciesMatches('Sansevieria trifasciata')[0].scientificName, 'Dracaena trifasciata');
  assert.equal(catalog.localSpeciesMatches('Monstera deliciosa')[0].scientificName, 'Monstera deliciosa');
  for (const name of ['', 'My plant', 'mon', 'My living room monstera']) assert.equal(catalog.localSpeciesMatches(name).length, 0);
});

test('a broad plant name offers species choices instead of guessing', () => {
  assert.equal(typeof catalog.localSpeciesMatches, 'function');
  const names = catalog.localSpeciesMatches('Monstera').map(item => item.scientificName).sort();
  assert.deepEqual(names, ['Monstera adansonii', 'Monstera deliciosa']);
});

test('additional flowers, herbs, vegetables and houseplants resolve offline', () => {
  const cases = [
    ['Common Sunflower', 'Helianthus annuus'],
    ['Sunflower', 'Helianthus annuus'],
    ['Aloe vera', 'Aloe vera'],
    ['Peace lily', 'Spathiphyllum wallisii'],
    ['Cilantro', 'Coriandrum sativum'],
    ['Tomato', 'Solanum lycopersicum'],
    ['Rosemary', 'Salvia rosmarinus'],
    ['Rosmarinus officinalis', 'Salvia rosmarinus'],
    ['String of pearls', 'Curio rowleyanus'],
    ['Senecio rowleyanus', 'Curio rowleyanus'],
    ['Parlour palm', 'Chamaedorea elegans'],
  ];
  for (const [name, scientificName] of cases) {
    assert.deepEqual(catalog.localSpeciesMatches(name).map(item => item.scientificName), [scientificName], name);
  }
});

test('shared aliases for mint and pothos offer choices instead of a wrong automatic assignment', () => {
  assert.deepEqual(catalog.localSpeciesMatches('Mint').map(item => item.scientificName).sort(), ['Mentha spicata', 'Mentha x piperita']);
  assert.deepEqual(catalog.localSpeciesMatches('Pothos').map(item => item.scientificName).sort(), ['Epipremnum aureum', 'Scindapsus pictus']);
  assert.equal(catalog.localSpeciesMatches('Unknown garden plant').length, 0);
});
