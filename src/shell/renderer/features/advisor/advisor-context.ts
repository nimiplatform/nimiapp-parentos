import {
  ADVISOR_RECORD_GROUP_DEFINITIONS,
  HEALTH_METRICS,
  MILESTONE_CATALOG,
  OBSERVATION_DIMENSIONS,
  type AdvisorRecordGroupId,
  type HealthMetricId,
} from '../../knowledge-base/index.js';
import {
  getHealthRecordEvents,
  getHealthRecordValues,
  getJournalEntries,
  getMilestoneRecords,
  getOutdoorGoal,
  getPostureAssessments,
  getVaccineRecords,
} from '../../bridge/sqlite-bridge.js';
import type {
  HealthRecordEventRow,
  HealthRecordValueRow,
  JournalEntryRow,
  MilestoneRecordRow,
  PostureAssessmentRow,
  VaccineRecordRow,
} from '../../bridge/sqlite-bridge.js';
import {
  recomputeDerivedHealthRecordValues,
  type HealthRecordEvent,
  type HealthRecordValue,
} from '../../engine/health-record-domain.js';
import { eventRowToDomain, valueRowToDomain } from '../profile/health-record-row-mappers.js';
import { METRIC_LABEL_KEYS } from '../profile/health-record-display.js';
import { dentalEventLabelAndEmoji, SEVERITY_LABELS as DENTAL_SEVERITY_LABELS } from '../profile/dental-page-domain.js';
import { EVENT_TYPE_LABELS as MEDICAL_EVENT_TYPE_LABELS } from '../profile/medical-events-page-shared.js';
import { circularMeanTime, formatMinutesOfDay, meanMinutes, timeToMinutesOfDay } from '../profile/sleep-week-stats.js';
import { DEFAULT_OUTDOOR_GOAL_MINUTES } from '../outdoor/outdoor-helpers.js';
import { i18nText } from '../../i18n/index.js';
import type { AdvisorTimeExpression } from './advisor-intent.js';

export type { AdvisorRecordGroupId };

export const ADVISOR_RECORD_GROUPS: readonly AdvisorRecordGroupId[] = ADVISOR_RECORD_GROUP_DEFINITIONS
  .map((definition) => definition.groupId);

/** The overview / recent-state default: 30 local calendar days ending today. */
export const ADVISOR_DEFAULT_WINDOW_DAYS = 30;

const LIST_CAP = 24;
const JOURNAL_ENTRY_CAP = 12;
const JOURNAL_TEXT_CHARS = 240;
const NOTE_CHARS = 120;
const DAY_LIST_CAP = 14;

export type AdvisorGroupStatus = 'ok' | 'empty' | 'read-failed';

export interface AdvisorPeriod {
  readonly kind: AdvisorTimeExpression['kind'];
  readonly start: string;
  readonly end: string;
  readonly defaulted: boolean;
}

export interface AdvisorChildContext {
  readonly childId: string;
  readonly displayName: string;
  readonly gender: string;
  readonly birthDate: string;
  readonly nurtureMode: string;
  readonly ageMonths: number;
  readonly recorderProfiles: ReadonlyArray<{ id: string; name: string }> | null;
}

export interface AdvisorGroupFacts {
  readonly group: AdvisorRecordGroupId;
  readonly label: string;
  readonly status: AdvisorGroupStatus;
  /** Latest record date of the group, even when it falls before the period. */
  readonly latestRecordDate: string | null;
  readonly inPeriodCount: number;
  /** Record dates that were actually handed to the model. */
  readonly includedDates: readonly string[];
  readonly data?: Record<string, unknown>;
}

export interface AdvisorFacts {
  readonly requestedAt: string;
  readonly today: string;
  readonly period: AdvisorPeriod;
  readonly groups: readonly AdvisorGroupFacts[];
  /** Human-readable notes about detail that was trimmed to fit the budget. */
  readonly trimmed: readonly string[];
}

type SourceResult<T> = { readonly status: 'ok'; readonly rows: T } | { readonly status: 'failed' };

export interface AdvisorRawSources {
  readonly health?: SourceResult<{ events: HealthRecordEventRow[]; values: HealthRecordValueRow[] }>;
  readonly vaccines?: SourceResult<VaccineRecordRow[]>;
  readonly milestones?: SourceResult<MilestoneRecordRow[]>;
  readonly posture?: SourceResult<PostureAssessmentRow[]>;
  readonly outdoorGoal?: SourceResult<number | null>;
  readonly journal?: SourceResult<JournalEntryRow[]>;
}

const HEALTH_BACKED_GROUPS = new Set<AdvisorRecordGroupId>([
  'growth', 'vision', 'fitness', 'sleep', 'outdoor', 'dental', 'medical', 'development',
]);

/* ── dates ────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Record dates follow the app's local calendar; date-only values stay as-is. */
export function localDateOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (ISO_DATE.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatLocalDate(date);
}

function utcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const next = utcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const day = utcDate(date).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function daysInclusive(start: string, end: string): number {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000) + 1;
}

function isValidDate(value: string) {
  return ISO_DATE.test(value) && !Number.isNaN(utcDate(value).getTime()) && utcDate(value).toISOString().startsWith(value);
}

