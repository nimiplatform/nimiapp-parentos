import { Button, IconButton, Surface, Timeline, TimelineGroup } from '@nimiplatform/kit/ui';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppStore, computeAgeMonths, formatAge } from '../../app-shell/app-store.js';
import { deleteFitnessEvent, getHealthRecordEvents, getHealthRecordValues } from '../../bridge/sqlite-bridge.js';
import type { HealthRecordEventRow, HealthRecordValueRow } from '../../bridge/sqlite-bridge.js';
import {
  fitnessAgeTier,
  resolveFitnessStandardBandForAge,
  resolveFitnessStandardThresholds,
  type FitnessStandardBand,
} from '../../engine/fitness-standard-grade.js';
import { AISummaryCard } from './ai-summary-card.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { DentalRecordActionMenu } from './dental-record-action-menu.js';
import {
  FitnessAssessmentModal,
  ageTier,
  makeEntry,
  STANDARD_METRIC_IDS,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_CATEGORY_EMOJI,
  FITNESS_AGE_TIER_LABELS,
  FITNESS_SOURCE_LABELS,
  FITNESS_STANDARD_METRIC_LABELS,
  INTENSITY_LABELS,
  type FitnessEditTarget,
  type FitnessEventEntry,
} from './fitness-assessment-form.js';
import { formatDateLabel } from '../journal/journal-page-helpers.js';
import { i18nText } from '../../i18n/index.js';

const FOOT_ARCH_LABELS: Record<string, string> = {
  normal: i18nText('Fitness.footArch.normal'),
  flat: i18nText('Fitness.footArch.flat'),
  'high-arch': i18nText('Fitness.footArch.highArch'),
  monitoring: i18nText('Fitness.footArch.monitoring'),
};

// National-standard test metrics, grouped for the card body. Each tuple is
// [metricId, label, unit]; only metrics with a recorded value render a chip.
const SPEED_METRICS: [string, string, string][] = [
  ['fitness.run_10m_shuttle', FITNESS_STANDARD_METRIC_LABELS.run10mShuttle, i18nText('Common.unit.second')],
  ['fitness.run_50m', FITNESS_STANDARD_METRIC_LABELS.run50m, i18nText('Common.unit.second')],
  ['fitness.run_800m', FITNESS_STANDARD_METRIC_LABELS.run800m, i18nText('Common.unit.second')],
  ['fitness.run_1000m', FITNESS_STANDARD_METRIC_LABELS.run1000m, i18nText('Common.unit.second')],
  ['fitness.run_50x8', FITNESS_STANDARD_METRIC_LABELS.run50x8, i18nText('Common.unit.second')],
];
const STRENGTH_METRICS: [string, string, string][] = [
  ['fitness.standing_long_jump', FITNESS_STANDARD_METRIC_LABELS.standingLongJump, i18nText('Common.unit.centimeter')],
  ['fitness.tennis_ball_throw', FITNESS_STANDARD_METRIC_LABELS.tennisBallThrow, i18nText('Common.unit.meter')],
  ['fitness.double_foot_jump', FITNESS_STANDARD_METRIC_LABELS.doubleFootJump, i18nText('Common.unit.second')],
  ['fitness.sit_and_reach', FITNESS_STANDARD_METRIC_LABELS.sitAndReach, i18nText('Common.unit.centimeter')],
  ['fitness.sit_ups', FITNESS_STANDARD_METRIC_LABELS.sitUps, i18nText('Common.unit.perMinute')],
  ['fitness.pull_ups', FITNESS_STANDARD_METRIC_LABELS.pullUps, i18nText('Common.unit.count')],
];
const CARDIO_METRICS: [string, string, string][] = [
  ['fitness.balance_beam', FITNESS_STANDARD_METRIC_LABELS.balanceBeam, i18nText('Common.unit.second')],
  ['fitness.rope_skipping', FITNESS_STANDARD_METRIC_LABELS.ropeSkipping, i18nText('Common.unit.perMinute')],
  ['fitness.vital_capacity', FITNESS_STANDARD_METRIC_LABELS.vitalCapacity, i18nText('Common.unit.milliliter')],
];

