'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { emptyWorkspace, parseBackup, normalizeStoredWorkspace, recoverMessages, type Chat, type Plant, type Reminder, type WorkspaceData } from '@/lib/workspace-data';
import { deletePlantWithLinks, loadWorkspace, replaceWorkspace, writeRecords, type Collection } from '@/lib/workspace-db';

type RecordType = Chat | Plant | Reminder;
type Workspace = {
  data: WorkspaceData; ready: boolean; storageError: string; activeChatId: string | null;
  setActiveChatId: (id: string) => void; newChat: (plantId?: string) => string;
  save: (collection: Collection, record: RecordType) => void;
  remove: (collection: Collection, id: string) => void;
  importData: (value: unknown) => Promise<void>;
  interruptChat: (id: string) => void;
};
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const current = useRef(data);
  const queue = useRef(Promise.resolve());
  const update = useCallback((next: WorkspaceData) => { current.current = next; setData(next); }, []);
  useEffect(() => {
    let cancelled = false;
    loadWorkspace().then(value => { if (!cancelled) update(normalizeStoredWorkspace(value)); }).catch(() => {
      if (!cancelled) setStorageError('Browser storage could not be opened. Changes are kept for this visit only. Export a backup before leaving.');
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [update]);
  const persist = useCallback((changes: Parameters<typeof writeRecords>[0]) => {
    queue.current = queue.current.then(() => writeRecords(changes)).catch(() => setStorageError('Your latest changes could not be saved in this browser. Export a backup before leaving.'));
  }, []);
  const save = useCallback((collection: Collection, record: RecordType) => {
    const rows = current.current[collection] as RecordType[];
    update({ ...current.current, [collection]: rows.some(row => row.id === record.id) ? rows.map(row => row.id === record.id ? record : row) : [...rows, record] });
    persist([{ collection, record }]);
  }, [persist, update]);
  const remove = useCallback((collection: Collection, id: string) => {
    const next = { ...current.current, [collection]: current.current[collection].filter(row => row.id !== id) };
    const changes: Parameters<typeof writeRecords>[0] = [{ collection, id }];
    if (collection === 'plants') {
      next.chats = next.chats.map(chat => { if (chat.plantId !== id) return chat; const record = { ...chat, plantId: undefined }; changes.push({ collection: 'chats', record }); return record; });
      next.reminders = next.reminders.map(reminder => { if (reminder.plantId !== id) return reminder; const record = { ...reminder, plantId: undefined }; changes.push({ collection: 'reminders', record }); return record; });
    }
    update(next);
    if (collection === 'plants') queue.current = queue.current.then(() => deletePlantWithLinks(id)).catch(() => setStorageError('The plant deletion could not be saved. Export a backup before leaving.'));
    else persist(changes);
    if (collection === 'chats') setActiveChatId(previous => previous === id ? null : previous);
  }, [persist, update]);
  const newChat = useCallback((plantId?: string) => {
    const id = crypto.randomUUID();
    save('chats', { id, title: 'New conversation', messages: [], updatedAt: Date.now(), ...(plantId ? { plantId } : {}) });
    setActiveChatId(id); return id;
  }, [save]);
  const interruptChat = useCallback((id: string) => {
    const chat = current.current.chats.find(c => c.id === id);
    if (chat?.messages.some(m => m.pending)) save('chats', { ...chat, messages: recoverMessages(chat.messages) });
  }, [save]);
  const importData = useCallback(async (value: unknown) => {
    const parsed = parseBackup(value);
    await queue.current;
    await replaceWorkspace(parsed);
    update(parsed); setActiveChatId(null); setStorageError('');
  }, [update]);
  return <Context.Provider value={{ data, ready, storageError, activeChatId, setActiveChatId, newChat, save, remove, importData, interruptChat }}>{children}</Context.Provider>;
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('WorkspaceProvider is missing'); return value; }
