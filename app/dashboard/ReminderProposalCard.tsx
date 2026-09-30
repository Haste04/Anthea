'use client';
import Link from 'next/link';
import { useState } from 'react';
import { validReminderDraft, type ReminderProposal } from '@/lib/reminder-intent';
import type { Plant } from '@/lib/workspace-data';
import styles from './Dashboard.module.css';

type Props = {
  proposal: ReminderProposal;
  plants: Plant[];
  initialPlantId?: string;
  savedReminder?: { title: string; due: string };
  disabled: boolean;
  onConfirm: (draft: { title: string; due: string }, plantId?: string) => void;
  onCancel: () => void;
};

export default function ReminderProposalCard({ proposal, plants, initialPlantId, savedReminder, disabled, onConfirm, onCancel }: Props) {
  const [title, setTitle] = useState(proposal.title);
  const [due, setDue] = useState(proposal.due);
  const [plantId, setPlantId] = useState(initialPlantId || '');
  const [editing, setEditing] = useState(!validReminderDraft(proposal));
  const headingId = `reminder-${proposal.id}`;
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dueLabel = due === dateKey(today) ? 'Today' : due === dateKey(tomorrow) ? 'Tomorrow' : due ? new Date(`${due}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose a date';
  const plantLabel = plants.find(p => p.id === plantId)?.name || 'General plant care';
  if (savedReminder || proposal.status !== 'pending') return <div className={styles.reminderResult} role="status">{savedReminder || proposal.status === 'saved' ? <><strong>Reminder saved: {savedReminder?.title || proposal.title}</strong><span>Due {savedReminder?.due || proposal.due} · <Link href="/reminders">View reminders</Link></span></> : <span>Reminder cancelled. Nothing was saved.</span>}</div>;
  return <form className={styles.reminderProposal} aria-labelledby={headingId} onSubmit={event => { event.preventDefault(); if (!disabled && validReminderDraft({ title, due })) onConfirm({ title: title.trim(), due }, plants.some(p => p.id === plantId) ? plantId : undefined); }}>
    <span className={styles.careActionLabel}>Care action</span>
    <h3 id={headingId}>{title || 'New reminder'}</h3>
    <p className={styles.reminderMeta}><time dateTime={due || undefined}>{dueLabel}</time><span aria-hidden="true"> · </span>{plantLabel}</p>
    <p>One-time reminder in Anthea. No timed notification. Saved only after confirmation.</p>
    {proposal.timeRequested && <p className={styles.reminderWarning}>You requested a time. Anthea currently keeps reminder dates only. Confirm below if a date-only reminder works for you.</p>}
    <div className={styles.reviewActions}><button type="submit" className={styles.sendTranscript} disabled={disabled || !validReminderDraft({ title, due })}>{proposal.timeRequested ? 'Confirm date-only reminder' : 'Confirm reminder'}</button><button type="button" disabled={disabled} onClick={onCancel}>Cancel</button></div>
    <details className={styles.reminderEdit} open={editing} onToggle={event => setEditing(event.currentTarget.open)}><summary>Edit reminder</summary>
    <label>What to check<input required maxLength={160} value={title} disabled={disabled} onChange={event => setTitle(event.target.value)} /></label>
    <div className={styles.reminderFields}><label>Due date<input type="date" required value={due} disabled={disabled} onChange={event => setDue(event.target.value)} /></label><label>Plant<select value={plants.some(p => p.id === plantId) ? plantId : ''} disabled={disabled} onChange={event => setPlantId(event.target.value)}><option value="">General plant care</option>{plants.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div>
    {!due && <p>Choose the date you want. I could not resolve a supported date from your request.</p>}
    </details>
  </form>;
}
