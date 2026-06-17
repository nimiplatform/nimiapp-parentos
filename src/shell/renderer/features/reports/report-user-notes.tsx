import { useRef, useState } from 'react';
import { Button, TextareaField } from '@nimiplatform/kit/ui';
import { Pencil, Plus } from 'lucide-react';
import { isoNow, ulid } from '../../bridge/ulid.js';
import type { NarrativeReportContent, UserNote } from './structured-report.js';
import { i18nText } from '../../i18n/index.js';


export function getNotesForAnchor(content: NarrativeReportContent, anchor: string): UserNote[] {
  if (!content.userNotes) return [];
  return content.userNotes.filter((n) => n.anchor === anchor);
}

export function addUserNote(content: NarrativeReportContent, anchor: string, text: string): NarrativeReportContent {
  const now = isoNow();
  const next: UserNote = { id: ulid(), anchor, text, createdAt: now, updatedAt: now };
  return { ...content, userNotes: [...(content.userNotes ?? []), next] };
}

export function updateUserNote(content: NarrativeReportContent, id: string, text: string): NarrativeReportContent {
  const now = isoNow();
  return {
    ...content,
    userNotes: (content.userNotes ?? []).map((n) => n.id === id ? { ...n, text, updatedAt: now } : n),
  };
}

export function deleteUserNote(content: NarrativeReportContent, id: string): NarrativeReportContent {
  return {
    ...content,
    userNotes: (content.userNotes ?? []).filter((n) => n.id !== id),
  };
}

/* ── UI ─────────────────────────────────────────────────────── */

interface NoteCardProps {
  note: UserNote;
  canEdit: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}

function NoteCard({ note, canEdit, onSave, onDelete }: NoteCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const start = () => { setDraft(note.text); setEditing(true); setTimeout(() => ref.current?.focus(), 0); };
  const date = note.updatedAt ? note.updatedAt.slice(0, 10) : '';

  if (editing) {
    return (
      <div className="report-note-card">
        <TextareaField
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="report-radius-sm"
          textareaClassName="report-note-textarea"
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" tone="primary" onClick={() => { const t = draft.trim(); if (!t) return; onSave(t); setEditing(false); }}>
            {i18nText('Reports.notes.save')}
          </Button>
          <Button size="sm" tone="ghost" onClick={() => setEditing(false)}>
            {i18nText('Reports.notes.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="report-note-card report-note-card--view">
      <div className="report-note-header">
        <Pencil size={11} className="report-icon-warning" strokeWidth={2} />
        <span className="report-note-kicker">
          {i18nText('Reports.notes.kicker')}
        </span>
        {date ? (
          <span className="report-note-date">{date}</span>
        ) : null}
      </div>
      <p className="report-note-body">
        {note.text}
      </p>
      {canEdit ? (
        <div className="report-note-actions hide-on-print">
          <Button size="sm" tone="ghost" onClick={start} className="report-note-action-button report-note-action-button--warning">
            {i18nText('Reports.notes.edit')}
          </Button>
          <Button size="sm" tone="danger" onClick={onDelete} className="report-note-action-button">
            {i18nText('Reports.notes.delete')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface NoteComposerProps {
  onAdd: (text: string) => void;
}

function NoteComposer({ onAdd }: NoteComposerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const openComposer = () => {
    setDraft(''); setOpen(true);
    setTimeout(() => ref.current?.focus(), 0);
  };
  const submit = () => {
    const t = draft.trim();
    if (!t) { setOpen(false); return; }
    onAdd(t);
    setDraft(''); setOpen(false);
  };

  if (!open) {
    return (
      <Button
        onClick={openComposer}
        tone="ghost"
        size="sm"
        className="report-note-composer hide-on-print"
      >
        <Plus size={11} />
        {i18nText('Reports.notes.add')}
      </Button>
    );
  }

  return (
    <div className="report-note-card report-note-composer hide-on-print">
      <TextareaField
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={i18nText('Reports.notes.placeholder')}
        className="report-radius-sm"
        textareaClassName="report-note-textarea"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" tone="primary" onClick={submit}>
          {i18nText('Reports.notes.saveNote')}
        </Button>
        <Button size="sm" tone="ghost" onClick={() => setOpen(false)}>
          {i18nText('Reports.notes.cancel')}
        </Button>
      </div>
    </div>
  );
}

interface NoteAnchorProps {
  anchor: string;
  content: NarrativeReportContent;
  canEdit: boolean;
  onChange: (next: NarrativeReportContent) => void;
}

export function NoteAnchor({ anchor, content, canEdit, onChange }: NoteAnchorProps) {
  const notes = getNotesForAnchor(content, anchor);
  const handleAdd = (text: string) => onChange(addUserNote(content, anchor, text));
  const handleUpdate = (id: string, text: string) => onChange(updateUserNote(content, id, text));
  const handleDelete = (id: string) => onChange(deleteUserNote(content, id));

  return (
    <div className="report-note-anchor">
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} canEdit={canEdit}
          onSave={(t) => handleUpdate(n.id, t)}
          onDelete={() => handleDelete(n.id)} />
      ))}
      {canEdit ? <NoteComposer onAdd={handleAdd} /> : null}
    </div>
  );
}

/** Flattens all notes in the report, newest first, used by the professional export. */
export function listNotesSorted(content: NarrativeReportContent): UserNote[] {
  return [...(content.userNotes ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