export function resolveAdvisorPeriod(time: AdvisorTimeExpression, today: string, birthDate: string): AdvisorPeriod {
  const birth = localDateOf(birthDate) ?? today;
  const clampStart = (start: string) => (start < birth ? birth : start);
  switch (time.kind) {
    case 'recent-days':
      return { kind: time.kind, start: clampStart(addDays(today, -(time.days - 1))), end: today, defaulted: false };
    case 'this-week':
      return { kind: time.kind, start: clampStart(mondayOf(today)), end: today, defaulted: false };
    case 'last-week': {
      const start = addDays(mondayOf(today), -7);
      return { kind: time.kind, start: clampStart(start), end: addDays(start, 6), defaulted: false };
    }
    case 'this-month':
      return { kind: time.kind, start: clampStart(`${today.slice(0, 7)}-01`), end: today, defaulted: false };
    case 'last-month': {
      const firstOfMonth = `${today.slice(0, 7)}-01`;
      const lastOfPrevious = addDays(firstOfMonth, -1);
      return { kind: time.kind, start: clampStart(`${lastOfPrevious.slice(0, 7)}-01`), end: lastOfPrevious, defaulted: false };
    }
    case 'range': {
      const end = time.end > today ? today : time.end;
      const start = time.start > end ? end : time.start;
      return { kind: time.kind, start: clampStart(start), end, defaulted: false };
    }
    case 'all':
      return { kind: time.kind, start: birth, end: today, defaulted: false };
    case 'default':
    default:
      return {
        kind: 'default',
        start: clampStart(addDays(today, -(ADVISOR_DEFAULT_WINDOW_DAYS - 1))),
        end: today,
        defaulted: true,
      };
  }
}

export function isAdvisorIsoDate(value: unknown): value is string {
  return typeof value === 'string' && isValidDate(value);
}

/* ── reads ────────────────────────────────────────────────── */

