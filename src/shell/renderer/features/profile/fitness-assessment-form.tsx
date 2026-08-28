import { useState } from 'react';
import { Button, cn, DashedAddButton, DatePicker, TextField, TextareaField } from '@nimiplatform/kit/ui';
import { AppSelect } from '../../app-shell/app-select.js';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertFitnessAssessment, replaceHealthRecordCapture, saveHealthRecordCapture } from '../../bridge/sqlite-bridge.js';
import type { HealthRecordCaptureValueInput, SaveHealthRecordCaptureInput } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { fitnessAgeTier, type FitnessAgeTier } from '../../engine/fitness-standard-grade.js';
import type { LinkedHealthRecordReminder } from './health-capture-orchestrator.js';
import {
  ChipGroup,
  type ChipOption,
  FormField,
  FormGrid,
  HealthRecordModalShell,
  InfoBanner,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const NUMBER_INPUT_CLASS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const SOURCE_OPTIONS = ['school-pe', 'sports-club', 'clinic', 'self'] as const;
export const FITNESS_SOURCE_LABELS: Record<string, string> = {
  'school-pe': i18nText('Fitness.source.schoolPe'),
  'sports-club': i18nText('Fitness.source.sportsClub'),
  clinic: i18nText('Fitness.source.clinic'),
  self: i18nText('Fitness.source.self'),
};

/* ── Sport-activity categories ─────────────────────────────────────────────
 * The `id` is persisted as the `fitness.activity_category` valueText. Adding a
 * category here is the only change needed for a new sport — the data model and
 * spec carry no per-sport fields. */

export interface ActivityCategoryOption {
  id: string;
  label: string;
  emoji: string;
}

export const ACTIVITY_CATEGORIES: ActivityCategoryOption[] = [
  { id: 'running', label: i18nText('Fitness.activity.running'), emoji: '🏃' },
  { id: 'swimming', label: i18nText('Fitness.activity.swimming'), emoji: '🏊' },
  { id: 'cycling', label: i18nText('Fitness.activity.cycling'), emoji: '🚴' },
  { id: 'skating', label: i18nText('Fitness.activity.skating'), emoji: '🛼' },
  { id: 'basketball', label: i18nText('Fitness.activity.basketball'), emoji: '🏀' },
  { id: 'soccer', label: i18nText('Fitness.activity.soccer'), emoji: '⚽' },
  { id: 'badminton', label: i18nText('Fitness.activity.badminton'), emoji: '🏸' },
  { id: 'table-tennis', label: i18nText('Fitness.activity.tableTennis'), emoji: '🏓' },
  { id: 'tennis', label: i18nText('Fitness.activity.tennis'), emoji: '🎾' },
  { id: 'gymnastics', label: i18nText('Fitness.activity.gymnastics'), emoji: '🤸' },
  { id: 'martial-arts', label: i18nText('Fitness.activity.martialArts'), emoji: '🥋' },
  { id: 'dance', label: i18nText('Fitness.activity.dance'), emoji: '💃' },
  { id: 'climbing', label: i18nText('Fitness.activity.climbing'), emoji: '🧗' },
  { id: 'hiking', label: i18nText('Fitness.activity.hiking'), emoji: '🥾' },
  { id: 'other', label: i18nText('Fitness.activity.other'), emoji: '✨' },
];

export const ACTIVITY_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ACTIVITY_CATEGORIES.map((c) => [c.id, c.label]),
);
export const ACTIVITY_CATEGORY_EMOJI: Record<string, string> = Object.fromEntries(
  ACTIVITY_CATEGORIES.map((c) => [c.id, c.emoji]),
);

export const INTENSITY_OPTIONS = [
  { value: 'light', label: i18nText('Fitness.intensity.light') },
  { value: 'moderate', label: i18nText('Fitness.intensity.moderate') },
  { value: 'vigorous', label: i18nText('Fitness.intensity.vigorous') },
] as const;
export const INTENSITY_LABELS: Record<string, string> = {
  light: i18nText('Fitness.intensity.light'),
  moderate: i18nText('Fitness.intensity.moderate'),
  vigorous: i18nText('Fitness.intensity.vigorous'),
};

// The national-standard test is category id 0; activities follow.
const STANDARD_CATEGORY = 'standard';
const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  [STANDARD_CATEGORY]: { label: i18nText('Fitness.category.standard'), emoji: '📋' },
  ...Object.fromEntries(ACTIVITY_CATEGORIES.map((c) => [c.id, { label: c.label, emoji: c.emoji }])),
};
// Record type splits into two tabs: the single national-standard test and
// sport-activity chips. The standard test is not a chip; picking that tab is
// itself the selection.
const ACTIVITY_TAB = 'activity';
const ACTIVITY_CHIPS: ChipOption<string>[] = ACTIVITY_CATEGORIES.map((c) => ({
  value: c.id,
  label: c.label,
  emoji: c.emoji,
}));

