import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/workspace-data.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { normalizeStoredWorkspace, parseBackup } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('restoring legacy reminder proposals never creates reminders automatically', () => {
  for (const status of ['pending', 'saved', 'cancelled']) {
    const message = {
      id: 'a', role: 'assistant', text: 'Older reminder draft',
      reminderProposal: { id: 'r1', title: 'Check soil', due: '2026-10-01', timeRequested: false, status },
    };
    const backup = {
      version: 1, plants: [], reminders: [],
      chats: [{ id: 'c', title: 'Plant care', updatedAt: 1, messages: [message] }],
    };
    for (const restored of [normalizeStoredWorkspace(backup), parseBackup(backup)]) {
      assert.deepEqual(restored.reminders, []);
      assert.deepEqual(restored.chats[0].messages[0], message);
    }
  }
});

test('an older saved reminder and its proposal remain separate records after restore', () => {
  const reminder = { id: 'r1', title: 'Edited soil check', due: '2026-10-03', repeat: 0, completed: false };
  const backup = {
    version: 1, plants: [], reminders: [reminder],
    chats: [{ id: 'c', title: 'Plant care', updatedAt: 1, messages: [{
      id: 'a', role: 'assistant', text: 'Older reminder draft',
      reminderProposal: { id: 'r1', title: 'Check soil', due: '2026-10-01', timeRequested: false, status: 'pending' },
    }] }],
  };
  for (const restored of [normalizeStoredWorkspace(backup), parseBackup(backup)]) {
    assert.equal(restored.reminders.length, 1);
    assert.equal(restored.reminders[0].id, 'r1');
    assert.equal(restored.reminders[0].title, 'Edited soil check');
    assert.equal(restored.reminders[0].due, '2026-10-03');
    assert.equal(restored.reminders[0].completed, false);
    assert.equal(restored.chats[0].messages[0].reminderProposal.status, 'pending');
  }
});
