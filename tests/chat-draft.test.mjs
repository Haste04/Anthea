import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const compile = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const data = {};
vm.runInNewContext(await compile('../lib/workspace-data.ts'), { exports: data });
const source = await compile('../app/components/workspace/WorkspaceProvider.tsx');

test('new drafts and plant selection do not persist; the first sent question does', async () => {
  const writes = [];
  const exports = {};
  const react = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => null,
    useState: value => [value, () => {}], useRef: value => ({ current: value }),
    useEffect: () => {}, useCallback: callback => callback,
  };
  vm.runInNewContext(source, { exports, crypto: { randomUUID: () => 'draft-1' }, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx: (type, props) => props } : name === '@/lib/workspace-data' ? data : { writeRecords: async changes => writes.push(changes) } });
  const workspace = exports.WorkspaceProvider({ children: null }).value;
  const id = workspace.newChat('monstera');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 0, 'Opening a new conversation must not write an empty chat');
  const draft = { id, title: 'New conversation', messages: [], updatedAt: 1, plantId: 'fern' };
  workspace.save('chats', draft);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 0, 'Selecting a plant must keep the chat a draft');
  workspace.save('chats', { ...draft, messages: [{ id: 'question', role: 'user', text: 'Why are the leaves yellow?' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].record.id, id);
  assert.equal(writes[0][0].record.plantId, 'fern');
});

test('old empty chats are excluded from the restored workspace', () => {
  const chat = { id: 'empty', title: 'New conversation', messages: [], updatedAt: 1 };
  const sent = { ...chat, id: 'sent', messages: [{ id: 'q', role: 'user', text: 'Help my plant' }] };
  const result = data.normalizeStoredWorkspace({ version: 1, plants: [], reminders: [], chats: [chat, sent] });
  assert.equal(result.chats.length, 1);
  assert.equal(result.chats[0].id, 'sent');
});
