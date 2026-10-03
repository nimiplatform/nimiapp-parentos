import type { MedicalAlert } from '../../engine/smart-alerts.js';
import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


export const EVENT_TYPE_LABELS: Record<string, string> = {
  visit: i18nText('MedicalEvents.type.visit'),
  emergency: i18nText('MedicalEvents.type.emergency'),
  hospitalization: i18nText('MedicalEvents.type.hospitalization'),
  checkup: i18nText('MedicalEvents.type.checkup'),
  medication: i18nText('MedicalEvents.type.medication'),
  'lab-report': i18nText('MedicalEvents.type.labReport'),
  other: i18nText('MedicalEvents.type.other'),
};

export const EVENT_TYPE_COLORS: Record<string, string> = {
  visit: '#6366f1',
  emergency: '#ef4444',
  hospitalization: '#f59e0b',
  checkup: '#3b82f6',
  medication: '#10b981',
  'lab-report': '#8b5cf6',
  other: '#6b7280',
};

export const EVENT_TYPE_ICONS: Record<string, string> = {
  visit: '🏥',
  emergency: '🚑',
  hospitalization: '🛏️',
  checkup: '🩺',
  medication: '💊',
  'lab-report': '🧪',
  other: '📋',
};

export interface LabRange {
  max: number;
  color: string;
  label: string;
  tone: 'danger' | 'warning' | 'success';
}

export interface LabItem {
  key: string;
  label: string;
  unit: string;
  ranges: LabRange[];
}

export const LAB_ITEMS: LabItem[] = [
  {
    key: 'vitamin-d',
    label: i18nText('MedicalEvents.lab.vitaminD'),
    unit: 'ng/mL',
    ranges: [
      { max: 12, color: '#dc2626', label: i18nText('MedicalEvents.labRange.severeDeficiency'), tone: 'danger' },
      { max: 20, color: '#f59e0b', label: i18nText('MedicalEvents.labRange.deficiency'), tone: 'warning' },
      { max: 30, color: '#eab308', label: i18nText('MedicalEvents.labRange.insufficiency'), tone: 'warning' },
      { max: 100, color: '#22c55e', label: i18nText('MedicalEvents.labRange.sufficient'), tone: 'success' },
    ],
  },
  {
    key: 'ferritin',
    label: i18nText('MedicalEvents.lab.ferritin'),
    unit: 'ng/mL',
    ranges: [
      { max: 12, color: '#dc2626', label: i18nText('MedicalEvents.labRange.depleted'), tone: 'danger' },
      { max: 30, color: '#f59e0b', label: i18nText('MedicalEvents.labRange.insufficiency'), tone: 'warning' },
      { max: 150, color: '#22c55e', label: i18nText('MedicalEvents.labRange.normal'), tone: 'success' },
    ],
  },
  {
    key: 'hemoglobin',
    label: i18nText('MedicalEvents.lab.hemoglobin'),
    unit: 'g/L',
    ranges: [
      { max: 110, color: '#dc2626', label: i18nText('MedicalEvents.labRange.anemia'), tone: 'danger' },
      { max: 120, color: '#f59e0b', label: i18nText('MedicalEvents.labRange.low'), tone: 'warning' },
      { max: 160, color: '#22c55e', label: i18nText('MedicalEvents.labRange.normal'), tone: 'success' },
    ],
  },
  {
    key: 'calcium',
    label: i18nText('MedicalEvents.lab.calcium'),
    unit: 'mmol/L',
    ranges: [
      { max: 2.20, color: '#dc2626', label: i18nText('MedicalEvents.labRange.low'), tone: 'danger' },
      { max: 2.70, color: '#22c55e', label: i18nText('MedicalEvents.labRange.normal'), tone: 'success' },
      { max: Infinity, color: '#f59e0b', label: i18nText('MedicalEvents.labRange.high'), tone: 'warning' },
    ],
  },
  {
    key: 'zinc',
    label: i18nText('MedicalEvents.lab.zinc'),
    unit: 'μmol/L',
    ranges: [
      { max: 10.7, color: '#dc2626', label: i18nText('MedicalEvents.labRange.deficiency'), tone: 'danger' },
      { max: 17.6, color: '#22c55e', label: i18nText('MedicalEvents.labRange.normal'), tone: 'success' },
      { max: Infinity, color: '#f59e0b', label: i18nText('MedicalEvents.labRange.high'), tone: 'warning' },
    ],
  },
];

export interface LabReportData {
  type: 'lab-report';
  values: Record<string, number | null>;
}

export const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe'] as const;
export const SEVERITY_LABELS: Record<string, string> = {
  mild: i18nText('MedicalEvents.severity.mild'),
  moderate: i18nText('MedicalEvents.severity.moderate'),
  severe: i18nText('MedicalEvents.severity.severe'),
};
export const SEVERITY_COLORS: Record<string, string> = {
  mild: '#22c55e',
  moderate: '#f59e0b',
  severe: '#ef4444',
};
export const RESULT_OPTIONS = ['pass', 'refer', 'fail'] as const;
export const RESULT_LABELS: Record<string, string> = {
  pass: i18nText('MedicalEvents.result.pass'),
  refer: i18nText('MedicalEvents.result.refer'),
  fail: i18nText('MedicalEvents.result.fail'),
  // Vision early screenings (written by the vision page) may also carry
  // `inconclusive`; it is display-only and never offered by the form.
  inconclusive: i18nText('MedicalEvents.result.inconclusive'),
};