const ALL_STANDARD_METRICS: [string, string, string][] = [...SPEED_METRICS, ...STRENGTH_METRICS, ...CARDIO_METRICS];

// Fallback direction map for metrics without an admitted threshold table
// (preschool tiers). Timed runs / jumps are lower_better; everything else is
// higher_better. resolveFitnessStandardThresholds wins when a table exists.
const LOWER_BETTER_METRICS = new Set([
  'fitness.run_10m_shuttle',
  'fitness.run_50m',
  'fitness.run_800m',
  'fitness.run_1000m',
  'fitness.run_50x8',
  'fitness.double_foot_jump',
  'fitness.balance_beam',
]);

const GRADE_LABELS: Record<FitnessStandardBand, string> = {
  excellent: i18nText('Fitness.grade.excellent'),
  good: i18nText('Fitness.grade.good'),
  pass: i18nText('Fitness.grade.pass'),
  below_pass: i18nText('Fitness.grade.belowPass'),
};

// Grade pill tones: excellent/good read as success, pass as neutral info,
// below-pass as a quiet warning.
const GRADE_PILL_CLASS: Record<FitnessStandardBand, string> = {
  excellent: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_14%,transparent)] text-[var(--nimi-status-success)]',
  good: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_8%,transparent)] text-[var(--nimi-status-success)]',
  pass: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,transparent)] text-[var(--nimi-status-info)]',
  below_pass: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_12%,transparent)] text-[var(--nimi-status-warning)]',
};

function metricDirection(metricId: string, ageMonths: number, sex: 'male' | 'female'): 'lower_better' | 'higher_better' {
  const tier = fitnessAgeTier(ageMonths);
  if (tier !== 'preschool') {
    const thresholds = resolveFitnessStandardThresholds({ metricId, tier, sex });
    if (thresholds) return thresholds.direction;
  }
  return LOWER_BETTER_METRICS.has(metricId) ? 'lower_better' : 'higher_better';
}

interface FitnessEntry {
  eventId: string;
  date: string;
  ageMonths: number;
  kind: 'standard' | 'activity';
  source: string | null;
  notes: string | null;
  valuesByMetric: Map<string, HealthRecordValueRow>;
}

function parseSource(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { assessmentSource?: unknown };
    return typeof parsed.assessmentSource === 'string' ? parsed.assessmentSource : null;
  } catch {
    return null;
  }
}

// Reconstruct a form-ready entry from a stored record, for the edit modal.
function buildEditTarget(entry: FitnessEntry): FitnessEditTarget {
  let formEntry: FitnessEventEntry;
  if (entry.kind === 'standard') {
    formEntry = makeEntry('standard');
    (Object.keys(STANDARD_METRIC_IDS) as (keyof typeof STANDARD_METRIC_IDS)[]).forEach((key) => {
      const v = entry.valuesByMetric.get(STANDARD_METRIC_IDS[key])?.valueNumber;
      if (v != null) formEntry.standardValues[key] = String(v);
    });
    formEntry.footArch = entry.valuesByMetric.get('fitness.foot_arch_status')?.valueText ?? '';
  } else {
    const category = entry.valuesByMetric.get('fitness.activity_category')?.valueText ?? 'other';
    const duration = entry.valuesByMetric.get('fitness.activity_duration')?.valueNumber;
    const distance = entry.valuesByMetric.get('fitness.activity_distance')?.valueNumber;
    const intensity = entry.valuesByMetric.get('fitness.activity_intensity')?.valueText ?? '';
    formEntry = {
      category,
      standardValues: {},
      footArch: '',
      duration: duration != null ? String(duration) : '',
      distance: distance != null ? String(distance) : '',
      intensity,
    };
  }
  return {
    eventId: entry.eventId,
    date: entry.date,
    source: entry.source ?? 'self',
    notes: entry.notes ?? '',
    entry: formEntry,
  };
}

