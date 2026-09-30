import assert from 'node:assert/strict';

// Exercises the real answer service. Microphone capture and audible playback
// still need a browser rehearsal; this script does not simulate either one.
const base = process.env.ANTHEA_URL || 'http://127.0.0.1:3000';
const history = [];
for (const [question, expected] of [
  ['My monstera leaves are yellow.', /wet.*damp.*dry/i],
  ['The soil feels wet.', /when.*water/i],
  ['I watered it yesterday.', /light/i],
  ['It gets bright indirect light.', null],
]) {
  const response = await fetch(`${base}/api/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: question, history }),
    signal: AbortSignal.timeout(65000),
  });
  const reply = await response.json();
  assert.equal(response.status, 200, JSON.stringify(reply));
  assert.equal(typeof reply.spoken_text, 'string');
  assert.ok(reply.spoken_text.split(/\s+/).length <= 60);
  if (expected) { assert.match(reply.response_text, expected); assert.equal((reply.response_text.match(/\?/g) || []).length, 1); }
  else { assert.ok(reply.response_text.length > reply.spoken_text.length, 'Full care explanation should remain in chat'); }
  console.log(JSON.stringify({ question, spoken: reply.spoken_text, detailLength: reply.response_text.length }));
  history.push({ role: 'user', text: question }, { role: 'assistant', text: reply.response_text });
}
console.log('Live API triage and separate spoken/full replies passed.');
