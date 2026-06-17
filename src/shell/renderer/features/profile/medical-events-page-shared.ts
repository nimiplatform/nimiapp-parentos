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

export function groupByMonth(events: MedicalEventRow[]): [string, MedicalEventRow[]][] {
  const map = new Map<string, MedicalEventRow[]>();
  for (const event of events) {
    const yearMonth = event.eventDate.slice(0, 7);
    const list = map.get(yearMonth);
    if (list) list.push(event);
    else map.set(yearMonth, [event]);
  }
  return [...map.entries()].sort((left, right) => right[0].localeCompare(left[0]));
}

export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return i18nText('Common.date.yearMonth', { year, month: parseInt(month ?? '1', 10) });
}
