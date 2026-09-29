import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';

const source = await readFile(new URL('../lib/workspace-db.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function createDB() {
  const exports = {};
  vm.runInNewContext(outputText, { exports, indexedDB: new IDBFactory(), require: () => ({ emptyWorkspace:{version:1,chats:[],plants:[],reminders:[]} }) });
  return exports;
}
test('IndexedDB retains photos and independent concurrent record writes', async () => {
  const db = createDB();
  assert.equal((await db.loadWorkspace()).plants.length, 0);
  await Promise.all([
    db.writeRecords([{collection:'plants',record:{id:'p1',name:'Fern',photo:'photo data'}}]),
    db.writeRecords([{collection:'plants',record:{id:'p2',name:'Monstera'}}]),
    db.writeRecords([{collection:'chats',record:{id:'c1',plantId:'p1',messages:[]}}]),
  ]);
  const restored = await db.loadWorkspace();
  assert.equal(restored.plants.length, 2);
  assert.equal(restored.plants.find(p => p.id === 'p1').photo, 'photo data');
  assert.equal(restored.chats[0].plantId,'p1');
  await db.writeRecords([{collection:'plants',id:'p1'},{collection:'chats',record:{id:'c1',messages:[]}}]);
  const unlinked = await db.loadWorkspace();
  assert.equal(unlinked.plants.length,1); assert.equal(unlinked.chats[0].plantId,undefined);
});
test('backup restoration replaces all three collections together', async () => {
  const db = createDB();
  await db.writeRecords([{collection:'plants',record:{id:'old'}}]);
  await db.replaceWorkspace({version:1,plants:[{id:'new'}],chats:[],reminders:[{id:'r1'}]});
  const restored = await db.loadWorkspace();
  assert.equal(restored.plants.length,1); assert.equal(restored.plants[0].id,'new'); assert.equal(restored.reminders[0].id,'r1');
});

test('plant deletion unlinks records created by other tabs without erasing their content', async () => {
  const db = createDB();
  await db.writeRecords([{collection:'plants',record:{id:'p'}}]);
  await db.writeRecords([{collection:'chats',record:{id:'new-chat',plantId:'p',messages:[{text:'Keep this answer'}]}},{collection:'reminders',record:{id:'new-reminder',plantId:'p'}}]);
  await db.deletePlantWithLinks('p');
  const restored=await db.loadWorkspace();
  assert.equal(restored.plants.length,0); assert.equal(restored.chats[0].plantId,undefined); assert.equal(restored.reminders[0].plantId,undefined); assert.equal(restored.chats[0].messages[0].text,'Keep this answer');
  await db.writeRecords([{collection:'reminders',record:{id:'late-reminder',plantId:'p'}}]);
  assert.equal((await db.loadWorkspace()).reminders.find(r=>r.id==='late-reminder').plantId,undefined);
});