export const COMMON_SYMPTOMS = [
  i18nText('MedicalEvents.symptom.fever'),
  i18nText('MedicalEvents.symptom.cough'),
  i18nText('MedicalEvents.symptom.runnyNose'),
  i18nText('MedicalEvents.symptom.vomiting'),
  i18nText('MedicalEvents.symptom.diarrhea'),
  i18nText('MedicalEvents.symptom.rash'),
  i18nText('MedicalEvents.symptom.abdominalPain'),
  i18nText('MedicalEvents.symptom.headache'),
] as const;
export const VISIT_TYPES = ['visit', 'emergency', 'hospitalization', 'checkup', 'medication', 'lab-report', 'other'] as const;

export const ALERT_STYLES: Record<MedicalAlert['level'], { bg: string; border: string; icon: string }> = {
  danger: { bg: '#fef2f2', border: '#fca5a5', icon: '🚨' },
  warning: { bg: '#fffbeb', border: '#fcd34d', icon: '⚠️' },
  info: { bg: '#eff6ff', border: '#93c5fd', icon: 'ℹ️' },
};

export function parseLabReport(notes: string | null): LabReportData | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    return parsed.type === 'lab-report' ? (parsed as unknown as LabReportData) : null;
  } catch {
    return null;
  }
}

export function labRangeFor(item: LabItem, value: number): LabRange {
  return item.ranges.find((range) => value <= range.max) ?? item.ranges[item.ranges.length - 1]!;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(iso: string): string {
  return iso.split('T')[0] ?? iso;
}

/** Calendar date → UTC-midnight stamp, so day differences stay exact. */
function dayStamp(iso: string): number {
  return Date.parse(dateOnly(iso));
}

export interface MedicalDateGroup {
  date: string;
  year: number;
  events: MedicalEventRow[];
}

/**
 * One group per calendar day, newest first — the same date-grouped timeline
 * the dental and vision archives use.
 */
export function groupByDate(events: MedicalEventRow[]): MedicalDateGroup[] {
  const map = new Map<string, MedicalEventRow[]>();
  for (const event of events) {
    const date = dateOnly(event.eventDate);
    const list = map.get(date);
    if (list) list.push(event);
    else map.set(date, [event]);
  }
  return [...map.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, list]) => ({ date, year: parseInt(date.slice(0, 4), 10), events: list }));
}

/** Inclusive day count of a multi-day event (hospital stay, treatment course). */
export function eventDurationDays(event: Pick<MedicalEventRow, 'eventDate' | 'endDate'>): number | null {
  if (!event.endDate) return null;
  const start = dayStamp(event.eventDate);
  const end = dayStamp(event.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / DAY_MS) + 1;
}

/** Stored medication summaries join entries with `；` ("药A 5ml 每日3次；药B"). */
export function splitMedicationEntries(medication: string | null): string[] {
  if (!medication) return [];
  return medication.split(/[;；]/).map((entry) => entry.trim()).filter(Boolean);
}

/** Drug names only — the leading token of each entry, as the composer's drug history does. */
export function medicationNames(medication: string | null): string[] {
  if (!medication) return [];
  const names = medication
    .split(/[,，、;；]/)
    .map((entry) => entry.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
  return [...new Set(names)];
}

/** Title without the " — 症状" suffix the composer appends; lab reports have no visit reason. */
export function visitReason(event: Pick<MedicalEventRow, 'eventType' | 'title'>): string | null {
  if (event.eventType === 'lab-report') return null;
  return event.title.split(' — ')[0]?.trim() || null;
}

export interface MedicalTally {
  name: string;
  count: number;
}

function tally(values: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function sortedTally(counts: Map<string, number>): MedicalTally[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function summarizeVisitReasons(events: MedicalEventRow[]): MedicalTally[] {
  return sortedTally(tally(events.map(visitReason).filter((reason): reason is string => reason !== null)));
}

export function summarizeMedications(events: MedicalEventRow[]): MedicalTally[] {
  return sortedTally(tally(events.flatMap((event) => medicationNames(event.medication))));
}

export interface MedicalKpis {
  /** Records dated within the past 365 days. */
  recentYearCount: number;
  /** Days since the latest record ended (end date for multi-day events); null without records. */
  daysSinceLast: number | null;
  medicationKinds: number;
  labReportCount: number;
}

export function computeMedicalKpis(events: MedicalEventRow[], today: Date = new Date()): MedicalKpis {
  const todayStamp = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const yearAgoStamp = todayStamp - 365 * DAY_MS;
  let recentYearCount = 0;
  let labReportCount = 0;
  let latestStamp: number | null = null;
  for (const event of events) {
    const start = dayStamp(event.eventDate);
    if (!Number.isFinite(start)) continue;
    if (start >= yearAgoStamp && start <= todayStamp) recentYearCount += 1;
    if (event.eventType === 'lab-report') labReportCount += 1;
    const end = event.endDate ? dayStamp(event.endDate) : Number.NaN;
    const last = Number.isFinite(end) && end > start ? end : start;
    if (latestStamp === null || last > latestStamp) latestStamp = last;
  }
  return {
    recentYearCount,
    daysSinceLast: latestStamp === null ? null : Math.max(0, Math.round((todayStamp - latestStamp) / DAY_MS)),
    medicationKinds: summarizeMedications(events).length,
    labReportCount,
  };
}
