import type { KeepsakeReason } from './journal-page-helpers.js';
import { i18nText } from '../../i18n/index.js';

export type JournalLocalDraftPayload = {
  version: 1;
  childId: string;
  textContent: string;
  selectedDimension: string | null;
  selectedTags: string[];
  selectedRecorderId: string | null;
  keepsake: boolean;
  keepsakeTitle: string;
  keepsakeReason: KeepsakeReason | null;
  moodTag: string | null;
  subjectiveNotes: string;
  recordedAt: string | null;
};

export type JournalLocalDraftRecord = JournalLocalDraftPayload & {
  updatedAt: string;
};

const JOURNAL_LOCAL_DRAFT_PREFIX = 'parentos:journal-draft:';
const DRAFT_AUTO_RESTORE_AGE_MS = 5 * 60 * 1000;

export function getKeepsakeKeywords() {
  return i18nText('Journal.keepsake.keywords')
    .split('|')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function buildJournalLocalDraftKey(childId: string) {
  return `${JOURNAL_LOCAL_DRAFT_PREFIX}${childId}`;
}

export function serializeJournalLocalDraft(payload: JournalLocalDraftPayload) {
  return JSON.stringify(payload);
}

export function toJournalLocalDraftPayload(record: JournalLocalDraftRecord): JournalLocalDraftPayload {
  return {
    version: 1,
    childId: record.childId,
    textContent: record.textContent,
    selectedDimension: record.selectedDimension,
    selectedTags: record.selectedTags,
    selectedRecorderId: record.selectedRecorderId,
    keepsake: record.keepsake,
    keepsakeTitle: record.keepsakeTitle,
    keepsakeReason: record.keepsakeReason,
    moodTag: record.moodTag,
    subjectiveNotes: record.subjectiveNotes,
    recordedAt: record.recordedAt,
  };
}

export function hasMeaningfulJournalLocalDraft(payload: JournalLocalDraftPayload) {
  return payload.textContent.trim().length > 0
    || payload.selectedDimension !== null
    || payload.selectedTags.length > 0
    || payload.keepsake
    || payload.keepsakeTitle.trim().length > 0
    || payload.keepsakeReason !== null
    || payload.moodTag !== null
    || payload.subjectiveNotes.trim().length > 0;
}

export function readJournalLocalDraft(childId: string): JournalLocalDraftRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    window.localStorage.removeItem(buildJournalLocalDraftKey(childId));
    return null;
  } catch {
    return null;
  }
}

export function writeJournalLocalDraft(record: JournalLocalDraftRecord): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(buildJournalLocalDraftKey(record.childId));
    return false;
  } catch {
    return false;
  }
}

export function clearJournalLocalDraft(childId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildJournalLocalDraftKey(childId));
  } catch {
    /* local storage unavailable */
  }
}

export function formatJournalDraftTime(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(i18nText('Common.date.locale'), { hour: '2-digit', minute: '2-digit' });
}

export function isRecentJournalDraft(updatedAt: string): boolean {
  if (!updatedAt) return false;
  const savedTime = new Date(updatedAt).getTime();
  if (Number.isNaN(savedTime)) return false;
  return Date.now() - savedTime < DRAFT_AUTO_RESTORE_AGE_MS;
}
