import { Button, IconButton, Surface, Timeline, TimelineGroup } from '@nimiplatform/kit/ui';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, computeAgeMonths, formatAge } from '../../app-shell/app-store.js';
import { deleteFitnessEvent, getHealthRecordEvents, getHealthRecordValues } from '../../bridge/sqlite-bridge.js';
import type { HealthRecordEventRow, HealthRecordValueRow } from '../../bridge/sqlite-bridge.js';
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
  } else {
    const category = entry.valuesByMetric.get('fitness.activity_category')?.valueText ?? 'other';
    const duration = entry.valuesByMetric.get('fitness.activity_duration')?.valueNumber;
    const distance = entry.valuesByMetric.get('fitness.activity_distance')?.valueNumber;
    const intensity = entry.valuesByMetric.get('fitness.activity_intensity')?.valueText ?? '';
    formEntry = {
      category,
      standardValues: {},
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

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--nimi-surface-panel)] px-2 py-0.5 text-[14px]">
      <span className="text-[var(--nimi-text-muted)]">{label}</span>
      <span className="font-medium text-[var(--nimi-text-primary)]">{value}</span>
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
  onAskAi,
  onEdit,
  onDelete,
}: {
  entry: FitnessEntry;
  isLatest: boolean;
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
            : <StandardCardBody entry={entry} isLatest={isLatest} />}
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

function StandardCardBody({ entry, isLatest }: { entry: FitnessEntry; isLatest: boolean }) {
  const chipsFor = (metrics: [string, string, string][]) =>
    metrics
      .map(([metricId, label, unit]) => {
        const v = entry.valuesByMetric.get(metricId);
        return v?.valueNumber != null ? <MetricChip key={metricId} label={label} value={`${v.valueNumber}${unit}`} /> : null;
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
          {entry.source ? (FITNESS_SOURCE_LABELS[entry.source] ?? entry.source) : i18nText('Fitness.category.standard')}
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
              {FOOT_ARCH_LABELS[footArch] ?? footArch}
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
            {FITNESS_SOURCE_LABELS[entry.source] ?? entry.source}
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
