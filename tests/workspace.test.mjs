import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../lib/workspace-data.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseBackup, normalizeStoredWorkspace, nextDueDate, recoverMessages, validPhoto, visibleChats, applyDraftPhoto } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const empty = { version: 1, chats: [], plants: [], reminders: [] };

test('reply topic survives reload for manual speech while invalid topic flags are rejected', () => {
  const message = { id: 'a', role: 'assistant', text: 'Ask me about plants.', offTopic: true };
  const backup = { ...empty, chats: [{ id: 'c', title: 'Chat', updatedAt: 1, messages: [message] }] };
  assert.equal(normalizeStoredWorkspace(JSON.parse(JSON.stringify(backup))).chats[0].messages[0].offTopic, true);
  for (const offTopic of ['true', 1, null]) {
    assert.throws(() => parseBackup({ ...backup, chats: [{ ...backup.chats[0], messages: [{ ...message, offTopic }] }] }));
  }
});

test('voice summaries and unsaved reminder proposals survive backup restoration', () => {
  const message = { id: 'a', role: 'assistant', text: 'Review your reminder.', spokenText: 'Review your reminder.', reminderProposal: { id: 'r', title: 'Check soil', due: '', status: 'pending', timeRequested: false } };
  const backup = { ...empty, chats: [{ id: 'c', title: 'Voice reminder', updatedAt: 1, messages: [message] }] };
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup))).chats[0].messages[0], message);
  for (const proposal of [{ ...message.reminderProposal, status: 'saved' }, { ...message.reminderProposal, due: '2026-02-30' }, { ...message.reminderProposal, status: 'surprise' }]) {
    assert.throws(() => parseBackup({ ...empty, chats: [{ ...backup.chats[0], messages: [{ ...message, reminderProposal: proposal }] }] }));
  }
});
test('backup accepts empty data but rejects wrong versions, dangling links and duplicate IDs', () => {
  assert.deepEqual(parseBackup(empty), empty);
  assert.throws(() => parseBackup({ ...empty, version: 2 }));
  assert.throws(() => parseBackup({ ...empty, chats: [{ id:'a', title:'Chat', updatedAt:1, messages:[], plantId:'missing' }] }));
  const plant = { id:'p', name:'Fern', species:'', location:'', notes:'', updatedAt:1 };
  assert.throws(() => parseBackup({ ...empty, plants:[plant, plant] }));
  assert.throws(() => parseBackup({ ...empty, plants:[{...plant, photo:'https://tracking.example/x'}] }));
});
test('interrupted replies become retryable instead of endless thinking', () => {
  const result = recoverMessages([{id:'u',role:'user',text:'Help'}, {id:'a',role:'assistant',text:'',pending:true}]);
  assert.equal(result[1].pending, false); assert.equal(result[1].retryText, 'Help'); assert.equal(result[1].error, true);
});
test('recurring reminders advance past today without drifting on overdue tasks', () => {
  assert.equal(nextDueDate('2026-09-01', 7, '2026-09-29'), '2026-10-06');
  assert.equal(nextDueDate('2026-12-31', 1, '2026-12-31'), '2027-01-01');
  assert.throws(() => nextDueDate('2026-02-31', 7, '2026-03-01'));
  assert.throws(() => nextDueDate('2026-09-01', 0, '2026-09-29'));
});
test('photos reject SVG, external URLs, malformed base64 and MIME mismatch', () => {
  assert.equal(validPhoto('data:image/jpeg;base64,/9j/2Q=='), true);
  for (const value of ['https://example.com/x.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,/9j/2Q==','data:image/jpeg;base64,!!!!']) assert.equal(validPhoto(value), false);
});

test('stored orphan links recover without hiding the garden; imported orphan links remain invalid', () => {
  const data={...empty,chats:[{id:'c',title:'My chat',updatedAt:1,messages:[{id:'q',role:'user',text:'Check my plant'}],plantId:'deleted'}],reminders:[{id:'r',title:'Check leaves',due:'2026-09-29',repeat:0,completed:false,plantId:'deleted'}]};
  assert.throws(()=>parseBackup(data));
  const result=normalizeStoredWorkspace(data);
  assert.equal(result.chats.length,1); assert.equal(result.chats[0].plantId,undefined); assert.equal(result.reminders[0].plantId,undefined);
});

test('complete chat history exposes older conversations and search reaches beyond recent eight', () => {
  const chats=Array.from({length:12},(_,i)=>({id:String(i),title:`Plant ${i}`,messages:[],updatedAt:i}));
  assert.equal(visibleChats(chats,false,'').length,8);
  assert.equal(visibleChats(chats,true,'').length,12);
  assert.equal(visibleChats(chats,false,'Plant 0')[0].id,'0');
});

test('pinned conversations precede newer chats, remain searchable, and do not mutate saved order', () => {
  const chats = Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: `Plant ${i}`, messages: [], updatedAt: i, ...(i === 0 || i === 2 ? { pinned: true } : {}) }));
  assert.deepEqual(visibleChats(chats, false, '').map(chat => chat.id), ['2', '0', '9', '8', '7', '6', '5', '4']);
  assert.equal(visibleChats(chats, true, '').length, 10);
  assert.deepEqual(visibleChats(chats, false, 'Plant 0').map(chat => chat.id), ['0']);
  assert.deepEqual(chats.map(chat => chat.id), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
});

test('pin choices survive backup and reload while legacy chats and invalid flags are handled', () => {
  const chat = { id: 'c', title: 'Chat', updatedAt: 1, messages: [{ id: 'u', role: 'user', text: 'Help' }] };
  for (const pinned of [true, false, undefined]) {
    const backup = { ...empty, chats: [{ ...chat, ...(pinned === undefined ? {} : { pinned }) }] };
    assert.equal(normalizeStoredWorkspace(JSON.parse(JSON.stringify(backup))).chats[0].pinned, pinned);
  }
  for (const pinned of ['true', 1, null]) assert.throws(() => parseBackup({ ...empty, chats: [{ ...chat, pinned }] }));
});
test('photo preparation from a cancelled draft cannot change a newly opened plant', () => {
  const other={id:'b',name:'Fern'};
  assert.equal(applyDraftPhoto(other,'a','photo'),other);
  assert.equal(applyDraftPhoto(null,'a','photo'),null);
  assert.equal(applyDraftPhoto({id:'a',name:'Monstera'},'a','photo').photo,'photo');
});
