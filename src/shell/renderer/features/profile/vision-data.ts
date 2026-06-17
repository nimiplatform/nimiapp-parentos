import type { GrowthTypeId } from '../../knowledge-base/gen/growth-standards.gen.js';
import { REFERENCE_RANGES } from '../../knowledge-base/index.js';
import type { MeasurementRow, MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


/* ── Eye type IDs ────────────────────────────────────────── */

export const EYE_TYPE_IDS: GrowthTypeId[] = [
  'vision-left', 'vision-right', 'corrected-vision-left', 'corrected-vision-right',
  'refraction-sph-left', 'refraction-sph-right', 'refraction-cyl-left', 'refraction-cyl-right',
  'refraction-axis-left', 'refraction-axis-right', 'axial-length-left', 'axial-length-right',
  'corneal-curvature-left', 'corneal-curvature-right',
  'iop-left', 'iop-right',
  'corneal-k1-left', 'corneal-k1-right', 'corneal-k2-left', 'corneal-k2-right',
  'acd-left', 'acd-right', 'lt-left', 'lt-right',
  'hyperopia-reserve',
];
export const EYE_SET = new Set<string>(EYE_TYPE_IDS);

/* ── Chart options ───────────────────────────────────────── */

export const CHART_OPTIONS: Array<{ typeId: GrowthTypeId; label: string }> = [
  { typeId: 'axial-length-right', label: i18nText('Vision.chart.rightAxialLength') },
  { typeId: 'axial-length-left', label: i18nText('Vision.chart.leftAxialLength') },
  { typeId: 'vision-right', label: i18nText('Vision.chart.rightNakedVision') },
  { typeId: 'vision-left', label: i18nText('Vision.chart.leftNakedVision') },
  { typeId: 'refraction-sph-right', label: i18nText('Vision.chart.rightSphere') },
  { typeId: 'refraction-sph-left', label: i18nText('Vision.chart.leftSphere') },
  { typeId: 'iop-right', label: i18nText('Vision.chart.rightIop') },
  { typeId: 'iop-left', label: i18nText('Vision.chart.leftIop') },
  { typeId: 'hyperopia-reserve', label: i18nText('Vision.chart.hyperopiaReserve') },
];

/* ── Types for grouped records ───────────────────────────── */

export interface VisionRecord {
  date: string;
  ageMonths: number;
  data: Map<string, number>;
  measurementsByType: Map<string, MeasurementRow>;
}

/** Group eye measurements by date into VisionRecord cards */
export function groupByDate(ms: MeasurementRow[]): VisionRecord[] {
  const eye = ms.filter((m) => EYE_SET.has(m.typeId));
  const map = new Map<string, VisionRecord>();
  for (const m of eye) {
    const d = m.measuredAt.split('T')[0] ?? m.measuredAt;
    let rec = map.get(d);
    if (!rec) {
      rec = { date: d, ageMonths: m.ageMonths, data: new Map(), measurementsByType: new Map() };
      map.set(d, rec);
    }
    rec.data.set(m.typeId, m.value);
    rec.measurementsByType.set(m.typeId, m);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

export function fmtAge(am: number): string {
  if (am < 24) return i18nText('Vision.age.monthsShort', { months: am });
  const y = Math.floor(am / 12), r = am % 12;
  return r > 0
    ? i18nText('Vision.age.yearsMonthsShort', { years: y, months: r })
    : i18nText('Vision.age.yearsShort', { years: y });
}

/* ── Exam meta extraction (shared with vision-batch-form's writer) ── */

export const EXAM_NOTE_PREFIXES = {
  hospital: 'hospital=',
  doctor: 'doctor=',
  pupil: 'pupil=',
  screenTime: 'screenTime=',
  outdoorTime: 'outdoorTime=',
  controls: 'controls=',
} as const;

export interface ExamMeta {
  hospital: string | null;
  doctor: string | null;
  pupil: string | null;
  notes: string | null;
}

/** Pull common exam-level metadata from any of a record's measurement notes. */
export function parseExamMeta(record: VisionRecord): ExamMeta {
  const out: ExamMeta = { hospital: null, doctor: null, pupil: null, notes: null };
  const otherTokens: string[] = [];
  const seenOther = new Set<string>();

  for (const m of record.measurementsByType.values()) {
    const tokens = (m.notes ?? '').split(' | ').map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (t.startsWith(EXAM_NOTE_PREFIXES.hospital)) {
        if (!out.hospital) out.hospital = t.slice(EXAM_NOTE_PREFIXES.hospital.length).trim();
      } else if (t.startsWith(EXAM_NOTE_PREFIXES.doctor)) {
        if (!out.doctor) out.doctor = t.slice(EXAM_NOTE_PREFIXES.doctor.length).trim();
      } else if (t.startsWith(EXAM_NOTE_PREFIXES.pupil)) {
        if (!out.pupil) out.pupil = t.slice(EXAM_NOTE_PREFIXES.pupil.length).trim();
      } else if (
        t.startsWith(EXAM_NOTE_PREFIXES.screenTime)
        || t.startsWith(EXAM_NOTE_PREFIXES.outdoorTime)
        || t.startsWith(EXAM_NOTE_PREFIXES.controls)
      ) {
        // Known behavioural prefix that does not surface as exam-level meta.
      } else if (!seenOther.has(t)) {
        seenOther.add(t);
        otherTokens.push(t);
      }
    }
  }

  if (otherTokens.length > 0) out.notes = otherTokens.join(' · ');
  return out;
}

/* ── Unified timeline ExamView (quantitative exams + early screenings) ── */

export type ExamKind = 'full' | 'biometric' | 'screen';

export interface ExamView {
  /** Stable identifier — 'measurement-<date>' or 'event-<eventId>'. */
  id: string;
  source: 'measurement' | 'screening';
  date: string;
  ageMonths: number;
  kind: ExamKind;
  hospital: string | null;
  doctor: string | null;
  notes: string | null;
  /** ISO date difference vs today, in days. */
  daysAgo: number;

  // Measurement-source fields (undefined for screenings):
  record?: VisionRecord;
  pupil?: string | null;

  // Screening-source fields (undefined for measurement exams):
  screeningKey?: string | null;
  result?: string | null;
}

/** A measurement record is "full" if it includes any refraction or vision data,
 *  else "biometric" if it has axial-length data; otherwise still "biometric"
 *  to keep the UI bucketed. */
export function deriveMeasurementExamKind(record: VisionRecord): 'full' | 'biometric' {
  const hasRefraction = record.data.has('refraction-sph-right')
    || record.data.has('refraction-sph-left')
    || record.data.has('refraction-cyl-right')
    || record.data.has('refraction-cyl-left');
  const hasVision = record.data.has('vision-right') || record.data.has('vision-left');
  if (hasRefraction || hasVision) return 'full';
  return 'biometric';
}

const VISION_SCREENING_PREFIX = 'vision:';

export function isVisionScreeningEvent(e: MedicalEventRow): boolean {
  return e.notes?.startsWith(VISION_SCREENING_PREFIX) ?? false;
}

export function parseScreeningEvent(e: MedicalEventRow): {
  screeningKey: string | null;
  userNotes: string | null;
} {
  if (!e.notes?.startsWith(VISION_SCREENING_PREFIX)) {
    return { screeningKey: null, userNotes: e.notes };
  }
  const lines = e.notes.split('\n');
  const firstLine = lines[0] ?? '';
  const screeningKey = firstLine.slice(VISION_SCREENING_PREFIX.length) || null;
  const userNotes = lines.length > 1 ? lines.slice(1).join('\n') : null;
  return { screeningKey, userNotes };
}

function daysBetween(date: string, today: Date): number {
  const d = new Date(date);
  const ms = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / (24 * 3600 * 1000)));
}

