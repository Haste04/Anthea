import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(file, dependencies = {}) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8').catch(() => '');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => dependencies[name],
  });
  return exports;
}
const species = await load('../lib/plant-species.ts');
const api = await load('../lib/voice-vocabulary.ts', { '@/lib/plant-species': species });

test('vocabulary prioritizes linked and saved names, includes species and Aster, and stays bounded', () => {
  const terms = api.buildPlantVocabulary([
    { id: '1', name: 'Sunny', species: 'Helianthus annuus' },
    { id: '2', name: 'Aster', species: 'Symphyotrichum novae-angliae' },
  ], '2');
  assert.equal(terms[0], 'Aster');
  assert.ok(terms.includes('Sunny'));
  assert.ok(terms.includes('Symphyotrichum novae-angliae'));
  assert.ok(terms.includes('Monstera deliciosa'));
  assert.ok(terms.includes('pothos'));
  assert.ok(terms.length <= 100);
  assert.equal(new Set(terms.map(term => term.toLowerCase())).size, terms.length);
  assert.ok(api.buildPlantVocabulary([]).includes('Aster'));
});

test('untrusted vocabulary drops invalid entries and deduplicates without truncating names', () => {
  const terms = api.normalizeVoiceVocabulary([' Aster ', 'aster', '', null, 42, 'x'.repeat(121), 'bad\u0000name', ...Array.from({ length: 150 }, (_, i) => `Plant ${i}`)]);
  assert.equal(terms[0], 'Aster');
  assert.equal(terms.length, 100);
  assert.ok(!terms.includes('x'.repeat(120)));
  assert.deepEqual(Array.from(api.normalizeVoiceVocabulary({ name: 'Aster' })), []);
});

test('asper suggests Aster in a name position without changing the transcript', () => {
  for (const text of ['asper', 'How often should I water my asper?', 'My asper has yellow leaves.']) {
    const review = api.findPlantNameReview(text, ['Aster', 'Monstera']);
    assert.equal(review.heard, 'asper');
    assert.deepEqual(Array.from(review.suggestions), ['Aster']);
    assert.equal(text.slice(review.start, review.end), 'asper');
    assert.equal(api.applyPlantNameSuggestion(review, 'Aster'), text.replace('asper', 'Aster'));
    assert.equal(api.applyPlantNameSuggestion(review, 'Aspen'), null);
  }
});

test('ambiguous candidates require a choice and unknown explicit names require editing', () => {
  const review = api.findPlantNameReview('My asper is dry', ['Aster', 'Aspen']);
  assert.deepEqual(Array.from(review.suggestions), ['Aspen', 'Aster']);
  const unknown = api.findPlantNameReview('My plant named zorblax has yellow leaves', ['Aster']);
  assert.equal(unknown.heard, 'zorblax');
  assert.equal(unknown.suggestions.length, 0);
});

test('exact names, generic plant parts, ordinary words and short nicknames are not fuzzy corrected', () => {
  for (const text of ['Aster', 'My Aster is dry', 'Water my plant', 'My soil is dry', 'My leaves are yellow', 'Water the fern', 'After watering, check the soil', 'My pot is too wet', 'How much water does it need?', 'My Amy is dry']) {
    assert.equal(api.findPlantNameReview(text, ['Aster', 'fern', 'Ami']), null, text);
  }
  assert.equal(api.findPlantNameReview('My Swiss cheese plant has yellow leaves', ['Swiss cheese plant']), null);
  const review = api.findPlantNameReview('My monstara has yellow leaves', ['Monstera']);
  assert.deepEqual(Array.from(review.suggestions), ['Monstera']);
});

test('known names with possessives, modifiers, and multiple subjects do not become unknown names', () => {
  for (const text of ['Water my Aster daily', 'My Aster’s leaves are yellow', 'My Aster and my Monstera are dry', 'The weather is humid', 'Where is the best place for my Aster?']) {
    assert.equal(api.findPlantNameReview(text, ['Aster', 'Monstera']), null, text);
  }
  assert.equal(api.findPlantNameReview('My Aster and my asper are dry', ['Aster']).heard, 'asper');
});

test('known names outside the hint budget and nonplant subjects do not trigger review', () => {
  const hints = api.buildPlantVocabulary([]);
  for (const text of ['My thyme is dry', 'My basil is dying', 'My fertilizer is too strong', 'My humidity is low', 'My calendar has changed']) {
    assert.equal(api.findPlantNameReview(text, hints), null, text);
  }
});

test('name checks cover care continuations and questions without possessives', () => {
  for (const text of ['Why is my asper wilting?', 'My asper keeps wilting', 'My asper turned yellow', 'My asper leaves are yellow', 'Is asper safe for cats?', 'Should I water asper today?', 'How much sunlight does asper need?']) {
    assert.equal(api.findPlantNameReview(text, ['Aster']).heard, 'asper', text);
  }
  assert.equal(api.findPlantNameReview('Can I water after?', ['Aster']), null);
});

test('plural names and descriptions of plants or plant parts are not mistaken for names', () => {
  const hints = api.buildPlantVocabulary([]);
  for (const text of ['My orchids have yellow leaves', 'My ferns are dry', 'My succulents need water', 'The roses need water', 'My yellow leaves are curling', 'My brown leaves have spots', 'My little cactus is wilting', 'My favorite Monstera has yellow leaves', 'My small plant is wilting', 'My yellow plant has spots']) {
    assert.equal(api.findPlantNameReview(text, hints), null, text);
  }
});

test('saved names outside the provider hint budget can still be checked locally', () => {
  const plants = Array.from({ length: 120 }, (_, i) => ({ id: String(i), name: `Saved plant ${i}`, species: '' }));
  plants.push({ id: 'last', name: 'Aphelia', species: '' });
  const localNames = api.buildPlantVocabulary(plants, undefined, 5000);
  assert.ok(localNames.includes('Aphelia'));
  assert.equal(api.normalizeVoiceVocabulary(localNames).length, 100);
  assert.equal(api.findPlantNameReview('My Aphelia is dry', localNames), null);
  assert.deepEqual(Array.from(api.findPlantNameReview('My Aphelio is dry', localNames).suggestions), ['Aphelia']);
});
