export type ReminderDraft = { title: string; due: string; timeRequested: boolean };
export type ReminderProposal = ReminderDraft & { id: string; status: 'pending' | 'saved' | 'cancelled' };

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validReminderDraft(draft: { title: string; due: string }): boolean {
  const date = new Date(`${draft.due}T12:00:00`);
  return Boolean(draft.title.trim()) && draft.title.length <= 160 && /^\d{4}-\d{2}-\d{2}$/.test(draft.due) && !Number.isNaN(date.getTime()) && dateString(date) === draft.due;
}

export function parseReminderCommand(text: string, now = new Date()): ReminderDraft | null {
  const command = text.trim().replace(/[.!?]+$/, '').match(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:remind me(?:\s+to)?|set(?: me)? a reminder(?:\s+to)?)\s+(.+)$/i);
  if (!command) return null;
  let title = command[1];
  let due = '';
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const relative = title.match(/\b(today|tomorrow|in\s+(\d+|one|two|three|four|five|six|seven|a)\s+(days?|weeks?))\b/i);
  const explicit = title.match(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/);
  if (relative) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const days = relative[1].toLowerCase() === 'today' ? 0 : relative[1].toLowerCase() === 'tomorrow' ? 1 : (words[relative[2].toLowerCase()] ?? Number(relative[2])) * (/week/i.test(relative[3]) ? 7 : 1);
    if (days <= 365) { date.setDate(date.getDate() + days); due = dateString(date); title = title.replace(relative[0], ''); }
  } else if (explicit) {
    const candidate = { title: 'Reminder', due: explicit[1] };
    if (validReminderDraft(candidate)) { due = explicit[1]; title = title.replace(explicit[0], ''); }
  }
  const time = /\bat\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|noon|midnight)\b.*$/i;
  const timeRequested = time.test(title);
  // Timed alerts and recurring schedules require manual review rather than
  // silently guessing details that the current date-only reminders cannot keep.
  if (timeRequested) title = title.replace(time, '');
  if (/\bevery\s+(?:\d+|day|week|month|morning|night)\b|\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/i.test(title)) due = '';
  title = title.replace(/\s+/g, ' ').trim();
  title = title ? title[0].toUpperCase() + title.slice(1) : '';
  return { title: title.slice(0, 160), due, timeRequested };
}