async function settle<T>(read: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    return { status: 'ok', rows: await read() };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Reads only the local sources the resolved groups need. Each source settles
 * separately so a failure is reported as a read failure of the groups that
 * depend on it, never as "no records".
 */
// @nimi-authority: rule.parentos.advs.r001
export async function readAdvisorSources(
  childId: string,
  groups: readonly AdvisorRecordGroupId[],
): Promise<AdvisorRawSources> {
  const wanted = new Set(groups);
  const needsHealth = groups.some((group) => HEALTH_BACKED_GROUPS.has(group));
  const [health, vaccines, milestones, posture, outdoorGoal, journal] = await Promise.all([
    needsHealth
      ? settle(async () => {
        const [events, values] = await Promise.all([getHealthRecordEvents(childId), getHealthRecordValues(childId)]);
        return { events, values };
      })
      : undefined,
    wanted.has('vaccine') ? settle(() => getVaccineRecords(childId)) : undefined,
    wanted.has('development') ? settle(() => getMilestoneRecords(childId)) : undefined,
    wanted.has('posture') ? settle(() => getPostureAssessments(childId)) : undefined,
    wanted.has('outdoor') ? settle(() => getOutdoorGoal(childId)) : undefined,
    // SQLite's negative LIMIT reads the full source; trim only after computing
    // the requested period so older windows never look empty due to a UI cap.
    wanted.has('journal') ? settle(() => getJournalEntries(childId, -1)) : undefined,
  ]);
  return { health, vaccines, milestones, posture, outdoorGoal, journal };
}

/* ── projection helpers ───────────────────────────────────── */

export function advisorRecordGroupLabel(group: AdvisorRecordGroupId): string {
  return i18nText(`Advisor.recordGroup.${group}`);
}

function metricLabel(metricId: string): string {
  const key = METRIC_LABEL_KEYS[metricId];
  const fallback = HEALTH_METRICS.find((metric) => metric.metricId === metricId)?.displayName ?? metricId;
  return key ? i18nText(key, { defaultValue: fallback }) : fallback;
}

function metricUnit(metricId: string, value: HealthRecordValue): string | null {
  return value.unit ?? HEALTH_METRICS.find((metric) => metric.metricId === metricId)?.unit ?? null;
}

/**
 * Parent-facing unit: catalog codes such as years/stage/percent are worded,
 * decimal visual acuity has no unit, and symbols like cm or mmHg stay as-is.
 */
function unitLabel(unit: string | null | undefined): string | null {
  if (!unit || unit === 'decimal') return null;
  if (!/^[a-z_]+$/u.test(unit)) return unit;
  return i18nText(`Advisor.facts.unit.${unit}`, { defaultValue: unit }) || null;
}

function camelCase(value: string): string {
  return value.replace(/[-_]([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}

/** Parent-facing wording of an enum value; a stored code never reaches the model. */
function enumValueLabel(metricId: string, raw: string): string {
  const code = camelCase(raw);
  switch (metricId) {
    case 'fitness.foot_arch_status':
      return i18nText(`Fitness.footArch.${code}`, { defaultValue: raw });
    case 'fitness.activity_category':
      return i18nText(`Fitness.activity.${code}`, { defaultValue: raw });
    case 'fitness.activity_intensity':
      return i18nText(`Fitness.intensity.${code}`, { defaultValue: raw });
    case 'development.menarche_status':
      return i18nText(`Tanner.form.menarche${code.charAt(0).toUpperCase()}${code.slice(1)}`, { defaultValue: raw });
    default:
      return raw;
  }
}

function clip(text: string | null | undefined, max: number): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown> | null, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function inPeriod(date: string, period: AdvisorPeriod) {
  return date >= period.start && date <= period.end;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

interface SeriesPoint {
  date: string;
  value: number | string;
  note?: string;
}

interface DatedEvent {
  event: HealthRecordEvent;
  date: string;
  values: HealthRecordValue[];
}

interface HealthIndex {
  events: DatedEvent[];
}

function buildHealthIndex(
  rows: { events: HealthRecordEventRow[]; values: HealthRecordValueRow[] },
  childId: string,
  today: string,
  nowIso: string,
): HealthIndex {
  const events = rows.events.map(eventRowToDomain).filter((event) => event.childId === childId);
  const values = recomputeDerivedHealthRecordValues(
    events,
    rows.values.map(valueRowToDomain).filter((value) => value.childId === childId),
    {
      nowIso,
      makeValueId: (event, metricId, sourceValueIds) => `${event.eventId}:${metricId}:${sourceValueIds.join('+')}`,
    },
  );
  const valuesByEvent = new Map<string, HealthRecordValue[]>();
  for (const value of values) {
    const bucket = valuesByEvent.get(value.eventId) ?? [];
    bucket.push(value);
    valuesByEvent.set(value.eventId, bucket);
  }
  const dated: DatedEvent[] = [];
  for (const event of events) {
    const date = localDateOf(event.effectiveDate);
    // Records dated after the request date are not part of "as of today".
    if (!date || date > today) continue;
    dated.push({ event, date, values: valuesByEvent.get(event.eventId) ?? [] });
  }
  dated.sort((left, right) => left.date.localeCompare(right.date) || left.event.createdAt.localeCompare(right.event.createdAt));
  return { events: dated };
}

function metricSeries(
  index: HealthIndex,
  groupId: string,
  period: AdvisorPeriod,
  includedDates: Set<string>,
  options: { withNotes: boolean },
) {
  const byMetric = new Map<HealthMetricId, Array<{ point: SeriesPoint; unit: string | null }>>();
  for (const dated of index.events) {
    if (dated.event.groupId !== groupId) continue;
    for (const value of dated.values) {
      const raw = typeof value.valueNumber === 'number' ? value.valueNumber : value.valueText?.trim();
      if (raw === undefined || raw === null || raw === '') continue;
      const bucket = byMetric.get(value.metricId) ?? [];
      const note = options.withNotes ? clip(dated.event.notes, NOTE_CHARS) : undefined;
      bucket.push({ point: { date: dated.date, value: typeof raw === 'number' ? round1(raw) : enumValueLabel(value.metricId, raw), ...(note ? { note } : {}) }, unit: metricUnit(value.metricId, value) });
      byMetric.set(value.metricId, bucket);
    }
  }

  const series: Array<Record<string, unknown>> = [];
  let inPeriodCount = 0;
  for (const [metricId, points] of byMetric) {
    const inside = points.filter((entry) => inPeriod(entry.point.date, period));
    const before = points.filter((entry) => entry.point.date < period.start);
    const latestBefore = before.at(-1);
    const listed = inside.slice(-LIST_CAP);
    const numeric = points.filter((entry) => typeof entry.point.value === 'number');
    const last = numeric.at(-1);
    const previous = numeric.at(-2);
    const change = last && previous && last.unit === previous.unit
      ? { from: previous.point, to: last.point, delta: round1((last.point.value as number) - (previous.point.value as number)) }
      : undefined;
    const numericInside = inside.map((entry) => entry.point.value).filter((value): value is number => typeof value === 'number');
    inPeriodCount += inside.length;
    for (const entry of listed) includedDates.add(entry.point.date);
    if (latestBefore && inside.length === 0) includedDates.add(latestBefore.point.date);
    if (change) {
      includedDates.add(change.from.date);
      includedDates.add(change.to.date);
    }
    series.push({
      metric: metricLabel(metricId),
      unit: unitLabel(points[0]?.unit),
      inPeriod: listed.map((entry) => entry.point),
      ...(inside.length > listed.length ? { earlierInPeriodOmitted: inside.length - listed.length } : {}),
      ...(inside.length > listed.length && numericInside.length > 0
        ? {
          periodSummary: {
            count: inside.length,
            min: Math.min(...numericInside),
            max: Math.max(...numericInside),
            first: inside[0]?.point,
            last: inside.at(-1)?.point,
          },
        }
        : {}),
      ...(inside.length === 0 && latestBefore ? { latestBeforePeriod: latestBefore.point } : {}),
      ...(change ? { latestChange: change } : {}),
    });
  }
  return { series, inPeriodCount };
}

function latestDate(dates: Array<string | null>): string | null {
  return dates.filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
}

/* ── per-group projections ────────────────────────────────── */

type Projection = Pick<AdvisorGroupFacts, 'status' | 'latestRecordDate' | 'inPeriodCount' | 'data'> & { includedDates: Set<string> };

function emptyProjection(): Projection {
  return { status: 'empty', latestRecordDate: null, inPeriodCount: 0, includedDates: new Set() };
}

function projectMeasuredGroup(index: HealthIndex, groupId: 'growth' | 'vision', period: AdvisorPeriod): Projection {
  const includedDates = new Set<string>();
  const { series, inPeriodCount } = metricSeries(index, groupId, period, includedDates, { withNotes: groupId === 'vision' });
  const latestRecordDate = latestDate(index.events.filter((dated) => dated.event.groupId === groupId).map((dated) => dated.date));
  if (!latestRecordDate) return emptyProjection();
  return { status: 'ok', latestRecordDate, inPeriodCount, includedDates, data: { metrics: series } };
}

function projectSleep(index: HealthIndex, period: AdvisorPeriod): Projection {
  const nights = index.events
    .filter((dated) => dated.event.protocolId === 'sleep-night')
    .map((dated) => {
      const metadata = parseJsonObject(dated.event.metadataJson);
      const night = dated.values.find((value) => value.metricId === 'sleep.duration_minutes')?.valueNumber;
      return {
        date: dated.date,
        nightMinutes: typeof night === 'number' && night > 0 ? Math.round(night) : undefined,
        napMinutes: numberField(metadata, 'napMinutes'),
        bedtime: stringField(metadata, 'bedtime'),
        wakeTime: stringField(metadata, 'wakeTime'),
      };
    });
  const latestRecordDate = latestDate(nights.map((night) => night.date));
  if (!latestRecordDate) return emptyProjection();

  // One row per night; the last write of a date wins, matching the sleep page.
  const byDate = new Map<string, (typeof nights)[number]>();
  for (const night of nights) byDate.set(night.date, night);
  const inside = [...byDate.values()].filter((night) => inPeriod(night.date, period)).sort((a, b) => a.date.localeCompare(b.date));
  const nightValues = inside.map((night) => night.nightMinutes).filter((value): value is number => value != null);
  const napValues = inside.map((night) => night.napMinutes).filter((value): value is number => value != null && value > 0);
  const totals = inside
    .map((night) => (night.nightMinutes ?? 0) + (night.napMinutes ?? 0))
    .filter((value) => value > 0);
  const bedtimes = inside
    .map((night) => (night.bedtime ? timeToMinutesOfDay(night.bedtime) : null))
    .filter((value): value is number => value != null);
  const avgBedtime = circularMeanTime(bedtimes);
  // Statistics cover every night of the period; only the latest nights are
  // listed one by one, so a long period is not read as a short list.
  const listed = inside.slice(-DAY_LIST_CAP);
  const includedDates = new Set(inside.map((night) => night.date));
  const latestBefore = inside.length === 0
    ? [...byDate.values()].filter((night) => night.date < period.start).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : undefined;
  if (latestBefore) includedDates.add(latestBefore.date);
  return {
    status: 'ok',
    latestRecordDate,
    inPeriodCount: inside.length,
    includedDates,
    data: {
      periodDays: daysInclusive(period.start, period.end),
      recordedNights: inside.length,
      averageNightMinutes: meanMinutes(nightValues),
      averageNapMinutesOnNapDays: meanMinutes(napValues),
      napDays: napValues.length,
      averageTotalMinutes: meanMinutes(totals),
      averageBedtime: avgBedtime == null ? null : formatMinutesOfDay(avgBedtime),
      nights: listed,
      ...(inside.length > listed.length ? { earlierNightsOmitted: inside.length - listed.length } : {}),
      ...(latestBefore ? { latestBeforePeriod: latestBefore } : {}),
    },
  };
}

function sumByDate(entries: Array<{ date: string; minutes: number }>) {
  const byDate = new Map<string, number>();
  for (const entry of entries) byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.minutes);
  return byDate;
}

function windowTotal(byDate: ReadonlyMap<string, number>, start: string, end: string) {
  let total = 0;
  let days = 0;
  for (const [date, minutes] of byDate) {
    if (date >= start && date <= end) {
      total += minutes;
      days += 1;
    }
  }
  // No rows is not a recorded zero: say so in words rather than with a number.
  return days > 0
    ? { start, end, totalMinutes: total, recordedDays: days }
    : { start, end, recordedDays: 0, note: i18nText('Advisor.facts.windowNoRecords') };
}

function projectOutdoor(index: HealthIndex, goal: number | null, period: AdvisorPeriod, today: string): Projection {
  const entries = index.events
    .filter((dated) => dated.event.protocolId === 'outdoor-activity')
    .flatMap((dated) => dated.values
      .filter((value) => value.metricId === 'outdoor.activity_minutes' && typeof value.valueNumber === 'number')
      .map((value) => ({ date: dated.date, minutes: Math.round(value.valueNumber as number) })));
  const byDate = sumByDate(entries);
  const thisWeekStart = mondayOf(today);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const insideDays = [...byDate.entries()]
    .filter(([date]) => inPeriod(date, period))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes }));
  const listed = insideDays.slice(-DAY_LIST_CAP);
  const includedDates = new Set(insideDays.map((day) => day.date));
  for (const date of byDate.keys()) {
    if (date >= lastWeekStart && date <= today) includedDates.add(date);
  }
  const latestRecordDate = latestDate([...byDate.keys()]);
  const goalMinutes = goal ?? DEFAULT_OUTDOOR_GOAL_MINUTES;
  const thisWeek = windowTotal(byDate, thisWeekStart, today);
  return {
    // The goal alone is still a fact worth stating even without activity rows.
    status: latestRecordDate || goal != null ? 'ok' : 'empty',
    latestRecordDate,
    inPeriodCount: insideDays.length,
    includedDates,
    data: {
      weeklyGoal: {
        minutes: goalMinutes,
        setBy: i18nText(goal != null ? 'Advisor.facts.goalSetByParent' : 'Advisor.facts.goalAppDefault'),
      },
      // Named windows plus deterministic arithmetic, so the answer never has
      // to guess which span a total belongs to or subtract on its own.
      thisWeekSoFar: {
        window: i18nText('Advisor.facts.windowThisWeek'),
        ...thisWeek,
        minutesStillToWeeklyGoal: Math.max(0, goalMinutes - (thisWeek.totalMinutes ?? 0)),
        daysLeftThisWeekIncludingToday: daysInclusive(today, addDays(thisWeekStart, 6)),
      },
      lastWeek: {
        window: i18nText('Advisor.facts.windowLastWeek'),
        ...windowTotal(byDate, lastWeekStart, addDays(thisWeekStart, -1)),
      },
      periodTotalMinutes: insideDays.reduce((sum, day) => sum + day.minutes, 0),
      periodRecordedDays: insideDays.length,
      days: listed,
      ...(insideDays.length > listed.length ? { earlierDaysOmitted: insideDays.length - listed.length } : {}),
      ...(insideDays.length === 0 && latestRecordDate ? { latestRecordDate } : {}),
    },
  };
}

function projectEventGroup(
  index: HealthIndex,
  protocolId: 'dental-event' | 'medical-event',
  metricId: 'dental.event' | 'medical.event',
  period: AdvisorPeriod,
  describe: (payload: Record<string, unknown> | null, notes: string | undefined) => Record<string, unknown>,
): Projection {
  const events = index.events
    .filter((dated) => dated.event.protocolId === protocolId)
    .map((dated) => ({
      date: dated.date,
      ...describe(
        parseJsonObject(dated.values.find((value) => value.metricId === metricId)?.valueJson),
        clip(dated.event.notes, NOTE_CHARS),
      ),
    }));
  const latestRecordDate = latestDate(events.map((event) => event.date));
  if (!latestRecordDate) return emptyProjection();
  const inside = events.filter((event) => inPeriod(event.date, period));
  const listed = inside.slice(-LIST_CAP);
  const latestBefore = inside.length === 0 ? events.filter((event) => event.date < period.start).at(-1) : undefined;
  const includedDates = new Set(listed.map((event) => event.date));
  if (latestBefore) includedDates.add(latestBefore.date);
  return {
    status: 'ok',
    latestRecordDate,
    inPeriodCount: inside.length,
    includedDates,
    data: {
      recordsAllTime: events.length,
      inPeriod: listed,
      ...(inside.length > listed.length ? { earlierInPeriodOmitted: inside.length - listed.length } : {}),
      ...(latestBefore ? { latestBeforePeriod: latestBefore } : {}),
    },
  };
}

function projectFitness(index: HealthIndex, period: AdvisorPeriod): Projection {
  const includedDates = new Set<string>();
  const testIndex: HealthIndex = { events: index.events.filter((dated) => dated.event.protocolId !== 'fitness-sport-activity') };
  const { series, inPeriodCount } = metricSeries(testIndex, 'fitness', period, includedDates, { withNotes: false });
  const activities = index.events
    .filter((dated) => dated.event.protocolId === 'fitness-sport-activity' && inPeriod(dated.date, period))
    .map((dated) => {
      const valueOf = (metricId: string) => {
        const value = dated.values.find((item) => item.metricId === metricId);
        if (typeof value?.valueNumber === 'number') return value.valueNumber;
        return value?.valueText ? enumValueLabel(metricId, value.valueText) : undefined;
      };
      return {
        date: dated.date,
        category: valueOf('fitness.activity_category'),
        durationMinutes: valueOf('fitness.activity_duration'),
        distanceMeters: valueOf('fitness.activity_distance'),
        intensity: valueOf('fitness.activity_intensity'),
      };
    });
  for (const activity of activities.slice(-LIST_CAP)) includedDates.add(activity.date);
  const latestRecordDate = latestDate(index.events.filter((dated) => dated.event.groupId === 'fitness').map((dated) => dated.date));
  if (!latestRecordDate) return emptyProjection();
  return {
    status: 'ok',
    latestRecordDate,
    inPeriodCount: inPeriodCount + activities.length,
    includedDates,
    data: { tests: series, activitiesInPeriod: activities.slice(-LIST_CAP) },
  };
}

function projectDevelopment(index: HealthIndex, milestones: MilestoneRecordRow[], period: AdvisorPeriod): Projection {
  const includedDates = new Set<string>();
  const { series, inPeriodCount } = metricSeries(index, 'development', period, includedDates, { withNotes: false });
  const achieved = milestones
    .map((row) => ({ date: localDateOf(row.achievedAt), row }))
    .filter((entry): entry is { date: string; row: MilestoneRecordRow } => Boolean(entry.date) && (entry.date as string) <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, row }) => ({
      date,
      milestone: MILESTONE_CATALOG.find((item) => item.milestoneId === row.milestoneId)?.title ?? row.milestoneId,
    }));
  const achievedInPeriod = achieved.filter((entry) => inPeriod(entry.date, period));
  for (const entry of achievedInPeriod.slice(-LIST_CAP)) includedDates.add(entry.date);
  const latestAchieved = achieved.at(-1);
  if (achievedInPeriod.length === 0 && latestAchieved) includedDates.add(latestAchieved.date);
  const latestRecordDate = latestDate([
    ...index.events.filter((dated) => dated.event.groupId === 'development').map((dated) => dated.date),
    latestAchieved?.date ?? null,
  ]);
  if (!latestRecordDate) return emptyProjection();
  return {
    status: 'ok',
    latestRecordDate,
    inPeriodCount: inPeriodCount + achievedInPeriod.length,
    includedDates,
    data: {
      measurements: series,
      milestonesAchievedTotal: achieved.length,
      milestonesAchievedInPeriod: achievedInPeriod.slice(-LIST_CAP),
      ...(achievedInPeriod.length === 0 && latestAchieved ? { latestMilestoneAchieved: latestAchieved } : {}),
    },
  };
}