/** Merge VisionRecords + screening MedicalEventRows into a single newest-first
 *  exam timeline. Today's date is injected for testability. */
export function buildExamViews(
  records: VisionRecord[],
  events: MedicalEventRow[],
  today: Date = new Date(),
): ExamView[] {
  const views: ExamView[] = [];

  for (const rec of records) {
    const meta = parseExamMeta(rec);
    views.push({
      id: `measurement-${rec.date}`,
      source: 'measurement',
      date: rec.date,
      ageMonths: rec.ageMonths,
      kind: deriveMeasurementExamKind(rec),
      hospital: meta.hospital,
      doctor: meta.doctor,
      notes: meta.notes,
      daysAgo: daysBetween(rec.date, today),
      record: rec,
      pupil: meta.pupil,
    });
  }

  for (const e of events) {
    if (!isVisionScreeningEvent(e)) continue;
    const { screeningKey, userNotes } = parseScreeningEvent(e);
    views.push({
      id: `event-${e.eventId}`,
      source: 'screening',
      date: e.eventDate,
      ageMonths: e.ageMonths,
      kind: 'screen',
      hospital: e.hospital,
      doctor: null,
      notes: userNotes,
      daysAgo: daysBetween(e.eventDate, today),
      screeningKey,
      result: e.result,
    });
  }

  return views.sort((a, b) => b.date.localeCompare(a.date));
}

