import { emptyWorkspace, type WorkspaceData } from './workspace-data';
export type Collection = 'chats' | 'plants' | 'reminders';
let connection: Promise<IDBDatabase> | undefined;
function open() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('anthea-workspace', 1);
    request.onupgradeneeded = () => { for (const name of ['chats','plants','reminders']) request.result.createObjectStore(name, { keyPath: 'id' }); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => reject(new Error('Close other Anthea tabs and reload to open storage.'));
  });
  return connection;
}
export async function loadWorkspace(): Promise<WorkspaceData> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chats','plants','reminders'], 'readonly');
    const result = { ...emptyWorkspace };
    for (const name of ['chats','plants','reminders'] as const) { const req = tx.objectStore(name).getAll(); req.onsuccess = () => { Object.assign(result, { [name]: req.result }); }; }
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error);
  });
}
export async function writeRecords(changes: { collection: Collection; id?: string; record?: { id: string } }[]) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['chats','plants','reminders'], 'readwrite');
    for (const change of changes) {
      const store = tx.objectStore(change.collection);
      if (change.record) {
        const record = change.record as { id: string; plantId?: string };
        if (change.collection !== 'plants' && record.plantId) {
          const check = tx.objectStore('plants').get(record.plantId);
          check.onsuccess = () => store.put(check.result ? record : { ...record, plantId: undefined });
        } else store.put(record);
      } else if (change.id) store.delete(change.id);
    }
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
  });
}
export async function deletePlantWithLinks(id: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['chats','plants','reminders'], 'readwrite');
    tx.objectStore('plants').delete(id);
    for (const name of ['chats','reminders']) {
      const request = tx.objectStore(name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.value as { plantId?: string; messages?: { plantId?: string | null; reminderProposal?: { plantId?: string } }[] };
        if (name === 'chats') {
          const messages = value.messages?.map(message => {
            const unlinkMessage = message.plantId === id;
            const unlinkProposal = message.reminderProposal?.plantId === id;
            if (!unlinkMessage && !unlinkProposal) return message;
            return {
              ...message,
              ...(unlinkMessage ? { plantId: null } : {}),
              ...(unlinkProposal && message.reminderProposal ? { reminderProposal: { ...message.reminderProposal, plantId: undefined } } : {}),
            };
          });
          const unlinkProposal = Boolean(messages?.some((message, index) => message !== value.messages?.[index]));
          if (value.plantId === id || unlinkProposal) cursor.update({ ...cursor.value, ...(value.plantId === id ? { plantId: undefined } : {}), ...(unlinkProposal ? { messages } : {}) });
        } else if (cursor.value.plantId === id) cursor.update({ ...cursor.value, plantId: undefined });
        cursor.continue();
      };
    }
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
  });
}
export async function replaceWorkspace(data: WorkspaceData) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['chats','plants','reminders'], 'readwrite');
    for (const name of ['chats','plants','reminders'] as const) { const store = tx.objectStore(name); store.clear(); for (const record of data[name]) store.put(record); }
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
  });
}