function projectVaccine(rows: VaccineRecordRow[], period: AdvisorPeriod): Projection {
  const records = rows
    .map((row) => ({ date: localDateOf(row.vaccinatedAt), vaccine: row.vaccineName }))
    .filter((entry): entry is { date: string; vaccine: string } => Boolean(entry.date) && (entry.date as string) <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = records.at(-1);
  if (!latest) return emptyProjection();
  const inside = records.filter((entry) => inPeriod(entry.date, period));
  const includedDates = new Set(inside.slice(-LIST_CAP).map((entry) => entry.date));
  includedDates.add(latest.date);
  return {
    status: 'ok',
    latestRecordDate: latest.date,
    inPeriodCount: inside.length,
    includedDates,
    data: { recordsAllTime: records.length, latest, inPeriod: inside.slice(-LIST_CAP) },
  };
}

const POSTURE_FIELDS = ['shoulder', 'scapula', 'hip', 'leg', 'heel', 'neck', 'pelvis', 'knee', 'adam'] as const;

function projectPosture(rows: PostureAssessmentRow[], period: AdvisorPeriod): Projection {
  const checks = rows
    .map((row) => ({ date: localDateOf(row.assessedAt), row }))
    .filter((entry): entry is { date: string; row: PostureAssessmentRow } => Boolean(entry.date) && (entry.date as string) <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, row }) => ({
      date,
      source: row.source ? i18nText(`PostureCapture.source.${row.source}`, { defaultValue: row.source }) : undefined,
      itemsRecorded: POSTURE_FIELDS
        .filter((field) => row[field] != null && row[field] !== '')
        .map((field) => i18nText(`PostureCapture.field.${field}`, { defaultValue: field })),
      ...(typeof row.cobbAngle === 'number' ? { cobbAngleDegrees: row.cobbAngle } : {}),
      ...(clip(row.notes, NOTE_CHARS) ? { notes: clip(row.notes, NOTE_CHARS) } : {}),
    }));
  const latest = checks.at(-1);
  if (!latest) return emptyProjection();
  const inside = checks.filter((entry) => inPeriod(entry.date, period));
  const includedDates = new Set(inside.slice(-LIST_CAP).map((entry) => entry.date));
  if (inside.length === 0) includedDates.add(latest.date);
  return {
    status: 'ok',
    latestRecordDate: latest.date,
    inPeriodCount: inside.length,
    includedDates,
    data: {
      selfChecksInPeriod: inside.slice(-LIST_CAP),
      ...(inside.length === 0 ? { latestBeforePeriod: latest } : {}),
    },
  };
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function projectJournal(rows: JournalEntryRow[], child: AdvisorChildContext, period: AdvisorPeriod): Projection {
  const entries = rows
    .filter((row) => row.childId === child.childId)
    .map((row) => ({ date: localDateOf(row.recordedAt), row }))
    .filter((entry): entry is { date: string; row: JournalEntryRow } => Boolean(entry.date) && (entry.date as string) <= period.end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.row.recordedAt.localeCompare(a.row.recordedAt));
  const latest = entries[0];
  if (!latest) return emptyProjection();
  const inside = entries.filter((entry) => inPeriod(entry.date, period));
  const listed = inside.slice(0, JOURNAL_ENTRY_CAP);
  const toEntry = ({ date, row }: { date: string; row: JournalEntryRow }) => {
    const dimension = OBSERVATION_DIMENSIONS.find((item) => item.dimensionId === row.dimensionId)?.displayName;
    const recorder = child.recorderProfiles?.find((profile) => profile.id === row.recorderId)?.name;
    const tags = parseTags(row.selectedTags);
    const text = clip(row.textContent, JOURNAL_TEXT_CHARS);
    return {
      date,
      kind: i18nText(`Advisor.facts.journalKind.${row.contentType}`, { defaultValue: row.contentType }),
      ...(dimension ? { dimension } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(recorder ? { recorder } : {}),
      ...(text ? { parentText: text } : {}),
    };
  };
  const includedDates = new Set(listed.map((entry) => entry.date));
  if (inside.length === 0) includedDates.add(latest.date);
  return {
    status: 'ok',
    latestRecordDate: latest.date,
    inPeriodCount: inside.length,
    includedDates,
    data: {
      entriesInPeriod: inside.length,
      entries: listed.map(toEntry),
      ...(inside.length > listed.length ? { olderEntriesInPeriodOmitted: inside.length - listed.length } : {}),
      ...(inside.length === 0 ? { latestBeforePeriod: toEntry(latest) } : {}),
    },
  };
}

/* ── assembly ─────────────────────────────────────────────── */

function failedProjection(): Projection {
  return { status: 'read-failed', latestRecordDate: null, inPeriodCount: 0, includedDates: new Set() };
}

/**
 * Pure projection of the read sources into model-facing facts. Evaluation
 * ratings and clinical thresholds never enter this shape.
 */
export function projectAdvisorFacts(input: {
  child: AdvisorChildContext;
  sources: AdvisorRawSources;
  groups: readonly AdvisorRecordGroupId[];
  period: AdvisorPeriod;
  today: string;
  requestedAt: string;
}): AdvisorFacts {
  const { child, sources, period, today } = input;
  let health: HealthIndex | null = null;
  let healthFailed = sources.health?.status === 'failed';
  if (sources.health?.status === 'ok') {
    try {
      health = buildHealthIndex(sources.health.rows, child.childId, today, input.requestedAt);
    } catch {
      healthFailed = true;
    }
  }

  const project = (group: AdvisorRecordGroupId): Projection => {
    if (HEALTH_BACKED_GROUPS.has(group) && (healthFailed || !health)) return failedProjection();
    switch (group) {
      case 'growth':
      case 'vision':
        return projectMeasuredGroup(health as HealthIndex, group, period);
      case 'sleep':
        return projectSleep(health as HealthIndex, period);
      case 'outdoor':
        return sources.outdoorGoal?.status === 'ok'
          ? projectOutdoor(health as HealthIndex, sources.outdoorGoal.rows, period, today)
          : failedProjection();
      case 'dental':
        return projectEventGroup(health as HealthIndex, 'dental-event', 'dental.event', period, (payload, notes) => {
          const eventType = stringField(payload, 'eventType');
          const severity = stringField(payload, 'severity');
          return {
            event: eventType ? dentalEventLabelAndEmoji(eventType).label : undefined,
            tooth: stringField(payload, 'toothId'),
            severity: severity ? DENTAL_SEVERITY_LABELS[severity] ?? severity : undefined,
            notes,
          };
        });
      case 'medical':
        return projectEventGroup(health as HealthIndex, 'medical-event', 'medical.event', period, (payload, notes) => {
          const eventType = stringField(payload, 'eventType');
          return {
            type: eventType ? MEDICAL_EVENT_TYPE_LABELS[eventType] ?? eventType : undefined,
            title: stringField(payload, 'title'),
            result: stringField(payload, 'result'),
            medicationRecorded: stringField(payload, 'medication'),
            notes,
          };
        });
      case 'fitness':
        return projectFitness(health as HealthIndex, period);
      case 'development':
        return sources.milestones?.status === 'ok'
          ? projectDevelopment(health as HealthIndex, sources.milestones.rows, period)
          : failedProjection();
      case 'vaccine':
        return sources.vaccines?.status === 'ok' ? projectVaccine(sources.vaccines.rows, period) : failedProjection();
      case 'posture':
        return sources.posture?.status === 'ok' ? projectPosture(sources.posture.rows, period) : failedProjection();
      case 'journal':
        return sources.journal?.status === 'ok' ? projectJournal(sources.journal.rows, child, period) : failedProjection();
      default:
        return failedProjection();
    }
  };

  const groups = ADVISOR_RECORD_GROUPS
    .filter((group) => input.groups.includes(group))
    .map((group): AdvisorGroupFacts => {
      const projection = project(group);
      return {
        group,
        label: advisorRecordGroupLabel(group),
        status: projection.status,
        latestRecordDate: projection.latestRecordDate,
        inPeriodCount: projection.inPeriodCount,
        includedDates: [...projection.includedDates].sort(),
        ...(projection.data ? { data: projection.data } : {}),
      };
    });

  return { requestedAt: input.requestedAt, today, period, groups, trimmed: [] };
}

export function advisorFactsReadFailures(facts: AdvisorFacts): AdvisorGroupFacts[] {
  return facts.groups.filter((group) => group.status === 'read-failed');
}

/* ── budget ───────────────────────────────────────────────── */

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

// Per-record lists that may lose their oldest rows; series containers such as
// `metrics` are never trimmed, only the rows inside them.
const TRIMMABLE_LISTS = new Set([
  'inPeriod',
  'nights',
  'days',
  'entries',
  'activitiesInPeriod',
  'milestonesAchievedInPeriod',
  'selfChecksInPeriod',
]);

function shrinkListsInData(data: Record<string, unknown>, keep: number): boolean {
  let changed = false;
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    if (TRIMMABLE_LISTS.has(key) && value.length > keep) {
      // Journal entries are newest-first; every other list is oldest-first.
      data[key] = key === 'entries' ? value.slice(0, keep) : value.slice(-keep);
      data[`${key}Trimmed`] = (typeof data[`${key}Trimmed`] === 'number' ? data[`${key}Trimmed`] as number : 0) + value.length - keep;
      changed = true;
      continue;
    }
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        changed = shrinkListsInData(item as Record<string, unknown>, keep) || changed;
      }
    }
  }
  return changed;
}