export type AgeTier = FitnessAgeTier;
export type { FitnessAgeTier };

export const FITNESS_AGE_TIER_LABELS: Record<AgeTier, string> = {
  preschool: i18nText('Fitness.ageTier.preschool'),
  grade12: i18nText('Fitness.ageTier.grade12'),
  grade34: i18nText('Fitness.ageTier.grade34'),
  grade56: i18nText('Fitness.ageTier.grade56'),
  grade7plus: i18nText('Fitness.ageTier.grade7plus'),
};

// Tier boundaries are owned by the engine (fitness-standard-grade.ts); this
// export is kept as the form-facing alias so existing callers stay stable.
export function ageTier(ageMonths: number): AgeTier {
  return fitnessAgeTier(ageMonths);
}

type StandardFieldKey =
  | 'run50m' | 'run800m' | 'run1000m' | 'run50x8'
  | 'sitAndReach' | 'standingLongJump' | 'sitUps' | 'pullUps'
  | 'ropeSkipping' | 'vitalCapacity'
  | 'run10mShuttle' | 'tennisBallThrow' | 'doubleFootJump' | 'balanceBeam';

type StandardFieldGroup = 'speed' | 'strength' | 'flex';

interface StandardFieldDef {
  key: StandardFieldKey;
  label: string;
  /** Display unit shown next to the label so parents know what to enter. */
  unit: string;
  /** Sample value used as the input placeholder. */
  example: string;
  /** Optional extra guidance rendered under the input. */
  hint?: string;
  group: StandardFieldGroup;
  step?: string;
  min?: string;
}

export const FITNESS_STANDARD_METRIC_LABELS: Record<StandardFieldKey, string> = {
  run10mShuttle: i18nText('Fitness.metric.run10mShuttle'),
  run50m: i18nText('Fitness.metric.run50m'),
  run800m: i18nText('Fitness.metric.run800m'),
  run1000m: i18nText('Fitness.metric.run1000m'),
  run50x8: i18nText('Fitness.metric.run50x8'),
  standingLongJump: i18nText('Fitness.metric.standingLongJump'),
  tennisBallThrow: i18nText('Fitness.metric.tennisBallThrow'),
  doubleFootJump: i18nText('Fitness.metric.doubleFootJump'),
  sitAndReach: i18nText('Fitness.metric.sitAndReach'),
  sitUps: i18nText('Fitness.metric.sitUps'),
  pullUps: i18nText('Fitness.metric.pullUps'),
  balanceBeam: i18nText('Fitness.metric.balanceBeam'),
  ropeSkipping: i18nText('Fitness.metric.ropeSkipping'),
  vitalCapacity: i18nText('Fitness.metric.vitalCapacity'),
};

const UNIT_SECOND = i18nText('Common.unit.second');
const UNIT_METER = i18nText('Common.unit.meter');
const UNIT_CENTIMETER = i18nText('Common.unit.centimeter');
const UNIT_MILLILITER = i18nText('Common.unit.milliliter');
const UNIT_PER_MINUTE = i18nText('Common.unit.perMinute');
const UNIT_COUNT = i18nText('Common.unit.count');