// Short human-readable summary of an entry, used as AI advisor context.
function summarizeEntry(entry: FitnessEntry): { topic: string; desc: string } {
  if (entry.kind === 'standard') {
    const parts: string[] = [];
    for (const [metricId, label, unit] of [...SPEED_METRICS, ...STRENGTH_METRICS, ...CARDIO_METRICS]) {
      const v = entry.valuesByMetric.get(metricId)?.valueNumber;
      if (v != null) parts.push(`${label} ${v}${unit}`);
    }
    return {
      topic: i18nText('Fitness.summary.standardTopic'),
      desc: [i18nText('Fitness.summary.date', { date: entry.date }), ...parts].join('；'),
    };
  }
  const category = entry.valuesByMetric.get('fitness.activity_category')?.valueText ?? 'other';
  const duration = entry.valuesByMetric.get('fitness.activity_duration')?.valueNumber;
  const distance = entry.valuesByMetric.get('fitness.activity_distance')?.valueNumber;
  const intensity = entry.valuesByMetric.get('fitness.activity_intensity')?.valueText ?? null;
  const topic = ACTIVITY_CATEGORY_LABELS[category] ?? i18nText('Fitness.summary.activityFallbackTopic');
  const parts = [i18nText('Fitness.summary.date', { date: entry.date })];
  if (duration != null) parts.push(i18nText('Fitness.summary.duration', { duration }));
  if (distance != null) parts.push(i18nText('Fitness.summary.distance', { distance }));
  if (intensity) parts.push(i18nText('Fitness.summary.intensity', { intensity: INTENSITY_LABELS[intensity] ?? intensity }));
  return { topic, desc: parts.join('；') };
}