/**
 * Shrinks listed detail (never groups, counts, totals, or statistics) until
 * the model-facing facts fit. Every trimmed list keeps a count of what was
 * left out so the answer can state the boundary.
 */
export function fitAdvisorFactsToBudget(facts: AdvisorFacts, maxBytes: number): AdvisorFacts {
  if (byteLength(modelFacingFacts(facts)) <= maxBytes) return facts;
  const groups = facts.groups.map((group) => ({ ...group, ...(group.data ? { data: structuredClone(group.data) } : {}) }));
  const trimmed: string[] = [...facts.trimmed];
  for (const keep of [12, 6, 3]) {
    let changed = false;
    for (const group of groups) {
      if (group.data && shrinkListsInData(group.data, keep)) {
        changed = true;
        if (!trimmed.includes(group.label)) trimmed.push(group.label);
      }
    }
    const next = { ...facts, groups, trimmed };
    if (changed && byteLength(modelFacingFacts(next)) <= maxBytes) return next;
  }
  return { ...facts, groups, trimmed };
}

/** Parent-facing name of the period, e.g. "最近 30 天（2026-09-01 至 2026-09-30）". */
export function advisorPeriodLabel(period: AdvisorPeriod): string {
  return i18nText(`Advisor.facts.period.${period.kind}`, {
    start: period.start,
    end: period.end,
    days: daysInclusive(period.start, period.end),
  });
}