/* ── Exam metric groups (drives the expanded timeline card) ───────── */

export interface MetricRowDef {
  /** Stable key used for prev-comparison lookups. */
  key: string;
  label: string;
  unit: string;
  /** OD/OS lookup keys against VisionRecord.data — null when value is computed. */
  odKey: GrowthTypeId | null;
  osKey: GrowthTypeId | null;
  format?: (v: number) => string;
  /** Compute value from a VisionRecord when the metric is derived (eg SE). */
  compute?: (data: Map<string, number>, eye: 'OD' | 'OS') => number | null;
  important?: boolean;
  muted?: boolean;
  /** Smaller-than threshold below which delta is treated as ≈0. */
  deltaEpsilon?: number;
}

export interface MetricGroupDef {
  key: string;
  label: string;
  metrics: MetricRowDef[];
}

const fmt2 = (v: number) => v.toFixed(2);
const fmt1 = (v: number) => v.toFixed(1);
const fmtSigned2 = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
const fmtAxis = (v: number) => v.toFixed(0);

function readSE(data: Map<string, number>, eye: 'OD' | 'OS'): number | null {
  const sphKey = eye === 'OD' ? 'refraction-sph-right' : 'refraction-sph-left';
  const cylKey = eye === 'OD' ? 'refraction-cyl-right' : 'refraction-cyl-left';
  const sph = data.get(sphKey);
  const cyl = data.get(cylKey);
  if (sph == null) return null;
  return +(sph + (cyl ?? 0) / 2).toFixed(2);
}

export const EXAM_METRIC_GROUPS: MetricGroupDef[] = [
  {
    key: 'vision', label: i18nText('Vision.group.vision'),
    metrics: [
      {
        key: 'vision_naked', label: i18nText('Vision.metric.nakedVision'), unit: '',
        odKey: 'vision-right', osKey: 'vision-left',
        format: fmt1, important: true, deltaEpsilon: 0.05,
      },
      {
        key: 'vision_corrected', label: i18nText('Vision.metric.correctedVision'), unit: '',
        odKey: 'corrected-vision-right', osKey: 'corrected-vision-left',
        format: fmt1, deltaEpsilon: 0.05,
      },
    ],
  },
  {
    key: 'refraction', label: i18nText('Vision.group.refraction'),
    metrics: [
      {
        key: 'sphere', label: i18nText('Vision.metric.sphereShort'), unit: 'D',
        odKey: 'refraction-sph-right', osKey: 'refraction-sph-left',
        format: fmtSigned2,
      },
      {
        key: 'cylinder', label: i18nText('Vision.metric.cylinderShort'), unit: 'D',
        odKey: 'refraction-cyl-right', osKey: 'refraction-cyl-left',
        format: fmt2,
      },
      {
        key: 'axis', label: i18nText('Vision.metric.axisShort'), unit: '°',
        odKey: 'refraction-axis-right', osKey: 'refraction-axis-left',
        format: fmtAxis,
      },
      {
        key: 'se', label: i18nText('Vision.metric.sphericalEquivalent'), unit: 'D',
        odKey: null, osKey: null, compute: readSE,
        format: fmtSigned2, important: true,
      },
    ],
  },
  {
    key: 'biometric', label: i18nText('Vision.group.biometric'),
    metrics: [
      {
        key: 'al', label: i18nText('Vision.metric.axialLengthShort'), unit: 'mm',
        odKey: 'axial-length-right', osKey: 'axial-length-left',
        format: fmt2, important: true, deltaEpsilon: 0.005,
      },
      {
        key: 'ad', label: i18nText('Vision.metric.anteriorDepth'), unit: 'mm',
        odKey: 'acd-right', osKey: 'acd-left',
        format: fmt2,
      },
      {
        key: 'k1', label: i18nText('Vision.metric.cornealK1Flat'), unit: 'D',
        odKey: 'corneal-k1-right', osKey: 'corneal-k1-left',
        format: fmt2,
      },
      {
        key: 'k2', label: i18nText('Vision.metric.cornealK2Steep'), unit: 'D',
        odKey: 'corneal-k2-right', osKey: 'corneal-k2-left',
        format: fmt2,
      },
    ],
  },
];