const STANDARD_FIELDS: StandardFieldDef[] = [
  { key: 'run10mShuttle', label: FITNESS_STANDARD_METRIC_LABELS.run10mShuttle, unit: UNIT_SECOND, example: '9.5', group: 'speed', step: '0.1', min: '0' },
  { key: 'run50m', label: FITNESS_STANDARD_METRIC_LABELS.run50m, unit: UNIT_SECOND, example: '11.2', group: 'speed', step: '0.1', min: '0' },
  { key: 'run800m', label: FITNESS_STANDARD_METRIC_LABELS.run800m, unit: UNIT_SECOND, example: '4:05', hint: i18nText('Fitness.form.runSecondsHint'), group: 'speed', step: '1', min: '0' },
  { key: 'run1000m', label: FITNESS_STANDARD_METRIC_LABELS.run1000m, unit: UNIT_SECOND, example: '4:40', hint: i18nText('Fitness.form.runSecondsHint'), group: 'speed', step: '1', min: '0' },
  { key: 'run50x8', label: FITNESS_STANDARD_METRIC_LABELS.run50x8, unit: UNIT_SECOND, example: '1:45', hint: i18nText('Fitness.form.runSecondsHint'), group: 'speed', step: '0.1', min: '0' },
  { key: 'standingLongJump', label: FITNESS_STANDARD_METRIC_LABELS.standingLongJump, unit: UNIT_CENTIMETER, example: '160', group: 'strength', step: '1', min: '0' },
  { key: 'tennisBallThrow', label: FITNESS_STANDARD_METRIC_LABELS.tennisBallThrow, unit: UNIT_METER, example: '6.5', group: 'strength', step: '0.1', min: '0' },
  { key: 'doubleFootJump', label: FITNESS_STANDARD_METRIC_LABELS.doubleFootJump, unit: UNIT_SECOND, example: '7.0', group: 'strength', step: '0.1', min: '0' },
  { key: 'sitUps', label: FITNESS_STANDARD_METRIC_LABELS.sitUps, unit: UNIT_PER_MINUTE, example: '32', group: 'strength', step: '1', min: '0' },
  { key: 'pullUps', label: FITNESS_STANDARD_METRIC_LABELS.pullUps, unit: UNIT_COUNT, example: '5', group: 'strength', step: '1', min: '0' },
  { key: 'sitAndReach', label: FITNESS_STANDARD_METRIC_LABELS.sitAndReach, unit: UNIT_CENTIMETER, example: '12.5', group: 'flex', step: '0.1' },
  { key: 'balanceBeam', label: FITNESS_STANDARD_METRIC_LABELS.balanceBeam, unit: UNIT_SECOND, example: '12', group: 'flex', step: '0.1', min: '0' },
  { key: 'ropeSkipping', label: FITNESS_STANDARD_METRIC_LABELS.ropeSkipping, unit: UNIT_PER_MINUTE, example: '120', group: 'flex', step: '1', min: '0' },
  { key: 'vitalCapacity', label: FITNESS_STANDARD_METRIC_LABELS.vitalCapacity, unit: UNIT_MILLILITER, example: '1800', group: 'flex', step: '1', min: '0' },
];

const STANDARD_GROUP_LABELS: Record<StandardFieldGroup, string> = {
  speed: i18nText('Fitness.standardGroup.speed'),
  strength: i18nText('Fitness.standardGroup.strength'),
  flex: i18nText('Fitness.standardGroup.flex'),
};

const STANDARD_INT_KEYS = new Set<StandardFieldKey>(['sitUps', 'pullUps', 'ropeSkipping', 'vitalCapacity']);
const STANDARD_CAPTURE_FIELDS: ReadonlyArray<{
  key: StandardFieldKey;
  metricId: string;
  unit: string;
}> = [
  { key: 'run50m', metricId: 'fitness.run_50m', unit: 's' },
  { key: 'run800m', metricId: 'fitness.run_800m', unit: 's' },
  { key: 'run1000m', metricId: 'fitness.run_1000m', unit: 's' },
  { key: 'run50x8', metricId: 'fitness.run_50x8', unit: 's' },
  { key: 'sitAndReach', metricId: 'fitness.sit_and_reach', unit: 'cm' },
  { key: 'standingLongJump', metricId: 'fitness.standing_long_jump', unit: 'cm' },
  { key: 'sitUps', metricId: 'fitness.sit_ups', unit: 'count' },
  { key: 'pullUps', metricId: 'fitness.pull_ups', unit: 'count' },
  { key: 'ropeSkipping', metricId: 'fitness.rope_skipping', unit: 'count_per_min' },
  { key: 'vitalCapacity', metricId: 'fitness.vital_capacity', unit: 'ml' },
  { key: 'run10mShuttle', metricId: 'fitness.run_10m_shuttle', unit: 's' },
  { key: 'tennisBallThrow', metricId: 'fitness.tennis_ball_throw', unit: 'm' },
  { key: 'doubleFootJump', metricId: 'fitness.double_foot_jump', unit: 's' },
  { key: 'balanceBeam', metricId: 'fitness.balance_beam', unit: 's' },
];

// Standard field key ↔ canonical metricId — used to reconstruct an edit entry
// from stored `health_record_values`.
export const STANDARD_METRIC_IDS: Record<StandardFieldKey, string> = {
  run50m: 'fitness.run_50m',
  run800m: 'fitness.run_800m',
  run1000m: 'fitness.run_1000m',
  run50x8: 'fitness.run_50x8',
  sitAndReach: 'fitness.sit_and_reach',
  standingLongJump: 'fitness.standing_long_jump',
  sitUps: 'fitness.sit_ups',
  pullUps: 'fitness.pull_ups',
  ropeSkipping: 'fitness.rope_skipping',
  vitalCapacity: 'fitness.vital_capacity',
  run10mShuttle: 'fitness.run_10m_shuttle',
  tennisBallThrow: 'fitness.tennis_ball_throw',
  doubleFootJump: 'fitness.double_foot_jump',
  balanceBeam: 'fitness.balance_beam',
};