function periodNote(group: AdvisorGroupFacts, periodLabel: string): string | undefined {
  if (group.status === 'read-failed') return undefined;
  if (group.status === 'empty') return i18nText('Advisor.facts.noteNoRecords');
  if (group.inPeriodCount === 0) {
    return group.latestRecordDate
      ? i18nText('Advisor.facts.noteNoneInPeriod', { period: periodLabel, date: group.latestRecordDate })
      : i18nText('Advisor.facts.noteNoRecords');
  }
  return i18nText('Advisor.facts.noteInPeriod', { period: periodLabel, count: group.inPeriodCount });
}

/**
 * The JSON handed to the model: statuses, periods, and projected data only.
 * Categories with rows in the period come first, and each carries a worded
 * note so older rows are never read as recent.
 */
export interface AdvisorFactsViewOptions {
  /** full: every projected row; compact: statuses plus the few rows no summary line carries. */
  readonly view?: 'full' | 'compact';
  /** Omit the digest when the same lines already reach the model another way. */
  readonly digest?: boolean;
}

// In the compact view only these small, summary-resistant parts stay.
const COMPACT_KEYS: Partial<Record<AdvisorRecordGroupId, readonly string[]>> = {
  outdoor: ['weeklyGoal', 'thisWeekSoFar', 'lastWeek'],
  journal: ['entries'],
};