export default function FitnessPage() {
  const navigate = useNavigate();
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [events, setEvents] = useState<HealthRecordEventRow[]>([]);
  const [values, setValues] = useState<HealthRecordValueRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FitnessEditTarget | null>(null);

  const reload = (childId: string) => {
    getHealthRecordEvents(childId).then(setEvents).catch(catchLog('fitness', 'action:load-health-record-events-failed'));
    getHealthRecordValues(childId).then(setValues).catch(catchLog('fitness', 'action:load-health-record-values-failed'));
  };

  useEffect(() => {
    if (activeChildId) reload(activeChildId);
  }, [activeChildId]);

  // Merge events + values into date-sorted fitness entries (newest first).
  const entries = useMemo<FitnessEntry[]>(() => {
    const valuesByEvent = new Map<string, HealthRecordValueRow[]>();
    for (const v of values) {
      const list = valuesByEvent.get(v.eventId);
      if (list) list.push(v);
      else valuesByEvent.set(v.eventId, [v]);
    }
    return events
      .filter((e) => e.groupId === 'fitness')
      .map((e) => {
        const byMetric = new Map<string, HealthRecordValueRow>();
        for (const v of valuesByEvent.get(e.eventId) ?? []) byMetric.set(v.metricId, v);
        return {
          eventId: e.eventId,
          date: e.effectiveDate.split('T')[0]!,
          ageMonths: e.ageMonths,
          kind: e.protocolId === 'fitness-sport-activity' ? 'activity' : 'standard',
          source: parseSource(e.metadataJson),
          notes: e.notes,
          valuesByMetric: byMetric,
        } satisfies FitnessEntry;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [events, values]);

  // One TimelineGroup per calendar date, matching the vision archive timeline.
  const dateGroups = useMemo(() => {
    const groups: { date: string; items: FitnessEntry[] }[] = [];
    for (const entry of entries) {
      const last = groups[groups.length - 1];
      if (last && last.date === entry.date) last.items.push(entry);
      else groups.push({ date: entry.date, items: [entry] });
    }
    return groups;
  }, [entries]);

  // For each standard entry + metric, the nearest chronologically previous
  // standard entry carrying the same metric (entries are newest-first).
  const previousMetricValues = useMemo(() => {
    const standardEntries = entries.filter((e) => e.kind === 'standard');
    const map = new Map<string, Map<string, number>>();
    standardEntries.forEach((entry, idx) => {
      const prev = new Map<string, number>();
      for (const [metricId] of ALL_STANDARD_METRICS) {
        if (entry.valuesByMetric.get(metricId)?.valueNumber == null) continue;
        for (let j = idx + 1; j < standardEntries.length; j++) {
          const previous = standardEntries[j]!.valuesByMetric.get(metricId)?.valueNumber;
          if (previous != null) {
            prev.set(metricId, previous);
            break;
          }
        }
      }
      map.set(entry.eventId, prev);
    });
    return map;
  }, [entries]);

  const [trendMetricId, setTrendMetricId] = useState<string | null>(null);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Fitness.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);
  const latestEntryId = entries[0]?.eventId;

  const handleAskAi = (entry: FitnessEntry) => {
    const { topic, desc } = summarizeEntry(entry);
    const params = new URLSearchParams({ topic, desc, record: 'fitness' });
    navigate(`/advisor?${params.toString()}`);
  };

  const handleDelete = async (entry: FitnessEntry) => {
    if (!window.confirm(i18nText('Fitness.page.deleteConfirm'))) return;
    try {
      await deleteFitnessEvent(entry.eventId);
      reload(child.childId);
    } catch (error) {
      catchLog('fitness', 'action:delete-fitness-event-failed')(error);
    }
  };

  return (
    <ProfileDetailShell
      title={i18nText('Fitness.page.title')}
      actions={!showForm && !editTarget ? (
        <Button tone="primary" size="sm" onClick={() => setShowForm(true)} className="rounded-2xl">
          {i18nText('Fitness.page.addRecord')}
        </Button>
      ) : null}
      aiSummary={
        <AISummaryCard domain="fitness" childName={child.displayName} childId={child.childId}
          ageLabel={formatAge(ageMonths)} gender={child.gender}
          dataContext={entries.length > 0 ? i18nText('Common.count.fitnessRecords', { count: entries.length }) : ''}
        />
      }
    >
      {/* Add Form */}
      {showForm && (
        <FitnessAssessmentModal
          child={{ childId: child.childId, birthDate: child.birthDate, gender: child.gender }}
          ageMonths={ageMonths}
          onSaved={() => reload(child.childId)}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Edit Form */}
      {editTarget && (
        <FitnessAssessmentModal
          child={{ childId: child.childId, birthDate: child.birthDate, gender: child.gender }}
          ageMonths={ageMonths}
          editTarget={editTarget}
          onSaved={() => reload(child.childId)}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Trend Chart */}
      {entries.some((e) => e.kind === 'standard') ? (
        <FitnessTrendCard
          entries={entries}
          currentAgeMonths={ageMonths}
          sex={child.gender}
          selectedMetricId={trendMetricId}
          onSelectMetric={setTrendMetricId}
        />
      ) : null}

      {/* Assessment Timeline */}
      <section>
        {entries.length === 0 ? (
          <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="rounded-3xl p-8 text-center">
            <span className="text-[24px]">🏃</span>
            <p className="text-[14px] mt-2 font-medium text-[var(--nimi-text-primary)]">{i18nText('Fitness.page.emptyTitle')}</p>
            <p className="text-[13px] mt-1 text-[var(--nimi-text-muted)]">{i18nText('Fitness.page.emptyDescription')}</p>
          </Surface>
        ) : (
          <Timeline>
            {dateGroups.map((group, gi) => (
              <TimelineGroup
                key={group.date}
                variant="past"
                tone={gi === 0 ? 'success' : 'neutral'}
                date={formatDateLabel(group.date)}
                secondaryLabel={i18nText('Common.count.timelineItems', { count: group.items.length })}
                isLast={gi === dateGroups.length - 1}
              >
                {group.items.map((entry) => (
                  <FitnessEntryCard
                    key={entry.eventId}
                    entry={entry}
                    isLatest={entry.eventId === latestEntryId}
                    childGender={child.gender}
                    previousValues={previousMetricValues.get(entry.eventId) ?? null}
                    onAskAi={() => handleAskAi(entry)}
                    onEdit={() => setEditTarget(buildEditTarget(entry))}
                    onDelete={() => void handleDelete(entry)}
                  />
                ))}
              </TimelineGroup>
            ))}
          </Timeline>
        )}
      </section>
    </ProfileDetailShell>
  );
}

function LatestPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--nimi-status-success)_10%,transparent)] px-2 py-[3px] text-[11px] font-semibold text-[var(--nimi-status-success)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--nimi-status-success)]" />
      {i18nText('Fitness.page.latest')}
    </span>
  );
}

function MetricChip({ label, value, delta, badge }: { label: string; value: string; delta?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--nimi-surface-panel)] px-2 py-0.5 text-[14px]">
      <span className="text-[var(--nimi-text-muted)]">{label}</span>
      <span className="font-medium text-[var(--nimi-text-primary)]">{value}</span>
      {delta}
      {badge}
    </span>
  );
}