type FieldVisibility = Record<StandardFieldKey, boolean>;

const NO_FIELDS: FieldVisibility = {
  run50m: false, run800m: false, run1000m: false, run50x8: false,
  sitAndReach: false, standingLongJump: false, sitUps: false, pullUps: false,
  ropeSkipping: false, vitalCapacity: false,
  run10mShuttle: false, tennisBallThrow: false, doubleFootJump: false, balanceBeam: false,
};

function visibleFields(tier: AgeTier, isFemale: boolean): FieldVisibility {
  const base = { ...NO_FIELDS, run50m: true, sitAndReach: true, ropeSkipping: true, vitalCapacity: true };
  switch (tier) {
    case 'preschool':
      return { ...NO_FIELDS, run10mShuttle: true, standingLongJump: true, tennisBallThrow: true, doubleFootJump: true, sitAndReach: true, balanceBeam: true };
    case 'grade12':
      return base;
    case 'grade34':
      return { ...base, sitUps: true };
    case 'grade56':
      return { ...base, sitUps: true, run50x8: true };
    case 'grade7plus':
      return {
        ...base,
        standingLongJump: true,
        sitUps: isFemale,
        pullUps: !isFemale,
        run800m: isFemale,
        run1000m: !isFemale,
      };
  }
}

function parseNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseIntNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/* ── Standard-field parsing & plausibility ────────────────────────────────
 * Long runs accept either plain seconds ("245") or min:sec ("4:05",
 * "4分05秒"); every filled value must sit inside a sane range or the save is
 * blocked fail-close. */

// Fields whose text input accepts min:sec notation in addition to seconds.
const TIME_INPUT_KEYS = new Set<StandardFieldKey>(['run800m', 'run1000m', 'run50x8']);

/**
 * Parse a run-duration input into total seconds. Accepts plain seconds
 * ("245"), "m:ss" ("4:05"), and Chinese notation ("4分05秒"). Returns null
 * for empty or unparseable input.
 */