function compactData(group: AdvisorGroupFacts): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of COMPACT_KEYS[group.group] ?? []) {
    const value = group.data?.[key];
    if (value === undefined) continue;
    out[key] = key === 'entries' && Array.isArray(value) ? value.slice(0, 3) : value;
  }
  return out;
}

export function modelFacingFacts(facts: AdvisorFacts, options: AdvisorFactsViewOptions = {}) {
  const periodLabel = advisorPeriodLabel(facts.period);
  const ordered = [...facts.groups].sort((left, right) => Number(right.inPeriodCount > 0) - Number(left.inPeriodCount > 0));
  const summaries = new Map(summarizeAdvisorFacts(facts).map((entry) => [entry.group, entry.lines]));
  const compact = options.view === 'compact';
  return {
    today: facts.today,
    period: { label: periodLabel, start: facts.period.start, end: facts.period.end },
    // Code-computed one-line state per category, in answer order; the rows
    // below carry the detail behind each line.
    ...(options.digest === false ? {} : {
      digest: ordered
        .filter((group) => summaries.has(group.group))
        .map((group) => ({ category: group.label, summary: (summaries.get(group.group) ?? []).join(i18nText('Advisor.facts.partSeparator')) })),
    }),
    records: ordered.map((group) => ({
      category: group.label,
      status: group.status === 'empty' ? 'no-records' : group.status,
      periodNote: periodNote(group, periodLabel),
      recordsInPeriod: group.inPeriodCount,
      latestRecordDate: group.latestRecordDate,
      ...(compact ? compactData(group) : group.data ?? {}),
    })),
    ...(facts.trimmed.length > 0 && !compact ? { detailTrimmedFor: facts.trimmed } : {}),
  };
}

/* ── display ──────────────────────────────────────────────── */

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return i18nText('Advisor.facts.minutes', { minutes: rest });
  return rest === 0
    ? i18nText('Advisor.facts.hours', { hours })
    : i18nText('Advisor.facts.hoursMinutes', { hours, minutes: rest });
}

