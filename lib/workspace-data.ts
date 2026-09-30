import type { ReminderProposal } from './reminder-intent';
export type Message = {
  id: string; role: 'user' | 'assistant'; text: string; createdAt?: number; photo?: string;
  plantId?: string | null;
  pending?: boolean; error?: boolean; retryText?: string;
  spokenText?: string;
  reminderProposal?: ReminderProposal;
  meta?: { next_check: string | null; species_candidate: string | null; watering_days: number | null; is_estimate: boolean; diagnosis_confidence: string } | null;
};
export type Chat = { id: string; title: string; messages: Message[]; updatedAt: number; plantId?: string };
export type Plant = { id: string; name: string; species: string; location: string; notes: string; photo?: string; updatedAt: number };
export type Reminder = { id: string; title: string; plantId?: string; due: string; repeat: number; completed: boolean };
export type WorkspaceData = { version: 1; chats: Chat[]; plants: Plant[]; reminders: Reminder[] };
export const emptyWorkspace: WorkspaceData = { version: 1, chats: [], plants: [], reminders: [] };
export const MAX_PHOTO_LENGTH = 2_800_000;
export function visibleChats(chats: Chat[], expanded: boolean, query: string): Chat[] {
  const matches = [...chats].sort((a,b) => b.updatedAt - a.updatedAt).filter(c => c.title.toLowerCase().includes(query.trim().toLowerCase()));
  return expanded || query.trim() ? matches : matches.slice(0,8);
}
export function applyDraftPhoto(draft: Plant | null, originatingId: string, photo: string): Plant | null {
  return draft?.id === originatingId ? { ...draft, photo } : draft;
}
export function validPhoto(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_PHOTO_LENGTH) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const bytes = atob(match[2].slice(0, 32));
    return match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  } catch { return false; }
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}
export function nextDueDate(due: string, repeat: number, today: string): string {
  if (!validDate(due) || !validDate(today) || !Number.isInteger(repeat) || repeat < 1 || repeat > 365) throw new Error('Invalid reminder date or interval.');
  const date = new Date(`${due}T12:00:00`);
  do { date.setDate(date.getDate() + repeat); } while (localDate(date) <= today);
  return localDate(date);
}
export function recoverMessages(messages: Message[]): Message[] {
  return messages.map((message, i) => message.pending ? { ...message, pending: false, error: true, text: 'This reply was interrupted. You can retry your question.', retryText: messages[i - 1]?.role === 'user' ? messages[i - 1].text : undefined } : message);
}
export function normalizeStoredWorkspace(data: WorkspaceData): WorkspaceData {
  const ids = new Set(data.plants.map(p => p.id));
  const normalized = parseBackup({
    ...data,
    chats: data.chats.map(c => ({ ...c, plantId: c.plantId && ids.has(c.plantId) ? c.plantId : undefined, messages: c.messages.map(message => ({ ...message, ...(message.plantId && !ids.has(message.plantId) ? { plantId: null } : {}), ...(message.reminderProposal?.plantId && !ids.has(message.reminderProposal.plantId) ? { reminderProposal: { ...message.reminderProposal, plantId: undefined } } : {}) })) })),
    reminders: data.reminders.map(r => ({ ...r, plantId: r.plantId && ids.has(r.plantId) ? r.plantId : undefined })),
  });
  return { ...normalized, chats: normalized.chats.filter(chat => chat.messages.length > 0) };
}
export function parseBackup(value: unknown): WorkspaceData {
  const fail = (): never => { throw new Error('This is not a valid Anthea backup. No data was changed.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as WorkspaceData;
  if (data.version !== 1 || !Array.isArray(data.chats) || !Array.isArray(data.plants) || !Array.isArray(data.reminders) || data.chats.length > 2000 || data.plants.length > 2000 || data.reminders.length > 10000) return fail();
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const identity = (rows: { id: string }[]) => { const ids = new Set<string>(); for (const row of rows) { if (!row || !str(row.id, 100) || !row.id || ids.has(row.id)) fail(); ids.add(row.id); } return ids; };
  const plants = identity(data.plants); identity(data.chats); identity(data.reminders);
  const link = (id: unknown) => id === undefined || (typeof id === 'string' && plants.has(id));
  const time = (t: unknown) => typeof t === 'number' && Number.isFinite(t) && t >= 0;
  for (const p of data.plants) if (!str(p.name, 120) || !p.name.trim() || !str(p.species, 120) || !str(p.location, 160) || !str(p.notes, 10000) || !time(p.updatedAt) || (p.photo !== undefined && !validPhoto(p.photo))) fail();
  for (const c of data.chats) {
    if (!str(c.title, 120) || !time(c.updatedAt) || !link(c.plantId) || !Array.isArray(c.messages) || c.messages.length > 10000) fail();
    identity(c.messages);
    for (const m of c.messages) {
      if (m.spokenText !== undefined && !str(m.spokenText, 4000)) fail();
      if (m.reminderProposal !== undefined) {
        const p = m.reminderProposal;
        if (!p || typeof p !== 'object' || !str(p.id, 100) || !p.id || !str(p.title, 160) || !['pending','saved','cancelled'].includes(p.status) || typeof p.timeRequested !== 'boolean' || !link(p.plantId) || !(validDate(p.due) || (p.due === '' && p.status !== 'saved'))) fail();
        if (p.status === 'saved' && !p.title.trim()) fail();
      }
      if (!['user','assistant'].includes(m.role) || !str(m.text, 30000) || (m.plantId !== undefined && m.plantId !== null && !link(m.plantId)) || (m.photo !== undefined && !validPhoto(m.photo)) || (m.createdAt !== undefined && !time(m.createdAt)) || (m.retryText !== undefined && !str(m.retryText, 4000)) || (m.pending !== undefined && typeof m.pending !== 'boolean') || (m.error !== undefined && typeof m.error !== 'boolean')) fail();
      if (m.meta != null) {
        const a = m.meta;
        if (typeof a !== 'object' || !(a.next_check === null || str(a.next_check, 30000)) || !(a.species_candidate === null || str(a.species_candidate, 1000)) || !(a.watering_days === null || (typeof a.watering_days === 'number' && Number.isFinite(a.watering_days))) || typeof a.is_estimate !== 'boolean' || !str(a.diagnosis_confidence, 100)) fail();
      }
    }
  }
  for (const r of data.reminders) if (!str(r.title, 160) || !r.title.trim() || !link(r.plantId) || !validDate(r.due) || !Number.isInteger(r.repeat) || r.repeat < 0 || r.repeat > 365 || typeof r.completed !== 'boolean') fail();
  return { version: 1, chats: data.chats.map(c => ({ ...c, messages: recoverMessages(c.messages) })), plants: data.plants, reminders: data.reminders };
}