// Small 11px national-standard grade pill rendered inside a metric chip.
function GradePill({ band }: { band: FitnessStandardBand }) {
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-medium ${GRADE_PILL_CLASS[band]}`}>
      {GRADE_LABELS[band]}
    </span>
  );
}

// Delta vs the previous record carrying the same metric. Arrow follows the
// raw change direction; color follows improvement (direction-aware).
function DeltaIndicator({ metricId, value, previous, unit, ageMonths, sex }: {
  metricId: string;
  value: number;
  previous: number;
  unit: string;
  ageMonths: number;
  sex: 'male' | 'female';
}) {
  const diff = value - previous;
  if (diff === 0) return null;
  const direction = metricDirection(metricId, ageMonths, sex);
  const improved = direction === 'lower_better' ? diff < 0 : diff > 0;
  const magnitude = parseFloat(Math.abs(diff).toFixed(1));
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium ${improved ? 'text-[var(--nimi-status-success)]' : 'text-[var(--nimi-status-warning)]'}`}
      title={improved ? i18nText('Fitness.delta.improved') : i18nText('Fitness.delta.regressed')}
    >
      {diff < 0 ? '↓' : '↑'}{magnitude}{unit}
    </span>
  );
}

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[13px] w-8 text-[var(--nimi-text-muted)]">{label}</span>
      {children}
    </div>
  );
}

// AI ✨ + edit/delete ⋮ cluster — mirrors the orthodontic journey timeline so
// the two timelines feel like one surface. The ⋮ menu fades in on card hover.
function CardActions({
  onAskAi,
  onEdit,
  onDelete,
}: {
  onAskAi: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton
        size="sm"
        tone="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onAskAi();
        }}
        aria-label={i18nText('Fitness.page.askAi')}
        title={i18nText('Fitness.page.askAi')}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
            <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" />
          </svg>
        }
      />
      <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <DentalRecordActionMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function FitnessEntryCard({
  entry,
  isLatest,
  childGender,
  previousValues,
  onAskAi,
  onEdit,
  onDelete,
}: {
  entry: FitnessEntry;
  isLatest: boolean;
  childGender: 'male' | 'female';
  previousValues: Map<string, number> | null;
  onAskAi: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="group rounded-3xl p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {entry.kind === 'activity'
            ? <ActivityCardBody entry={entry} isLatest={isLatest} />
            : <StandardCardBody entry={entry} isLatest={isLatest} childGender={childGender} previousValues={previousValues} />}
        </div>
        <CardActions onAskAi={onAskAi} onEdit={onEdit} onDelete={onDelete} />
      </div>
      {entry.notes && (
        <p className="mt-3 border-t border-[var(--nimi-border-subtle)] pt-2 text-[14px] text-[var(--nimi-text-muted)]">
          {entry.notes}
        </p>
      )}
    </Surface>
  );
}