/** Resolve a metric value from a record, honouring derived `compute` rows. */
export function readMetric(record: VisionRecord, metric: MetricRowDef, eye: 'OD' | 'OS'): number | null {
  if (metric.compute) return metric.compute(record.data, eye);
  const key = eye === 'OD' ? metric.odKey : metric.osKey;
  if (!key) return null;
  const v = record.data.get(key);
  return v ?? null;
}

/* ── Glance metrics (top of page) ─────────────────────────────────── */

export type GlanceStatus = 'ok' | 'warn' | 'danger';

export interface GlanceMetric {
  label: string;
  unit: string;
  od: number | null;
  os: number | null;
  format: (v: number) => string;
  status: GlanceStatus;
  tag: string;
}

/** Build the three at-a-glance chips from the latest measurement record.
 *  Status thresholds use conservative rules: details on which threshold drove
 *  a 'warn' should always come from the underlying exam card, not this chip. */
export function computeGlanceMetrics(latestFull: VisionRecord | null): GlanceMetric[] {
  if (!latestFull) {
    return [
      { label: i18nText('Vision.metric.hyperopiaReserveSe'), unit: 'D', od: null, os: null, format: fmtSigned2, status: 'ok', tag: '—' },
      { label: i18nText('Vision.group.biometric'), unit: 'mm', od: null, os: null, format: fmt2, status: 'ok', tag: '—' },
      { label: i18nText('Vision.metric.nakedVision'), unit: '', od: null, os: null, format: fmt1, status: 'ok', tag: '—' },
    ];
  }
  const seOD = readSE(latestFull.data, 'OD');
  const seOS = readSE(latestFull.data, 'OS');
  const minSE = (seOD != null && seOS != null) ? Math.min(seOD, seOS) : null;
  const seStatus: GlanceStatus = minSE == null ? 'ok' : minSE >= 0.75 ? 'ok' : minSE >= 0 ? 'warn' : 'danger';
  const seTag = minSE == null ? '—' : minSE >= 0.75 ? i18nText('Vision.glance.sufficient') : minSE >= 0 ? i18nText('Vision.glance.low') : i18nText('Vision.glance.myopia');

  const alOD = latestFull.data.get('axial-length-right') ?? null;
  const alOS = latestFull.data.get('axial-length-left') ?? null;
  const alStatus: GlanceStatus = 'ok';
  const alTag = (alOD != null || alOS != null) ? i18nText('Vision.glance.recorded') : '—';

  const vnOD = latestFull.data.get('vision-right') ?? null;
  const vnOS = latestFull.data.get('vision-left') ?? null;
  const minVision = (vnOD != null && vnOS != null) ? Math.min(vnOD, vnOS) : null;
  const visionStatus: GlanceStatus = minVision == null ? 'ok' : minVision >= 1.0 ? 'ok' : minVision >= 0.8 ? 'warn' : 'danger';
  const visionTag = minVision == null ? '—' : minVision >= 1.0 ? i18nText('Vision.glance.standard') : minVision >= 0.8 ? i18nText('Vision.glance.observe') : i18nText('Vision.glance.low');

  return [
    { label: i18nText('Vision.metric.hyperopiaReserveSe'), unit: 'D', od: seOD, os: seOS, format: fmtSigned2, status: seStatus, tag: seTag },
    { label: i18nText('Vision.group.biometric'), unit: 'mm', od: alOD, os: alOS, format: fmt2, status: alStatus, tag: alTag },
    { label: i18nText('Vision.metric.nakedVision'), unit: '', od: vnOD, os: vnOS, format: fmt1, status: visionStatus, tag: visionTag },
  ];
}