export function parseFitnessTimeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const minSec = /^(\d+)\s*[:：分]\s*(\d{1,2})\s*秒?$/.exec(trimmed);
  if (minSec) {
    const minutes = parseInt(minSec[1]!, 10);
    const seconds = parseInt(minSec[2]!, 10);
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Format total seconds as "m:ss" (e.g. 245 → "4:05"). */
export function formatFitnessSeconds(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Sane per-metric ranges; a filled value outside the range blocks save.
export const FITNESS_PLAUSIBLE_RANGES: Record<StandardFieldKey, { min: number; max: number }> = {
  run50m: { min: 5, max: 20 },
  run800m: { min: 120, max: 600 },
  run1000m: { min: 150, max: 700 },
  run50x8: { min: 60, max: 300 },
  run10mShuttle: { min: 4, max: 20 },
  sitAndReach: { min: -30, max: 45 },
  standingLongJump: { min: 30, max: 320 },
  tennisBallThrow: { min: 1, max: 25 },
  doubleFootJump: { min: 2, max: 20 },
  balanceBeam: { min: 1, max: 60 },
  sitUps: { min: 0, max: 100 },
  pullUps: { min: 0, max: 60 },
  ropeSkipping: { min: 0, max: 300 },
  vitalCapacity: { min: 200, max: 7000 },
};

/** Parse a standard-field raw input into its numeric value (seconds for timed runs). */
export function parseStandardFieldValue(key: StandardFieldKey, raw: string): number | null {
  if (TIME_INPUT_KEYS.has(key)) return parseFitnessTimeInput(raw);
  return STANDARD_INT_KEYS.has(key) ? parseIntNum(raw) : parseNum(raw);
}

/** Empty inputs pass (field not filled); filled inputs must parse and sit inside the plausible range. */
export function isStandardFieldValuePlausible(key: StandardFieldKey, raw: string): boolean {
  if (!raw.trim()) return true;
  const value = parseStandardFieldValue(key, raw);
  if (value == null) return false;
  const range = FITNESS_PLAUSIBLE_RANGES[key];
  return value >= range.min && value <= range.max;
}

// Admitted foot-arch enum values (fitness.foot_arch_status valueText).
const FOOT_ARCH_OPTIONS = ['normal', 'flat', 'high-arch', 'monitoring'] as const;
const FOOT_ARCH_OPTION_LABELS: Record<(typeof FOOT_ARCH_OPTIONS)[number], string> = {
  normal: i18nText('Fitness.footArch.normal'),
  flat: i18nText('Fitness.footArch.flat'),
  'high-arch': i18nText('Fitness.footArch.highArch'),
  monitoring: i18nText('Fitness.footArch.monitoring'),
};

/* ── Event entry model ────────────────────────────────────────────────────
 * Each entry is one card in the modal and saves as its own health record. A
 * `standard` entry writes the national-standard assessment; an activity entry
 * writes a universal sport-activity event. */

export interface FitnessEventEntry {
  category: string;
  standardValues: Partial<Record<StandardFieldKey, string>>;
  /** Foot-arch status for standard entries ('' = not recorded). */
  footArch: string;
  duration: string;
  distance: string;
  intensity: string;
}

export function makeEntry(category: string): FitnessEventEntry {
  return { category, standardValues: {}, footArch: '', duration: '', distance: '', intensity: '' };
}

/** A standard entry is complete only when at least one metric (or foot arch) is filled. */
export function standardEntryHasMetric(entry: FitnessEventEntry): boolean {
  if (entry.footArch.trim()) return true;
  return (Object.keys(entry.standardValues) as StandardFieldKey[])
    .some((key) => (entry.standardValues[key] ?? '').trim() !== '');
}

/** Every filled standard-field value must parse and sit inside its plausible range. */
export function standardEntryValuesPlausible(entry: FitnessEventEntry): boolean {
  return (Object.keys(entry.standardValues) as StandardFieldKey[])
    .every((key) => isStandardFieldValuePlausible(key, entry.standardValues[key] ?? ''));
}

/** Seeds the modal in single-event edit mode for an existing fitness record. */
export interface FitnessEditTarget {
  eventId: string;
  date: string;
  source: string;
  notes: string;
  entry: FitnessEventEntry;
}

type FitnessFormChild = {
  childId: string;
  birthDate: string;
  gender: string;
};

type FitnessFormContentProps = {
  child: FitnessFormChild;
  ageMonths: number;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  linkedReminder?: LinkedHealthRecordReminder | null;
  /** When set, the modal edits this existing record instead of adding new ones. */
  editTarget?: FitnessEditTarget | null;
};

export function FitnessAssessmentFormContent({ child, ageMonths, onSaved, onClose, linkedReminder, editTarget }: FitnessFormContentProps) {
  const derivedTier = ageTier(ageMonths);
  const isFemale = child.gender === 'female';
  const editing = !!editTarget;

  const [date, setDate] = useState(editTarget?.date ?? new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(editTarget?.source || 'self');
  const [notes, setNotes] = useState(editTarget?.notes ?? '');
  const [entries, setEntries] = useState<FitnessEventEntry[]>(
    editTarget ? [editTarget.entry] : [makeEntry('running')],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // '' = auto (derive from age); manual override covers grade-vs-age mismatch
  // (e.g. a 144-month child still in grade 6).
  const [tierOverride, setTierOverride] = useState<AgeTier | ''>('');
  const tier = tierOverride || derivedTier;
  const fields = visibleFields(tier, isFemale);

  const updateEntry = (idx: number, patch: Partial<FitnessEventEntry>) => {
    setEntries((prev) => prev.map((entry, i) => (i === idx ? { ...entry, ...patch } : entry)));
  };
  const addEntry = () => {
    setEntries((prev) => {
      setActiveIdx(prev.length);
      return [...prev, makeEntry('running')];
    });
  };
  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((cur) => (idx < cur ? cur - 1 : Math.min(cur, entries.length - 2)));
  };

  // An activity entry needs a positive duration; a standard entry needs at
  // least one filled metric, and every filled value must be plausible.
  const entryComplete = (entry: FitnessEventEntry) =>
    entry.category === STANDARD_CATEGORY
      ? standardEntryHasMetric(entry) && standardEntryValuesPlausible(entry)
      : (parseNum(entry.duration) ?? 0) > 0;
  const canSave = !!date && entries.every(entryComplete);

  const handleSubmit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(false);
    const now = isoNow();
    const ageAtDate = computeAgeMonthsAt(child.birthDate, date);
    try {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        // A reminder is fulfilled once — attach it to the first event only.
        const linkedStateId = i === 0 ? linkedReminder?.stateId ?? null : null;
        const linkedRuleId = i === 0 ? linkedReminder?.ruleId ?? null : null;
        if (Boolean(linkedStateId) !== Boolean(linkedRuleId)) {
          throw new Error('Fitness reminder-linked capture requires both linkedReminderStateId and linkedReminderRuleId');
        }
        const recordKind = linkedStateId ? 'reminder_linked' : 'manual';
        const sourceSurface = linkedStateId ? 'reminder' : 'profile_detail';
        const value = (
          metricId: string,
          patch: Partial<HealthRecordCaptureValueInput>,
        ): HealthRecordCaptureValueInput => ({
          valueId: ulid(),
          metricId,
          valueNumber: null,
          valueText: null,
          valueJson: null,
          unit: null,
          qualifier: null,
          recordKind: 'measured',
          sourceValueIds: null,
          ...patch,
        });
        const captureInput = (
          eventId: string,
          protocolId: 'fitness-school-assessment' | 'fitness-sport-activity',
          values: HealthRecordCaptureValueInput[],
        ): SaveHealthRecordCaptureInput => ({
          eventId,
          childId: child.childId,
          protocolId,
          groupId: 'fitness',
          recordKind,
          sourceSurface,
          recordedAt: now,
          effectiveDate: date,
          ageMonths: ageAtDate,
          recorderId: null,
          linkedReminderStateId: linkedStateId,
          linkedReminderRuleId: linkedRuleId,
          notes: notes || null,
          metadataJson: source ? JSON.stringify({ assessmentSource: source }) : null,
          now,
          values,
        });

        if (entry.category === STANDARD_CATEGORY) {
          const num = (key: StandardFieldKey) => parseStandardFieldValue(key, entry.standardValues[key] ?? '');
          if (editTarget) {
            const values = STANDARD_CAPTURE_FIELDS
              .map((field) => {
                const valueNumber = num(field.key);
                return valueNumber == null
                  ? null
                  : value(field.metricId, { valueNumber, unit: field.unit });
              })
              .filter((item): item is HealthRecordCaptureValueInput => item != null);
            // Foot arch is an enum/text metric — captured as valueText, never
            // routed through the numeric STANDARD_CAPTURE_FIELDS.
            if (entry.footArch) {
              values.push(value('fitness.foot_arch_status', { valueText: entry.footArch }));
            }
            await replaceHealthRecordCapture(
              editTarget.eventId,
              captureInput(ulid(), 'fitness-school-assessment', values),
            );
            continue;
          }
          await insertFitnessAssessment({
            assessmentId: ulid(),
            childId: child.childId,
            assessedAt: date,
            ageMonths: ageAtDate,
            assessmentSource: source || null,
            run50m: num('run50m'),
            run800m: num('run800m'),
            run1000m: num('run1000m'),
            run50x8: num('run50x8'),
            sitAndReach: num('sitAndReach'),
            standingLongJump: num('standingLongJump'),
            sitUps: num('sitUps'),
            pullUps: num('pullUps'),
            ropeSkipping: num('ropeSkipping'),
            vitalCapacity: num('vitalCapacity'),
            run10mShuttle: num('run10mShuttle'),
            tennisBallThrow: num('tennisBallThrow'),
            doubleFootJump: num('doubleFootJump'),
            balanceBeam: num('balanceBeam'),
            footArchStatus: entry.footArch || null,
            notes: notes || null,
            now,
            linkedReminderStateId: linkedStateId,
            linkedReminderRuleId: linkedRuleId,
          });
        } else {
          const values: HealthRecordCaptureValueInput[] = [
            value('fitness.activity_category', { valueText: entry.category }),
            value('fitness.activity_duration', { valueNumber: parseNum(entry.duration), unit: 'min' }),
          ];
          const distanceNum = parseNum(entry.distance);
          if (distanceNum != null) {
            values.push(value('fitness.activity_distance', { valueNumber: distanceNum, unit: 'm' }));
          }
          if (entry.intensity) {
            values.push(value('fitness.activity_intensity', { valueText: entry.intensity }));
          }
          const input = captureInput(ulid(), 'fitness-sport-activity', values);
          if (editTarget) {
            await replaceHealthRecordCapture(editTarget.eventId, input);
          } else {
            await saveHealthRecordCapture(input);
          }
        }
      }
      await onSaved();
      onClose();
    } catch (error) {
      // Fail-close: surface the failure instead of swallowing it silently.
      catchLog('fitness', 'action:save-fitness-record-failed')(error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title={editing ? i18nText('Fitness.form.editTitle') : i18nText('Fitness.form.addTitle')} icon={editing ? '✏️' : '🏃'} onClose={onClose} />
      <ModalContent>
        <div className="space-y-5">
          <FormGrid cols={2}>
            <FormField label={i18nText('Fitness.form.date')}>
              <DatePicker value={date} onChange={setDate} className="h-12" />
            </FormField>
            <FormField label={i18nText('Fitness.form.source')}>
              <AppSelect
                value={source}
                onChange={setSource}
                options={SOURCE_OPTIONS.map((v) => ({ value: v, label: FITNESS_SOURCE_LABELS[v] ?? v }))}
                className="min-h-12"
                contentClassName="z-[120]"
              />
            </FormField>
          </FormGrid>

          <FormField label={i18nText('Fitness.form.tierLabel')}>
            <AppSelect
              value={tierOverride}
              onChange={(value) => setTierOverride(value as AgeTier | '')}
              options={[
                { value: '', label: `${i18nText('Fitness.form.tierAuto')} · ${FITNESS_AGE_TIER_LABELS[derivedTier]}` },
                ...(Object.keys(FITNESS_AGE_TIER_LABELS) as AgeTier[]).map((v) => ({ value: v, label: FITNESS_AGE_TIER_LABELS[v] })),
              ]}
              className="min-h-12"
              contentClassName="z-[120]"
            />
          </FormField>

          {entries.map((entry, idx) => {
            const isActive = idx === activeIdx;
            const meta = CATEGORY_META[entry.category];
            return (
              <div
                key={idx}
                className={cn(
                  'cursor-pointer rounded-2xl border p-4 transition-all',
                  isActive
                    ? 'border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_38%,var(--nimi-border-subtle))] bg-[var(--nimi-surface-card)]'
                    : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)]',
                )}
                onClick={() => setActiveIdx(idx)}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p
                    className={cn(
                      'text-[13px] font-semibold',
                      isActive ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]',
                    )}
                  >
                    {meta
                      ? i18nText('Fitness.form.eventTitleWithCategory', { index: idx + 1, category: `${meta.emoji} ${meta.label}` })
                      : i18nText('Fitness.form.eventTitle', { index: idx + 1 })}
                  </p>
                  {entries.length > 1 ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeEntry(idx);
                      }}
                      className="rounded-full px-2 py-0.5 text-[12px] text-[var(--nimi-status-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,transparent)]"
                    >
                      {i18nText('Fitness.form.deleteEvent')}
                    </button>
                  ) : null}
                </div>

                {isActive ? (
                  <div className="mt-2 space-y-3" onClick={(event) => event.stopPropagation()}>
                    <FormField label={i18nText('Fitness.form.type')}>
                      <div className="space-y-2.5">
                        <ChipGroup
                          size="sm"
                          layout="fill"
                          options={[
                            { value: STANDARD_CATEGORY, label: i18nText('Fitness.form.tabStandard') },
                            { value: ACTIVITY_TAB, label: i18nText('Fitness.form.tabActivity') },
                          ]}
                          value={entry.category === STANDARD_CATEGORY ? STANDARD_CATEGORY : ACTIVITY_TAB}
                          onChange={(tab) => {
                            if (tab === STANDARD_CATEGORY) {
                              updateEntry(idx, { category: STANDARD_CATEGORY });
                            } else if (entry.category === STANDARD_CATEGORY) {
                              updateEntry(idx, { category: 'running' });
                            }
                          }}
                        />
                        {entry.category !== STANDARD_CATEGORY ? (
                          <ChipGroup
                            size="sm"
                            options={ACTIVITY_CHIPS}
                            value={entry.category}
                            onChange={(value) => updateEntry(idx, { category: value })}
                          />
                        ) : null}
                      </div>
                    </FormField>

                    {entry.category === STANDARD_CATEGORY ? (
                      <>
                        <StandardEventFields
                          tier={tier}
                          fields={fields}
                          values={entry.standardValues}
                          footArch={entry.footArch}
                          onChange={(key, value) =>
                            updateEntry(idx, { standardValues: { ...entry.standardValues, [key]: value } })
                          }
                          onFootArchChange={(value) => updateEntry(idx, { footArch: value })}
                        />
                        {!standardEntryHasMetric(entry) ? (
                          <p className="text-[12px] text-[var(--nimi-status-warning)]">
                            {i18nText('Fitness.form.standardMinOne')}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <ActivityEventFields
                        entry={entry}
                        onChange={(patch) => updateEntry(idx, patch)}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {!editing ? (
            <DashedAddButton shape="row" onClick={addEntry} label={i18nText('Fitness.form.addAnotherEvent')} />
          ) : null}

          <FormField label={i18nText('Fitness.form.notes')}>
            <TextareaField
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={i18nText('Fitness.form.notesPlaceholder')}
              rows={2}
              className="w-full"
            />
          </FormField>

          {saveError ? (
            <p className="rounded-2xl border border-[color-mix(in_srgb,var(--nimi-status-danger)_28%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-4 py-3 text-[13px] text-[var(--nimi-status-danger)]">
              {i18nText('Fitness.form.saveFailed')}
            </p>
          ) : null}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Fitness.form.cancel')}</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !canSave} tone="primary" size="md">
          {saving ? i18nText('Fitness.form.saving') : editing ? i18nText('Fitness.form.saveChanges') : i18nText('Fitness.form.save')}
        </Button>
      </ModalFooter>
    </>
  );
}

function StandardEventFields({
  tier,
  fields,
  values,
  footArch,
  onChange,
  onFootArchChange,
}: {
  tier: AgeTier;
  fields: FieldVisibility;
  values: Partial<Record<StandardFieldKey, string>>;
  footArch: string;
  onChange: (key: StandardFieldKey, value: string) => void;
  onFootArchChange: (value: string) => void;
}) {
  const groups: StandardFieldGroup[] = ['speed', 'strength', 'flex'];
  return (
    <div className="space-y-3">
      <InfoBanner tone="accent">
        {i18nText('Fitness.form.standardBanner', { tier: FITNESS_AGE_TIER_LABELS[tier] })}
      </InfoBanner>
      {groups.map((group) => {
        const groupFields = STANDARD_FIELDS.filter((f) => f.group === group && fields[f.key]);
        if (groupFields.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1.5 text-[12px] font-medium text-[var(--nimi-text-muted)]">
              {STANDARD_GROUP_LABELS[group]}
            </p>
            <FormGrid cols={3}>
              {groupFields.map((f) => (
                <FormField
                  key={f.key}
                  label={i18nText('Fitness.form.labelWithUnit', { label: f.label, unit: f.unit })}
                  hint={f.hint}
                  error={
                    !isStandardFieldValuePlausible(f.key, values[f.key] ?? '')
                      ? i18nText('Fitness.form.valueOutOfRange')
                      : undefined
                  }
                >
                  <TextField
                    type={TIME_INPUT_KEYS.has(f.key) ? 'text' : 'number'}
                    step={f.step}
                    min={f.min}
                    placeholder={i18nText('Fitness.form.examplePlaceholder', { value: f.example })}
                    value={values[f.key] ?? ''}
                    onChange={(event) => onChange(f.key, event.target.value)}
                    className="w-full min-h-12"
                    inputClassName={NUMBER_INPUT_CLASS}
                  />
                </FormField>
              ))}
            </FormGrid>
          </div>
        );
      })}
      <FormField label={i18nText('Fitness.form.footArchLabel')}>
        <AppSelect
          value={footArch}
          onChange={onFootArchChange}
          options={[
            { value: '', label: i18nText('Fitness.form.footArchUnset') },
            ...FOOT_ARCH_OPTIONS.map((v) => ({ value: v, label: FOOT_ARCH_OPTION_LABELS[v] })),
          ]}
          className="min-h-12"
          contentClassName="z-[120]"
        />
      </FormField>
    </div>
  );
}

function ActivityEventFields({
  entry,
  onChange,
}: {
  entry: FitnessEventEntry;
  onChange: (patch: Partial<FitnessEventEntry>) => void;
}) {
  return (
    <div className="space-y-3">
      <FormGrid cols={2}>
        <FormField label={i18nText('Fitness.form.durationLabel')} required>
          <TextField
            type="number"
            step="1"
            min="0"
            placeholder={i18nText('Fitness.form.durationPlaceholder')}
            value={entry.duration}
            onChange={(event) => onChange({ duration: event.target.value })}
            className="w-full min-h-12"
            inputClassName={NUMBER_INPUT_CLASS}
          />
        </FormField>
        <FormField label={i18nText('Fitness.form.distanceLabel')} hint={i18nText('Fitness.form.distanceHint')}>
          <TextField
            type="number"
            step="1"
            min="0"
            placeholder={i18nText('Fitness.form.distancePlaceholder')}
            value={entry.distance}
            onChange={(event) => onChange({ distance: event.target.value })}
            className="w-full min-h-12"
            inputClassName={NUMBER_INPUT_CLASS}
          />
        </FormField>
      </FormGrid>
      <FormField label={i18nText('Fitness.form.intensityLabel')}>
        <ChipGroup
          size="sm"
          layout="fill"
          clearable
          options={INTENSITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={entry.intensity}
          onChange={(value) => onChange({ intensity: value })}
        />
      </FormField>
    </div>
  );
}

export function FitnessAssessmentModal(props: FitnessFormContentProps) {
  return (
    <HealthRecordModalShell open size="L" onClose={props.onClose}>
      <FitnessAssessmentFormContent {...props} />
    </HealthRecordModalShell>
  );
}