function StandardCardBody({ entry, isLatest, childGender, previousValues }: {
  entry: FitnessEntry;
  isLatest: boolean;
  childGender: 'male' | 'female';
  previousValues: Map<string, number> | null;
}) {
  const chipsFor = (metrics: [string, string, string][]) =>
    metrics
      .map(([metricId, label, unit]) => {
        const v = entry.valuesByMetric.get(metricId);
        if (v?.valueNumber == null) return null;
        const value = v.valueNumber;
        const band = resolveFitnessStandardBandForAge({ metricId, value, ageMonths: entry.ageMonths, sex: childGender });
        const previous = previousValues?.get(metricId);
        return (
          <MetricChip
            key={metricId}
            label={label}
            value={`${value}${unit}`}
            delta={previous != null ? (
              <DeltaIndicator metricId={metricId} value={value} previous={previous} unit={unit} ageMonths={entry.ageMonths} sex={childGender} />
            ) : null}
            badge={band ? <GradePill band={band} /> : null}
          />
        );
      })
      .filter(Boolean);

  const speed = chipsFor(SPEED_METRICS);
  const strength = chipsFor(STRENGTH_METRICS);
  const cardio = chipsFor(CARDIO_METRICS);
  const footArch = entry.valuesByMetric.get('fitness.foot_arch_status')?.valueText ?? null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">
          {entry.source ? (FITNESS_SOURCE_LABELS[entry.source] ?? i18nText('Fitness.source.other')) : i18nText('Fitness.category.standard')}
        </span>
        {isLatest && <LatestPill />}
        <span className="rounded bg-[var(--nimi-surface-panel)] px-1.5 py-0.5 text-[13px] text-[var(--nimi-text-muted)]">
          {FITNESS_AGE_TIER_LABELS[ageTier(entry.ageMonths)]}
        </span>
      </div>
      <div className="space-y-2">
        {speed.length > 0 && <MetricRow label={i18nText('Fitness.card.speed')}>{speed}</MetricRow>}
        {strength.length > 0 && <MetricRow label={i18nText('Fitness.card.strength')}>{strength}</MetricRow>}
        {cardio.length > 0 && <MetricRow label={i18nText('Fitness.card.cardio')}>{cardio}</MetricRow>}
        {footArch && (
          <MetricRow label={i18nText('Fitness.card.footArch')}>
            <span className="inline-flex items-center rounded-full bg-[var(--nimi-surface-panel)] px-2 py-0.5 text-[14px] font-medium text-[var(--nimi-text-primary)]">
              {FOOT_ARCH_LABELS[footArch] ?? i18nText('Fitness.footArch.other')}
            </span>
          </MetricRow>
        )}
      </div>
    </>
  );
}

