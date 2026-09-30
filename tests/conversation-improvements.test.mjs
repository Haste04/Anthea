import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function load(name) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { yellowLeafFollowUp, CARE_QUESTIONS, parseAssistantReply, briefSpeech } = await load('care-dialogue');
const { parseReminderCommand, validReminderDraft } = await load('reminder-intent');
const { configureSpeechVoice } = await load('speech-voice');

test('yellow leaves gather soil, watering, and light one question at a time', () => {
  const history = [{ role: 'user', text: 'My monstera leaves are yellow.' }];
  assert.equal(yellowLeafFollowUp(history[0].text, []), CARE_QUESTIONS.soil);
  history.push({ role: 'assistant', text: CARE_QUESTIONS.soil });
  assert.equal(yellowLeafFollowUp('Wet', history), CARE_QUESTIONS.watering);
  history.push({ role: 'user', text: 'Wet' }, { role: 'assistant', text: CARE_QUESTIONS.watering });
  assert.equal(yellowLeafFollowUp('Yesterday', history), CARE_QUESTIONS.light);
  history.push({ role: 'user', text: 'Yesterday' }, { role: 'assistant', text: CARE_QUESTIONS.light });
  assert.equal(yellowLeafFollowUp('Bright indirect light', history), null);
});
test('existing facts skip questions; uncertainty and topic changes do not trap the user', () => {
  assert.equal(yellowLeafFollowUp('The leaves are yellow, the soil is wet, and I watered yesterday.', []), CARE_QUESTIONS.light);
  const history = [{ role: 'user', text: 'Yellow leaves on my monstera' }, { role: 'assistant', text: CARE_QUESTIONS.soil }];
  assert.equal(yellowLeafFollowUp("I don't know", history), CARE_QUESTIONS.watering);
  assert.equal(yellowLeafFollowUp('How do I check the soil?', history), null);
  assert.equal(yellowLeafFollowUp('Now my cactus needs help.', history), null);
  assert.equal(yellowLeafFollowUp('How do I prune my rose?', []), null);
  assert.equal(yellowLeafFollowUp('My rose has aphids.', history), null);
  assert.equal(yellowLeafFollowUp("My rose's soil is wet.", history), null);
  assert.equal(yellowLeafFollowUp('My rose has yellow leaves.', history), CARE_QUESTIONS.soil);
  assert.equal(yellowLeafFollowUp('My leaves are yellow. The soil is dry. I last watered on Monday. It gets bright indirect light.', []), null);
  assert.equal(yellowLeafFollowUp('My leaves are yellow. The soil is dry. I watered on 2026-09-28. It gets bright indirect light.', []), null);
});
test('detailed text stays intact while spoken summaries contain a next step', () => {
  const reply = parseAssistantReply(JSON.stringify({ response_text: 'Several causes can affect leaves.\n\nCheck the soil before watering. Observe new growth over the next week.', spoken_text: 'Several causes can affect leaves. Check the soil before watering.' }));
  assert.match(reply.response_text, /Observe new growth/);
  assert.equal(reply.spoken_text, 'Several causes can affect leaves. Check the soil before watering.');
  assert.equal(briefSpeech('Several causes can affect leaves. Age can also affect older leaves. Check the soil before watering. Observe new growth.'), 'Several causes can affect leaves. Check the soil before watering.');
  assert.throws(() => parseAssistantReply('{"spoken_text":"Missing full answer"}'));
});
test('spoken reminders use local calendar dates and never guess a missing date', () => {
  const now = new Date(2026, 8, 30, 23, 55);
  assert.deepEqual(parseReminderCommand('Remind me to check the soil tomorrow.', now), { title: 'Check the soil', due: '2026-10-01', timeRequested: false });
  assert.equal(parseReminderCommand('Please remind me to inspect the leaves in two days', now).due, '2026-10-02');
  assert.equal(parseReminderCommand('Remind me to check my fern', now).due, '');
  assert.equal(parseReminderCommand('Remind me to water tomorrow at 9 AM', now).timeRequested, true);
  assert.equal(parseReminderCommand('What are reminders?', now), null);
  assert.equal(validReminderDraft({ title: 'Soil check', due: '2026-02-30' }), false);
  assert.equal(validReminderDraft({ title: '', due: '2026-10-01' }), false);
  assert.equal(validReminderDraft({ title: 'Soil check', due: '2026-10-01' }), true);
});
test('saved voice selection uses the current device voice and falls back safely', () => {
  const voices = [{ voiceURI: 'default', lang: 'en-US', default: true }, { voiceURI: 'chosen', lang: 'en-GB' }];
  const utterance = {};
  configureSpeechVoice(utterance, voices, 'chosen');
  assert.equal(utterance.voice, voices[1]);
  assert.equal(utterance.lang, 'en-GB');
  configureSpeechVoice(utterance, voices, 'unavailable');
  assert.equal(utterance.voice, voices[0]);
  assert.doesNotThrow(() => configureSpeechVoice({}, [], 'chosen'));
});