/** Find the latest measurement record that has the data needed to feed the
 *  GlanceChip cards (refraction or vision). Returns null if none found. */
export function findLatestFullRecord(records: VisionRecord[]): VisionRecord | null {
  for (const r of records) {
    if (deriveMeasurementExamKind(r) === 'full') return r;
  }
  return records[0] ?? null;
}

/* ── Form field definitions ──────────────────────────────── */

export const FORM_SECTIONS: Array<{
  title: string;
  fields: Array<{ label: string; od: GrowthTypeId; os: GrowthTypeId; unit: string; step: string }>;
}> = [
  {
    title: i18nText('Vision.group.refractionSheet'),
    fields: [
      { label: i18nText('Vision.metric.sphereSph'), od: 'refraction-sph-right', os: 'refraction-sph-left', unit: 'D', step: '0.25' },
      { label: i18nText('Vision.metric.cylinderCyl'), od: 'refraction-cyl-right', os: 'refraction-cyl-left', unit: 'D', step: '0.25' },
      { label: i18nText('Vision.metric.axisAxis'), od: 'refraction-axis-right', os: 'refraction-axis-left', unit: '°', step: '1' },
      { label: i18nText('Vision.metric.nakedVision'), od: 'vision-right', os: 'vision-left', unit: '', step: '0.1' },
      { label: i18nText('Vision.metric.correctedVision'), od: 'corrected-vision-right', os: 'corrected-vision-left', unit: '', step: '0.1' },
      { label: i18nText('Vision.metric.iop'), od: 'iop-right', os: 'iop-left', unit: 'mmHg', step: '1' },
    ],
  },
  {
    title: i18nText('Vision.group.biometrySheet'),
    fields: [
      { label: i18nText('Vision.metric.axialLengthShort'), od: 'axial-length-right', os: 'axial-length-left', unit: 'mm', step: '0.01' },
      { label: i18nText('Vision.metric.cornealK1'), od: 'corneal-k1-right', os: 'corneal-k1-left', unit: 'D', step: '0.25' },
      { label: i18nText('Vision.metric.cornealK2'), od: 'corneal-k2-right', os: 'corneal-k2-left', unit: 'D', step: '0.25' },
      { label: i18nText('Vision.metric.cornealAverage'), od: 'corneal-curvature-right', os: 'corneal-curvature-left', unit: 'D', step: '0.25' },
      { label: i18nText('Vision.metric.anteriorDepth'), od: 'acd-right', os: 'acd-left', unit: 'mm', step: '0.01' },
      { label: i18nText('Vision.metric.lensThickness'), od: 'lt-right', os: 'lt-left', unit: 'mm', step: '0.01' },
    ],
  },
];

/* ── Pupil state options ─────────────────────────────────── */
export const PUPIL_OPTIONS = ['undilated', 'dilated'] as const;
export const PUPIL_LABELS: Record<(typeof PUPIL_OPTIONS)[number], string> = {
  undilated: i18nText('Vision.pupil.undilated'),
  dilated: i18nText('Vision.pupil.dilated'),
};

/* ── Record card row definitions ─────────────────────────── */

export const CARD_REFRACTION_ROWS = [
  { label: i18nText('Vision.metric.sphereSph'), od: 'refraction-sph-right', os: 'refraction-sph-left' },
  { label: i18nText('Vision.metric.cylinderCyl'), od: 'refraction-cyl-right', os: 'refraction-cyl-left' },
  { label: i18nText('Vision.metric.axisAxis'), od: 'refraction-axis-right', os: 'refraction-axis-left' },
  { label: i18nText('Vision.metric.nakedVision'), od: 'vision-right', os: 'vision-left' },
  { label: i18nText('Vision.metric.correctedVision'), od: 'corrected-vision-right', os: 'corrected-vision-left' },
  { label: i18nText('Vision.metric.iop'), od: 'iop-right', os: 'iop-left' },
];