function ActivityCardBody({ entry, isLatest }: { entry: FitnessEntry; isLatest: boolean }) {
  const category = entry.valuesByMetric.get('fitness.activity_category')?.valueText ?? 'other';
  const duration = entry.valuesByMetric.get('fitness.activity_duration')?.valueNumber ?? null;
  const distance = entry.valuesByMetric.get('fitness.activity_distance')?.valueNumber ?? null;
  const intensity = entry.valuesByMetric.get('fitness.activity_intensity')?.valueText ?? null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">
          <span className="mr-1" aria-hidden="true">{ACTIVITY_CATEGORY_EMOJI[category] ?? '✨'}</span>
          {ACTIVITY_CATEGORY_LABELS[category] ?? category}
        </span>
        {isLatest && <LatestPill />}
        {entry.source && (
          <span className="rounded bg-[var(--nimi-surface-panel)] px-1.5 py-0.5 text-[13px] text-[var(--nimi-text-muted)]">
            {FITNESS_SOURCE_LABELS[entry.source] ?? i18nText('Fitness.source.other')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {duration != null && <MetricChip label={i18nText('Fitness.card.duration')} value={i18nText('Common.duration.minutes', { minutes: duration })} />}
        {distance != null && <MetricChip label={i18nText('Fitness.card.distance')} value={`${distance} ${i18nText('Common.unit.meter')}`} />}
        {intensity && <MetricChip label={i18nText('Fitness.card.intensity')} value={INTENSITY_LABELS[intensity] ?? intensity} />}
      </div>
    </>
  );
}

// Trend card: one metric at a time, oldest → newest, with national-standard
// excellent/good/pass reference lines when the child's current tier resolves
// an admitted threshold table for the selected metric.
function FitnessTrendCard({
  entries,
  currentAgeMonths,
  sex,
  selectedMetricId,
  onSelectMetric,
}: {
  entries: FitnessEntry[];
  currentAgeMonths: number;
  sex: 'male' | 'female';
  selectedMetricId: string | null;
  onSelectMetric: (metricId: string) => void;
}) {
  // Only metrics with ≥2 recorded values across standard entries can trend.
  const standardEntries = useMemo(() => entries.filter((e) => e.kind === 'standard'), [entries]);
  const trendableMetrics = useMemo(
    () => ALL_STANDARD_METRICS.filter(([metricId]) =>
      standardEntries.filter((e) => e.valuesByMetric.get(metricId)?.valueNumber != null).length >= 2),
    [standardEntries],
  );
  const activeMetric = trendableMetrics.find(([metricId]) => metricId === selectedMetricId) ?? trendableMetrics[0];

  const chartData = useMemo(() => {
    if (!activeMetric) return [];
    const [metricId] = activeMetric;
    return standardEntries
      .filter((e) => e.valuesByMetric.get(metricId)?.valueNumber != null)
      .map((e) => ({ date: e.date, value: e.valuesByMetric.get(metricId)!.valueNumber! }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeMetric, standardEntries]);

  const currentTier = fitnessAgeTier(currentAgeMonths);
  const thresholds = activeMetric && currentTier !== 'preschool'
    ? resolveFitnessStandardThresholds({ metricId: activeMetric[0], tier: currentTier, sex })
    : null;

  const lineColor = 'var(--nimi-action-primary-bg)';

  return (
    <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="mb-6 rounded-3xl p-5">
      <p className="mb-3 text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Fitness.trend.title')}</p>
      {trendableMetrics.length === 0 || !activeMetric ? (
        <p className="py-6 text-center text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Fitness.trend.empty')}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {trendableMetrics.map(([metricId, label]) => {
              const isActive = metricId === activeMetric[0];
              return (
                <button
                  key={metricId}
                  type="button"
                  onClick={() => onSelectMetric(metricId)}
                  className={`rounded-full px-2.5 py-1 text-[12px] transition-colors ${
                    isActive
                      ? 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)] font-medium text-[var(--nimi-action-primary-bg)]'
                      : 'bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-muted)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 10, right: 44, bottom: 4, left: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--nimi-border-subtle)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--nimi-text-muted)' }}
                axisLine={{ stroke: 'var(--nimi-border-subtle)' }}
                tickLine={{ stroke: 'var(--nimi-border-subtle)', strokeWidth: 0.5 }}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'var(--nimi-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                cursor={{ stroke: 'var(--nimi-border-strong)', strokeWidth: 1, strokeDasharray: '4 3' }}
                isAnimationActive={false}
                offset={12}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload.find((item) => item.dataKey === 'value');
                  if (!point || point.value == null) return null;
                  return (
                    <div className="pointer-events-none rounded-2xl border border-[var(--nimi-material-glass-thick-border)] bg-[var(--nimi-material-glass-thick-bg)] px-4 py-3 shadow-[var(--nimi-elevation-floating)] backdrop-blur-[var(--nimi-backdrop-blur-strong)]">
                      <p className="text-[13px] font-medium text-[var(--nimi-text-muted)]">{label}</p>
                      <p className="text-[18px] font-bold mt-0.5 tracking-tight text-[var(--nimi-text-primary)]">
                        {String(point.value)}<span className="text-[13px] font-medium ml-1 text-[var(--nimi-text-muted)]">{activeMetric[2]}</span>
                      </p>
                    </div>
                  );
                }}
              />
              {thresholds ? (
                <>
                  <ReferenceLine
                    y={thresholds.excellent}
                    stroke="var(--nimi-status-success)"
                    strokeDasharray="5 4"
                    strokeOpacity={0.7}
                    label={{ value: i18nText('Fitness.trend.lineExcellent'), position: 'insideTopRight', fontSize: 10, fill: 'var(--nimi-status-success)' }}
                  />
                  <ReferenceLine
                    y={thresholds.good}
                    stroke="var(--nimi-status-success)"
                    strokeDasharray="5 4"
                    strokeOpacity={0.45}
                    label={{ value: i18nText('Fitness.trend.lineGood'), position: 'insideTopRight', fontSize: 10, fill: 'var(--nimi-status-success)' }}
                  />
                  <ReferenceLine
                    y={thresholds.pass}
                    stroke="var(--nimi-status-warning)"
                    strokeDasharray="5 4"
                    strokeOpacity={0.6}
                    label={{ value: i18nText('Fitness.trend.linePass'), position: 'insideBottomRight', fontSize: 10, fill: 'var(--nimi-status-warning)' }}
                  />
                </>
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2.5}
                isAnimationActive={false}
                dot={(props: unknown) => {
                  const { cx, cy } = props as { cx: number; cy: number };
                  if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={6} fill={lineColor} opacity={0.12} />
                      <circle cx={cx} cy={cy} r={3.5} fill="var(--nimi-surface-card)" stroke={lineColor} strokeWidth={2} />
                    </g>
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Surface>
  );
}
