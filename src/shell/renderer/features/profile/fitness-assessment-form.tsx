import { useState } from 'react';
import { Button, cn, DashedAddButton, DatePicker, PillTabs, TextField, TextareaField } from '@nimiplatform/kit/ui';
import { AppSelect } from '../../app-shell/app-select.js';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertFitnessAssessment, replaceHealthRecordCapture, saveHealthRecordCapture } from '../../bridge/sqlite-bridge.js';
import type { HealthRecordCaptureValueInput, SaveHealthRecordCaptureInput } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
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

export type AgeTier = 'preschool' | 'grade12' | 'grade34' | 'grade56' | 'grade7plus';

export const FITNESS_AGE_TIER_LABELS: Record<AgeTier, string> = {
  preschool: i18nText('Fitness.ageTier.preschool'),
  grade12: i18nText('Fitness.ageTier.grade12'),
  grade34: i18nText('Fitness.ageTier.grade34'),
  grade56: i18nText('Fitness.ageTier.grade56'),
  grade7plus: i18nText('Fitness.ageTier.grade7plus'),
};

export function ageTier(ageMonths: number): AgeTier {
  if (ageMonths < 72) return 'preschool';
  if (ageMonths < 96) return 'grade12';
  if (ageMonths < 120) return 'grade34';
  if (ageMonths < 144) return 'grade56';
  return 'grade7plus';
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

const STANDARD_FIELDS: StandardFieldDef[] = [
  { key: 'run10mShuttle', label: FITNESS_STANDARD_METRIC_LABELS.run10mShuttle, group: 'speed', step: '0.1', min: '0' },
  { key: 'run50m', label: FITNESS_STANDARD_METRIC_LABELS.run50m, group: 'speed', step: '0.1', min: '0' },
  { key: 'run800m', label: FITNESS_STANDARD_METRIC_LABELS.run800m, group: 'speed', step: '1', min: '0' },
  { key: 'run1000m', label: FITNESS_STANDARD_METRIC_LABELS.run1000m, group: 'speed', step: '1', min: '0' },
  { key: 'run50x8', label: FITNESS_STANDARD_METRIC_LABELS.run50x8, group: 'speed', step: '0.1', min: '0' },
  { key: 'standingLongJump', label: FITNESS_STANDARD_METRIC_LABELS.standingLongJump, group: 'strength', step: '1', min: '0' },
  { key: 'tennisBallThrow', label: FITNESS_STANDARD_METRIC_LABELS.tennisBallThrow, group: 'strength', step: '0.1', min: '0' },
  { key: 'doubleFootJump', label: FITNESS_STANDARD_METRIC_LABELS.doubleFootJump, group: 'strength', step: '0.1', min: '0' },
  { key: 'sitUps', label: FITNESS_STANDARD_METRIC_LABELS.sitUps, group: 'strength', step: '1', min: '0' },
  { key: 'pullUps', label: FITNESS_STANDARD_METRIC_LABELS.pullUps, group: 'strength', step: '1', min: '0' },
  { key: 'sitAndReach', label: FITNESS_STANDARD_METRIC_LABELS.sitAndReach, group: 'flex', step: '0.1' },
  { key: 'balanceBeam', label: FITNESS_STANDARD_METRIC_LABELS.balanceBeam, group: 'flex', step: '0.1', min: '0' },
  { key: 'ropeSkipping', label: FITNESS_STANDARD_METRIC_LABELS.ropeSkipping, group: 'flex', step: '1', min: '0' },
  { key: 'vitalCapacity', label: FITNESS_STANDARD_METRIC_LABELS.vitalCapacity, group: 'flex', step: '1', min: '0' },
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

/* ── Event entry model ────────────────────────────────────────────────────
 * Each entry is one card in the modal and saves as its own health record. A
 * `standard` entry writes the national-standard assessment; an activity entry
 * writes a universal sport-activity event. */

export interface FitnessEventEntry {
  category: string;
  standardValues: Partial<Record<StandardFieldKey, string>>;
  duration: string;
  distance: string;
  intensity: string;
}

export function makeEntry(category: string): FitnessEventEntry {
  return { category, standardValues: {}, duration: '', distance: '', intensity: '' };
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
  const tier = ageTier(ageMonths);
  const isFemale = child.gender === 'female';
  const fields = visibleFields(tier, isFemale);
  const editing = !!editTarget;

  const [date, setDate] = useState(editTarget?.date ?? new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(editTarget?.source || 'self');
  const [notes, setNotes] = useState(editTarget?.notes ?? '');
  const [entries, setEntries] = useState<FitnessEventEntry[]>(
    editTarget ? [editTarget.entry] : [makeEntry('running')],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);

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

  // An activity entry needs a positive duration; a standard entry always saves.
  const entryComplete = (entry: FitnessEventEntry) =>
    entry.category === STANDARD_CATEGORY || (parseNum(entry.duration) ?? 0) > 0;
  const canSave = !!date && entries.every(entryComplete);

  const handleSubmit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
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
          const num = (key: StandardFieldKey) => {
            const raw = entry.standardValues[key] ?? '';
            return STANDARD_INT_KEYS.has(key) ? parseIntNum(raw) : parseNum(raw);
          };
          if (editTarget) {
            const values = STANDARD_CAPTURE_FIELDS
              .map((field) => {
                const valueNumber = num(field.key);
                return valueNumber == null
                  ? null
                  : value(field.metricId, { valueNumber, unit: field.unit });
              })
              .filter((item): item is HealthRecordCaptureValueInput => item != null);
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
            footArchStatus: null,
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
    } catch {
      /* bridge unavailable */
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
                        <PillTabs
                          size="sm"
                          ariaLabel={i18nText('Fitness.field.recordType')}
                          items={[
                            { value: STANDARD_CATEGORY, label: i18nText('Fitness.form.tabStandard') },
                            { value: ACTIVITY_TAB, label: i18nText('Fitness.form.tabActivity') },
                          ]}
                          value={entry.category === STANDARD_CATEGORY ? STANDARD_CATEGORY : ACTIVITY_TAB}
                          onValueChange={(tab) => {
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
                      <StandardEventFields
                        tier={tier}
                        fields={fields}
                        values={entry.standardValues}
                        onChange={(key, value) =>
                          updateEntry(idx, { standardValues: { ...entry.standardValues, [key]: value } })
                        }
                      />
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
  onChange,
}: {
  tier: AgeTier;
  fields: FieldVisibility;
  values: Partial<Record<StandardFieldKey, string>>;
  onChange: (key: StandardFieldKey, value: string) => void;
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
                <FormField key={f.key} label={f.label}>
                  <TextField
                    type="number"
                    step={f.step}
                    min={f.min}
                    placeholder="--"
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