function pointText(metric: Record<string, unknown>, point: unknown): string | null {
  const record = point && typeof point === 'object' ? point as Record<string, unknown> : null;
  if (!record) return null;
  const unit = typeof metric.unit === 'string' && metric.unit ? ` ${metric.unit}` : '';
  return i18nText('Advisor.facts.valueOnDate', {
    metric: String(metric.metric),
    value: `${String(record.value)}${unit}`,
    date: String(record.date),
  });
}

function seriesLines(series: unknown): string[] {
  if (!Array.isArray(series)) return [];
  return series.flatMap((metric: Record<string, unknown>) => {
    const inside = Array.isArray(metric.inPeriod) ? metric.inPeriod : [];
    const point = (inside.at(-1) ?? metric.latestBeforePeriod) as Record<string, unknown> | undefined;
    const change = metric.latestChange as { from?: Record<string, unknown>; to?: Record<string, unknown> } | undefined;
    if (point && change?.from && change.to?.date === point.date) {
      const unit = typeof metric.unit === 'string' && metric.unit ? ` ${metric.unit}` : '';
      return [i18nText('Advisor.facts.valueWithPrevious', {
        metric: String(metric.metric),
        value: `${String(point.value)}${unit}`,
        date: String(point.date),
        previousValue: `${String(change.from.value)}${unit}`,
        previousDate: String(change.from.date),
      })];
    }
    const text = pointText(metric, point);
    return text ? [text] : [];
  });
}

/**
 * Deterministic, parent-readable summary of the facts that were read. Used by
 * failure states, which may list verified facts but never fabricate an answer.
 */
export function summarizeAdvisorFacts(facts: AdvisorFacts): Array<{ group: AdvisorRecordGroupId; label: string; lines: string[] }> {
  return facts.groups
    .filter((group) => group.status !== 'read-failed')
    .map((group) => {
      if (group.status === 'empty' || !group.data) {
        return { group: group.group, label: group.label, lines: [i18nText('Advisor.facts.noRecords')] };
      }
      const data = group.data;
      const lines: string[] = [];
      switch (group.group) {
        case 'growth':
        case 'vision':
          lines.push(...seriesLines(data.metrics));
          break;
        case 'development':
          lines.push(...seriesLines(data.measurements));
          if (typeof data.milestonesAchievedTotal === 'number' && data.milestonesAchievedTotal > 0) {
            lines.push(i18nText('Advisor.facts.milestonesTotal', { count: data.milestonesAchievedTotal }));
          }
          break;
        case 'fitness':
          lines.push(...seriesLines(data.tests));
          break;
        case 'sleep':
          if (typeof data.recordedNights === 'number' && data.recordedNights > 0) {
            lines.push(i18nText('Advisor.facts.sleepSummary', {
              start: facts.period.start,
              end: facts.period.end,
              nights: data.recordedNights,
              night: typeof data.averageNightMinutes === 'number' ? formatDuration(data.averageNightMinutes) : '—',
            }));
          }
          break;
        case 'outdoor': {
          const week = data.thisWeekSoFar as { start: string; totalMinutes: number | null } | undefined;
          const goal = data.weeklyGoal as { minutes: number; setBy: string } | undefined;
          if (week && goal) {
            lines.push(i18nText(week.totalMinutes == null ? 'Advisor.facts.outdoorSummaryNone' : 'Advisor.facts.outdoorSummary', {
              start: week.start,
              total: week.totalMinutes,
              goal: goal.minutes,
              setBy: goal.setBy,
            }));
          }
          break;
        }
        case 'vaccine': {
          const latest = data.latest as { date: string; vaccine: string } | undefined;
          if (latest) {
            lines.push(i18nText('Advisor.facts.vaccineSummary', { count: data.recordsAllTime, vaccine: latest.vaccine, date: latest.date }));
          }
          break;
        }
        case 'journal':
          if (typeof data.entriesInPeriod === 'number' && data.entriesInPeriod > 0) {
            lines.push(i18nText('Advisor.facts.journalSummary', { start: facts.period.start, end: facts.period.end, count: data.entriesInPeriod }));
          }
          break;
        case 'dental':
        case 'medical': {
          const listed = Array.isArray(data.inPeriod) ? data.inPeriod as Array<Record<string, unknown>> : [];
          const latest = listed.at(-1) ?? (data.latestBeforePeriod as Record<string, unknown> | undefined);
          const label = latest ? latest.event ?? latest.title ?? latest.type : undefined;
          if (latest && typeof label === 'string') {
            lines.push(i18nText('Advisor.facts.eventOnDate', { event: label, date: String(latest.date) }));
          }
          break;
        }
        default:
          break;
      }
      if (group.inPeriodCount === 0 && group.latestRecordDate) {
        lines.push(i18nText('Advisor.facts.noneInPeriod', { date: group.latestRecordDate }));
      } else if (lines.length === 0 && group.latestRecordDate) {
        lines.push(i18nText('Advisor.facts.latestRecord', { date: group.latestRecordDate }));
      }
      return { group: group.group, label: group.label, lines };
    });
}

/**
 * Short provenance line for answers built on local facts: which record
 * categories and which dates (or date span) were handed to the model.
 */
export function describeAdvisorFactSources(facts: AdvisorFacts): string | null {
  const parts = facts.groups
    .filter((group) => group.status === 'ok' && group.includedDates.length > 0)
    .map((group) => {
      const dates = group.includedDates;
      const span = dates.length <= 3
        ? dates.join(i18nText('Advisor.facts.dateSeparator'))
        : i18nText('Advisor.facts.dateSpan', { start: dates[0], end: dates[dates.length - 1] });
      return i18nText('Advisor.facts.sourcePart', { label: group.label, span });
    });
  return parts.length > 0 ? parts.join(i18nText('Advisor.facts.partSeparator')) : null;
}