export const CARD_AXIAL_ROWS = [
  { label: i18nText('Vision.metric.axialLengthShort'), od: 'axial-length-right', os: 'axial-length-left' },
  { label: i18nText('Vision.metric.cornealK1'), od: 'corneal-k1-right', os: 'corneal-k1-left' },
  { label: i18nText('Vision.metric.cornealK2'), od: 'corneal-k2-right', os: 'corneal-k2-left' },
  { label: i18nText('Vision.metric.cornealAverage'), od: 'corneal-curvature-right', os: 'corneal-curvature-left' },
  { label: i18nText('Vision.metric.anteriorDepth'), od: 'acd-right', os: 'acd-left' },
  { label: i18nText('Vision.metric.lensThickness'), od: 'lt-right', os: 'lt-left' },
];

/* ── Picker configurations ───────────────────────────────── */

/** Config for each measurement type's picker grid */
export const PICKER_CONFIGS: Record<string, { intRange: [number, number]; decimals: number[] }> = {
  // Axial length: 16-39 mm, .00-.99
  'axial-length': { intRange: [16, 39], decimals: Array.from({ length: 100 }, (_, i) => i) },
  // K curvature: 38-50 D, .00-.99
  'corneal-k': { intRange: [38, 50], decimals: Array.from({ length: 100 }, (_, i) => i) },
  'corneal-curvature': { intRange: [38, 50], decimals: Array.from({ length: 100 }, (_, i) => i) },
  // ACD: 1-6 mm, .00-.99
  'acd': { intRange: [1, 6], decimals: Array.from({ length: 100 }, (_, i) => i) },
  // LT: 2-6 mm, .00-.99
  'lt': { intRange: [2, 6], decimals: Array.from({ length: 100 }, (_, i) => i) },
  // IOP: 5-40 mmHg, integers only
  'iop': { intRange: [5, 40], decimals: [] },
  // SPH: -20 to +10 D, .00/.25/.50/.75
  'refraction-sph': { intRange: [-20, 10], decimals: [0, 25, 50, 75] },
  // CYL: -10 to 0 D, .00/.25/.50/.75
  'refraction-cyl': { intRange: [-10, 0], decimals: [0, 25, 50, 75] },
  // AXIS: 0-180°, integers
  'refraction-axis': { intRange: [0, 180], decimals: [] },
  // Vision: 0.0-2.0, .0-.9
  'vision': { intRange: [0, 2], decimals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  'corrected-vision': { intRange: [0, 2], decimals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // Hyperopia reserve: -5 to +5 D, .00/.25/.50/.75
  'hyperopia-reserve': { intRange: [-5, 5], decimals: [0, 25, 50, 75] },
};

export function getPickerConfig(typeId: string): { intRange: [number, number]; decimals: number[] } | null {
  // Match by prefix: e.g. "axial-length-left" → "axial-length"
  for (const [prefix, cfg] of Object.entries(PICKER_CONFIGS)) {
    if (typeId.startsWith(prefix)) return cfg;
  }
  return null;
}

/* ── Axial length reference data — gender-specific, 4-18 years ──

   Primary source (gender-specific AL percentiles, Table 4):
     He X, Sankaridurg P, Naduvilath T, et al.
     "Normative data and percentile curves for axial length and
      axial length/corneal curvature in Chinese children and
      adolescents aged 4-18 years"
     Br J Ophthalmol 2023;107:167-175
     DOI: 10.1136/bjophthalmol-2021-319431
     Data: 14,127 Chinese participants from 3 studies (STAR, SCORM, etc.)

   Supplementary source (corneal curvature by age/gender, Table 3):
     Same paper, mean +/- SD corneal curvature by age and gender

   Hyperopia reserve (not gender-split, Table 1):
     Chinese expert consensus on reference intervals for hyperopia reserve,
     axial length, corneal curvature, and related genetic factors in
     school-age children (2022), Chinese Journal of Ophthalmology 58(2).

   AL P50 = same-age/same-gender median.
   AL P75 = 75th percentile threshold.
   Axial reserve = P75 - current axial length.
*/

export interface GenderAxialRef { p50: number; p75: number; crMean: number }

// Table 4 from He et al. (2023) BJO — exact values
export const AL_MALE: Record<number, GenderAxialRef> = {
  4:  { p50: 22.39, p75: 22.78, crMean: 7.88 },
  5:  { p50: 22.69, p75: 23.12, crMean: 7.90 },
  6:  { p50: 22.97, p75: 23.45, crMean: 7.89 },
  7:  { p50: 23.25, p75: 23.76, crMean: 7.90 },
  8:  { p50: 23.51, p75: 24.07, crMean: 7.90 },
  9:  { p50: 23.76, p75: 24.36, crMean: 7.90 },
  10: { p50: 23.99, p75: 24.64, crMean: 7.88 },
  11: { p50: 24.22, p75: 24.90, crMean: 7.90 },
  12: { p50: 24.43, p75: 25.15, crMean: 7.91 },
  13: { p50: 24.62, p75: 25.39, crMean: 7.89 },
  14: { p50: 24.81, p75: 25.61, crMean: 7.93 },
  15: { p50: 24.98, p75: 25.82, crMean: 7.91 },
  16: { p50: 25.13, p75: 26.01, crMean: 7.92 },
  17: { p50: 25.28, p75: 26.18, crMean: 7.92 },
  18: { p50: 25.41, p75: 26.35, crMean: 7.92 },
};

export const AL_FEMALE: Record<number, GenderAxialRef> = {
  4:  { p50: 21.78, p75: 22.14, crMean: 7.73 },
  5:  { p50: 22.10, p75: 22.50, crMean: 7.78 },
  6:  { p50: 22.41, p75: 22.85, crMean: 7.76 },
  7:  { p50: 22.70, p75: 23.19, crMean: 7.78 },
  8:  { p50: 22.98, p75: 23.51, crMean: 7.80 },
  9:  { p50: 23.25, p75: 23.82, crMean: 7.80 },
  10: { p50: 23.51, p75: 24.11, crMean: 7.77 },
  11: { p50: 23.75, p75: 24.39, crMean: 7.79 },
  12: { p50: 23.97, p75: 24.65, crMean: 7.81 },
  13: { p50: 24.19, p75: 24.90, crMean: 7.75 },
  14: { p50: 24.39, p75: 25.13, crMean: 7.78 },
  15: { p50: 24.57, p75: 25.34, crMean: 7.81 },
  16: { p50: 24.75, p75: 25.54, crMean: 7.82 },
  17: { p50: 24.91, p75: 25.73, crMean: 7.82 },
  18: { p50: 25.05, p75: 25.89, crMean: 7.83 },
};

export function getAxialRef(ageMonths: number, gender: string): { mean: number; critical: number; kMean: number } | null {
  const ageY = Math.round(ageMonths / 12);
  const clamped = Math.max(4, Math.min(18, ageY));
  const table = gender === 'female' ? AL_FEMALE : AL_MALE;
  const entry = table[clamped];
  if (!entry) return null;
  const kMean = +(337.5 / entry.crMean).toFixed(2);
  return { mean: entry.p50, critical: entry.p75, kMean };
}

/* ── Trend chart reference overlay ─────────────────────────────

   The trend chart plots the child's recorded values against an
   age-shaped reference so a parent reads development at a glance:
     - vision / hyperopia reserve → a shaded normal-range band,
       interpolated from REFERENCE_RANGES' age-banded normalMin/Max.
     - axial length → P50 median + P75 critical lines, from the
       gender-specific AL_MALE / AL_FEMALE percentiles.
   Refraction sphere and IOP have no admitted age reference, so the
   chart renders without an overlay for those metrics.
*/

interface AgeBand { ageMonths: number; normalMin: number; normalMax: number }

const RANGE_TABLES = REFERENCE_RANGES as Record<string, { ranges?: AgeBand[] }>;

/** One merged reference sample at a given age. */
export interface ReferencePoint {
  age: number;
  /** Shaded normal-range band edges (vision / hyperopia reserve). */
  bandLow?: number;
  bandHigh?: number;
  /** P50 median reference line (axial length). */
  median?: number;
  /** P75 critical reference line (axial length). */
  critical?: number;
}

export type ReferenceKind = 'band' | 'percentile';

export interface ChartReference {
  kind: ReferenceKind;
  points: ReferencePoint[];
  /** Short caption describing the reference at the newest measured age. */
  caption: string;
}

/** Linear-interpolate an age-banded table at an arbitrary age; ages
 *  outside the table clamp to the nearest endpoint. */
function interpolateBand(ranges: AgeBand[], age: number): { low: number; high: number } | null {
  const sorted = [...ranges].sort((a, b) => a.ageMonths - b.ageMonths);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  if (age <= first.ageMonths) return { low: first.normalMin, high: first.normalMax };
  if (age >= last.ageMonths) return { low: last.normalMin, high: last.normalMax };
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (age >= lo.ageMonths && age <= hi.ageMonths) {
      const t = (age - lo.ageMonths) / (hi.ageMonths - lo.ageMonths);
      return {
        low: +(lo.normalMin + (hi.normalMin - lo.normalMin) * t).toFixed(2),
        high: +(lo.normalMax + (hi.normalMax - lo.normalMax) * t).toFixed(2),
      };
    }
  }
  return null;
}

const BAND_TABLE_BY_TYPE: Partial<Record<GrowthTypeId, string>> = {
  'vision-left': 'vision',
  'vision-right': 'vision',
  'hyperopia-reserve': 'hyperopiaReserve',
};

const AXIAL_TYPES = new Set<GrowthTypeId>(['axial-length-left', 'axial-length-right']);

/** Build the trend-chart reference overlay for a metric across the
 *  given measurement ages. Returns null when the metric has no
 *  admitted age reference. */
export function buildReferenceBand(
  chartType: GrowthTypeId,
  gender: string,
  ages: number[],
): ChartReference | null {
  const sortedAges = [...new Set(ages)].sort((a, b) => a - b);
  const newestAge = sortedAges[sortedAges.length - 1];
  if (newestAge == null) return null;

  const bandKey = BAND_TABLE_BY_TYPE[chartType];
  if (bandKey) {
    const ranges = RANGE_TABLES[bandKey]?.ranges;
    if (!ranges?.length) return null;
    const points: ReferencePoint[] = [];
    for (const age of sortedAges) {
      const band = interpolateBand(ranges, age);
      if (band) points.push({ age, bandLow: band.low, bandHigh: band.high });
    }
    if (points.length === 0) return null;
    const newest = interpolateBand(ranges, newestAge);
    return {
      kind: 'band',
      points,
      caption: newest ? i18nText('Vision.reference.bandCaption', { age: fmtAge(newestAge), low: newest.low, high: newest.high }) : '',
    };
  }

  if (AXIAL_TYPES.has(chartType)) {
    const points: ReferencePoint[] = [];
    for (const age of sortedAges) {
      const ref = getAxialRef(age, gender);
      if (ref) points.push({ age, median: ref.mean, critical: ref.critical });
    }
    if (points.length === 0) return null;
    const newest = getAxialRef(newestAge, gender);
    return {
      kind: 'percentile',
      points,
      caption: newest ? i18nText('Vision.reference.percentileCaption', { age: fmtAge(newestAge), median: newest.mean, critical: newest.critical }) : '',
    };
  }

  return null;
}

/** Describe where the newest measured value sits relative to the
 *  reference overlay — objective wording only, no risk language. */
export function describeReferenceStatus(
  reference: ChartReference,
  latestValue: number,
): string | null {
  const newest = reference.points[reference.points.length - 1];
  if (!newest) return null;
  if (reference.kind === 'band' && newest.bandLow != null && newest.bandHigh != null) {
    if (latestValue < newest.bandLow) return i18nText('Vision.reference.belowRange');
    if (latestValue > newest.bandHigh) return i18nText('Vision.reference.aboveRange');
    return i18nText('Vision.reference.inRange');
  }
  if (reference.kind === 'percentile' && newest.median != null && newest.critical != null) {
    if (latestValue > newest.critical) return i18nText('Vision.reference.aboveCritical');
    if (latestValue > newest.median) return i18nText('Vision.reference.betweenMedianCritical');
    return i18nText('Vision.reference.belowMedian');
  }
  return null;
}
