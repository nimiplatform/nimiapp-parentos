import type { ChildProfile, NurtureMode } from '../../app-shell/app-store.js';
import type { ReminderAgenda } from '../../engine/reminder-engine.js';
import { MILESTONE_CATALOG, OBSERVATION_DIMENSIONS, REMINDER_RULES } from '../../knowledge-base/index.js';
import type { ReminderPriority, ReminderRule } from '../../knowledge-base/index.js';
import { getKeepsakeReasonLabel } from '../journal/journal-page-helpers.js';
import type { MeasurementRow } from '../../bridge/sqlite-bridge.js';
import type {
  DashData,
  DataGapAlertItem,
  DimensionDistributionItem,
  GrowthSnapshotMetric,
  GrowthTrendItem,
  MilestoneTimelineItem,
  MilestoneTimelineSummary,
  ObservationDistributionSummary,
  RecentChangeItem,
  RecentLineItem,
  SleepTrendPoint,
  SleepTrendSummary,
  StageInsightItem,
  StageInsightSummary,
  TimelineHomeViewModel,
  VisionSnapshotSummary,
} from './timeline-data-types.js';
import { C } from './timeline-data-types.js';
import { i18nText } from '../../i18n/index.js';


const DAY_MS = 24 * 60 * 60 * 1000;
const milestoneById = new Map(MILESTONE_CATALOG.map((item) => [item.milestoneId, item]));
const MEASUREMENT_META: Record<
  string,
  { label: string; unit: string; domain: RecentChangeItem['domain']; to: string; icon: string }
> = {
  height: { label: i18nText('Profile.metrics.growth.height'), unit: i18nText('Common.unit.centimeter'), domain: 'growth', to: '/profile', icon: '📏' },
  weight: { label: i18nText('Profile.metrics.growth.weight'), unit: i18nText('Common.unit.kilogram'), domain: 'growth', to: '/profile', icon: '⚖️' },
  'head-circumference': { label: i18nText('Profile.metrics.growth.headCircumference'), unit: i18nText('Common.unit.centimeter'), domain: 'growth', to: '/profile', icon: '🍼' },
  bmi: { label: 'BMI', unit: '', domain: 'growth', to: '/profile', icon: '📈' },
  'vision-left': { label: i18nText('Profile.metrics.vision.leftVisualAcuity'), unit: '', domain: 'vision', to: '/profile', icon: '👀' },
  'vision-right': { label: i18nText('Profile.metrics.vision.rightVisualAcuity'), unit: '', domain: 'vision', to: '/profile', icon: '👀' },
  'bone-age': { label: i18nText('Profile.metrics.development.boneAgeYears'), unit: i18nText('Common.unit.year'), domain: 'bone-age', to: '/profile', icon: '🦴' },
};

interface QuickLink {
  id: string;
  to: string;
  label: string;
  emoji: string;
  ageGate?: (ageMonths: number) => boolean;
}

const QLINKS_REGISTRY: QuickLink[] = [
  { id: 'growth', to: '/profile', label: i18nText('Timeline.quickLink.growth'), emoji: '📏' },
  { id: 'vaccines', to: '/profile', label: i18nText('Timeline.quickLink.vaccines'), emoji: '💉', ageGate: (age) => age <= 84 },
  { id: 'sleep', to: '/profile', label: i18nText('Timeline.quickLink.sleep'), emoji: '😴' },
  { id: 'journal', to: '/journal', label: i18nText('Timeline.quickLink.journal'), emoji: '📝' },
  { id: 'reports', to: '/reports', label: i18nText('Timeline.quickLink.reports'), emoji: '📄' },
  { id: 'medical', to: '/profile', label: i18nText('Timeline.quickLink.medical'), emoji: '🏥' },
  { id: 'milestones', to: '/profile', label: i18nText('Timeline.quickLink.milestones'), emoji: '🎯', ageGate: (age) => age <= 72 },
  { id: 'outdoor', to: '/profile', label: i18nText('Timeline.quickLink.outdoor'), emoji: '🌳', ageGate: (age) => age >= 6 },
  { id: 'vision', to: '/profile', label: i18nText('Timeline.quickLink.vision'), emoji: '👁️', ageGate: (age) => age >= 36 },
  { id: 'dental', to: '/profile', label: i18nText('Timeline.quickLink.dental'), emoji: '🦷', ageGate: (age) => age >= 6 },
  { id: 'fitness', to: '/profile', label: i18nText('Timeline.quickLink.fitness'), emoji: '🏃', ageGate: (age) => age >= 36 },
  { id: 'tanner', to: '/profile', label: i18nText('Timeline.quickLink.tanner'), emoji: '🌱', ageGate: (age) => age >= 84 },
  { id: 'posture', to: '/profile', label: i18nText('Timeline.quickLink.posture'), emoji: '🧍', ageGate: (age) => age >= 60 },
];

const QLINKS_TIERS: Array<{ maxAge: number; topIds: string[] }> = [
  { maxAge: 12, topIds: ['growth', 'vaccines', 'sleep', 'milestones', 'medical', 'journal'] },
  { maxAge: 36, topIds: ['growth', 'vaccines', 'sleep', 'milestones', 'dental', 'journal'] },
  { maxAge: 72, topIds: ['growth', 'vision', 'outdoor', 'sleep', 'milestones', 'journal'] },
  { maxAge: 144, topIds: ['growth', 'vision', 'outdoor', 'fitness', 'dental', 'journal'] },
  { maxAge: Infinity, topIds: ['growth', 'vision', 'outdoor', 'fitness', 'tanner', 'journal'] },
];

const registryById = new Map(QLINKS_REGISTRY.map((link) => [link.id, link]));

export function pctComplete(child: ChildProfile): number {
  const fields = [
    child.birthWeightKg,
    child.birthHeightCm,
    child.birthHeadCircCm,
    child.avatarPath,
    child.allergies,
    child.medicalNotes,
    child.recorderProfiles,
  ];
  return Math.round((fields.filter((value) => value != null).length / fields.length) * 100);
}

export function latestByType(measurements: MeasurementRow[]) {
  const latest = new Map<string, MeasurementRow>();
  for (const measurement of measurements) {
    const existing = latest.get(measurement.typeId);
    if (!existing || measurement.measuredAt > existing.measuredAt) {
      latest.set(measurement.typeId, measurement);
    }
  }
  return latest;
}

export function buildSleepTrend(sleepRecords: DashData['sleepRecords']): SleepTrendSummary {
  const sorted = [...sleepRecords].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
  const points: SleepTrendPoint[] = sorted
    .filter((record) => record.durationMinutes != null && record.durationMinutes > 0)
    .map((record) => ({
      date: record.sleepDate,
      durationMinutes: record.durationMinutes!,
      bedtime: record.bedtime,
      wakeTime: record.wakeTime,
    }));
  const totalDuration = points.reduce((sum, point) => sum + point.durationMinutes, 0);
  const avgDurationMinutes = points.length > 0 ? Math.round(totalDuration / points.length) : null;
  const latest = sorted[sorted.length - 1] ?? null;

  return {
    points,
    avgDurationMinutes,
    latestBedtime: latest?.bedtime ?? null,
    latestWakeTime: latest?.wakeTime ?? null,
    totalRecords: sorted.length,
  };
}

export function buildMilestoneTimeline(
  milestoneRecords: DashData['milestoneRecords'],
  ageMonths: number,
): MilestoneTimelineSummary {
  const achievedIds = new Set(milestoneRecords.filter((record) => record.achievedAt).map((record) => record.milestoneId));
  const recentlyAchieved: MilestoneTimelineItem[] = milestoneRecords
    .filter((record) => record.achievedAt && isWithinDays(record.achievedAt, 60))
    .sort((left, right) => (right.achievedAt ?? '').localeCompare(left.achievedAt ?? ''))
    .slice(0, 3)
    .map((record) => {
      const catalogEntry = milestoneById.get(record.milestoneId);
      return {
        milestoneId: record.milestoneId,
        title: catalogEntry?.title ?? record.milestoneId,
        domain: catalogEntry?.domain ?? 'unknown',
        achievedAt: record.achievedAt!,
        typicalAgeLabel: catalogEntry ? formatAgeLabel(catalogEntry.typicalAge.medianMonths) : '',
      };
    });
  const upcoming: MilestoneTimelineItem[] = MILESTONE_CATALOG
    .filter((milestone) => !achievedIds.has(milestone.milestoneId)
      && milestone.typicalAge.rangeStart <= ageMonths + 6
      && milestone.typicalAge.rangeEnd >= ageMonths)
    .sort((left, right) => left.typicalAge.medianMonths - right.typicalAge.medianMonths)
    .slice(0, 3)
    .map((milestone) => ({
      milestoneId: milestone.milestoneId,
      title: milestone.title,
      domain: milestone.domain,
      typicalAgeLabel: formatAgeLabel(milestone.typicalAge.medianMonths),
    }));

  return { recentlyAchieved, upcoming };
}

export function buildObservationDistribution(journalEntries: DashData['journalEntries']): ObservationDistributionSummary {
  const cutoff = Date.now() - 30 * DAY_MS;
  const counts = new Map<string, number>();
  let totalEntries = 0;
  for (const entry of journalEntries) {
    if (!entry.dimensionId || new Date(entry.recordedAt).getTime() < cutoff) continue;
    counts.set(entry.dimensionId, (counts.get(entry.dimensionId) ?? 0) + 1);
    totalEntries += 1;
  }
  const dimById = new Map(OBSERVATION_DIMENSIONS.map((dimension) => [dimension.dimensionId, dimension]));
  const items: DimensionDistributionItem[] = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([dimensionId, count]) => ({
      dimensionId,
      displayName: dimById.get(dimensionId)?.displayName ?? dimensionId,
      count,
      ratio: totalEntries > 0 ? count / totalEntries : 0,
    }));

  return { items, totalEntries };
}

export function fmtRel(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS);
  if (days <= 0) return i18nText('Common.relative.today');
  if (days === 1) return i18nText('Common.relative.yesterday');
  if (days < 7) return i18nText('Common.relative.daysAgoCompact', { days });
  const date = new Date(value);
  return i18nText('Timeline.relativeDateFallback', { month: date.getMonth() + 1, day: date.getDate() });
}

export function formatAgeLabel(ageMonths: number) {
  if (ageMonths < 12) return i18nText('Common.age.months', { months: ageMonths });
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  return months > 0
    ? i18nText('Common.age.yearsMonths', { years, months })
    : i18nText('Common.age.years', { years });
}

export function describeNurtureMode(mode: NurtureMode) {
  switch (mode) {
    case 'relaxed':
      return i18nText('Timeline.nurtureMode.relaxed');
    case 'advanced':
      return i18nText('Timeline.nurtureMode.advanced');
    default:
      return i18nText('Timeline.nurtureMode.balanced');
  }
}

function isWithinDays(value: string, days: number) {
  return Date.now() - new Date(value).getTime() <= days * DAY_MS;
}

function toNumber(value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDelta(delta: number, unit: string) {
  const rounded = Math.round(delta * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded}${unit ? ` ${unit}` : ''}`;
}

function formatMetricValue(measurement: MeasurementRow, unit: string) {
  return `${measurement.value}${unit ? ` ${unit}` : ''}`;
}

function sortByTimestamp<T extends { timestamp: string }>(items: T[]) {
  return [...items].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function buildMeasurementChanges(measurements: DashData['measurements']): RecentChangeItem[] {
  const interesting = measurements
    .filter((measurement) => measurement.typeId in MEASUREMENT_META)
    .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt));
  const grouped = new Map<string, MeasurementRow[]>();
  for (const measurement of interesting) {
    const list = grouped.get(measurement.typeId) ?? [];
    list.push(measurement);
    grouped.set(measurement.typeId, list);
  }

  const changes: RecentChangeItem[] = [];
  for (const [typeId, records] of grouped.entries()) {
    const latest = records[0];
    if (!latest || !isWithinDays(latest.measuredAt, 7)) continue;
    const meta = MEASUREMENT_META[typeId];
    if (!meta) continue;
    const previous = records.find((record) => record.measurementId !== latest.measurementId);
    const currentValue = formatMetricValue(latest, meta.unit);
    let detail = `${currentValue} · ${fmtRel(latest.measuredAt)}`;
    if (previous) {
      const latestValue = toNumber(latest.value);
      const previousValue = toNumber(previous.value);
      if (latestValue != null && previousValue != null) {
        detail = i18nText('Timeline.recent.updatedComparedToPrevious', {
          value: currentValue,
          delta: formatDelta(latestValue - previousValue, meta.unit),
          time: fmtRel(latest.measuredAt),
        });
      }
    }
    const iconName: RecentChangeItem['iconName'] = meta.domain === 'vision'
      ? 'eye'
      : meta.domain === 'bone-age'
        ? 'bone'
        : 'ruler';
    changes.push({
      id: `measurement:${latest.measurementId}`,
      domain: meta.domain,
      label: meta.domain === 'growth' ? i18nText('Timeline.domain.growth') : meta.label,
      title: i18nText('Timeline.recent.metricUpdated', { metric: meta.label }),
      detail,
      metric: null,
      subtitle: fmtRel(latest.measuredAt),
      summary: null,
      timestamp: latest.measuredAt,
      to: meta.to,
      icon: meta.icon,
      iconName,
    });
  }

  return sortByTimestamp(changes);
}

function sleepDurationLabel(record: DashData['sleepRecords'][number]) {
  if (record.durationMinutes != null && record.durationMinutes > 0) {
    const hours = Math.floor(record.durationMinutes / 60);
    const minutes = record.durationMinutes % 60;
    if (minutes === 0) return i18nText('Timeline.sleep.durationHours', { hours });
    return i18nText('Timeline.sleep.durationHoursMinutes', { hours, minutes });
  }
  return i18nText('Timeline.sleep.recordedDuration');
}

function heroSleepDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return i18nText('Common.duration.shortHours', { hours: h });
  return i18nText('Common.duration.shortHoursMinutes', { hours: h, minutes: m });
}

/** Age-banded nighttime sleep floors (minutes). Based on NSF / AAP guidance. */
function sleepThresholdsByAge(ageMonths: number | null | undefined): { enough: number; stable: number } {
  const age = ageMonths ?? 0;
  if (age < 72) return { enough: 600, stable: 540 };  // <6y: 10h / 9h
  if (age < 156) return { enough: 540, stable: 480 }; // 6-13y: 9h / 8h
  return { enough: 480, stable: 420 };                // 13y+: 8h / 7h
}

function sleepHeadline(minutes: number | null | undefined, ageMonths: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return i18nText('Timeline.sleep.headline');
  const { enough, stable } = sleepThresholdsByAge(ageMonths);
  if (minutes >= enough) return i18nText('Timeline.sleep.headlineEnough');
  if (minutes >= stable) return i18nText('Timeline.sleep.headlineStable');
  return i18nText('Timeline.sleep.headlineShort');
}

function buildSleepRecordChanges(sleepRecords: DashData['sleepRecords']): RecentChangeItem[] {
  return sortByTimestamp(
    sleepRecords
      .filter((record) => isWithinDays(record.sleepDate, 7))
      .map((record) => {
        const parts = [record.bedtime, record.wakeTime].filter(Boolean);
        const timeLabel = parts.length === 2 ? `${parts[0]} - ${parts[1]}` : i18nText('Timeline.sleep.scheduleTime');
        const durationMinutes = record.durationMinutes ?? null;
        const metric = durationMinutes && durationMinutes > 0
          ? { value: heroSleepDuration(durationMinutes) }
          : null;
        return {
          id: `sleep:${record.recordId}`,
          domain: 'sleep' as const,
          label: i18nText('Timeline.domain.sleep'),
          title: sleepHeadline(durationMinutes, record.ageMonths),
          detail: `${timeLabel} · ${sleepDurationLabel(record)}`,
          metric,
          subtitle: timeLabel,
          summary: null,
          timestamp: `${record.sleepDate}T00:00:00.000Z`,
          to: '/profile',
          icon: '😴',
          iconName: 'moon' as const,
        };
      }),
  );
}

function journalHeadline(entry: DashData['journalEntries'][number]): string {
  const isKeepsake = entry.keepsake === 1;
  if (isKeepsake) {
    const trimmed = entry.keepsakeTitle?.trim();
    if (trimmed) return trimmed;
    const reason = getKeepsakeReasonLabel(entry.keepsakeReason);
    return reason
      ? i18nText('Timeline.journal.keepsakeMomentWithReason', { reason })
      : i18nText('Timeline.journal.newKeepsakeMoment');
  }
  return entry.contentType === 'voice'
    ? i18nText('Timeline.journal.latestVoiceObservation')
    : i18nText('Timeline.journal.latestObservation');
}

function buildJournalChanges(journalEntries: DashData['journalEntries']): RecentChangeItem[] {
  return sortByTimestamp(
    journalEntries
      .filter((entry) => isWithinDays(entry.recordedAt, 7))
      .map((entry) => {
        const isKeepsake = entry.keepsake === 1;
        const summary = entry.textContent?.trim() || '';
        const headline = journalHeadline(entry);
        const reasonLabel = getKeepsakeReasonLabel(entry.keepsakeReason);
        const relTime = fmtRel(entry.recordedAt);
        const iconName: RecentChangeItem['iconName'] = isKeepsake
          ? 'sparkle'
          : entry.contentType === 'voice'
            ? 'mic'
            : 'book';
        const detailPrefix = summary ? summary.slice(0, 56) : headline;
        const detailMeta = isKeepsake && reasonLabel
          ? i18nText('Timeline.journal.keepsakeMeta', { reason: reasonLabel, time: relTime })
          : relTime;
        return {
          id: `journal:${entry.entryId}`,
          domain: 'journal' as const,
          label: isKeepsake ? i18nText('Timeline.domain.keepsake') : i18nText('Timeline.domain.journal'),
          title: headline,
          detail: `${detailPrefix} · ${detailMeta}`,
          metric: null,
          subtitle: isKeepsake && reasonLabel ? i18nText('Timeline.journal.keepsakeSubtitle', { reason: reasonLabel, time: relTime }) : relTime,
          summary: summary || null,
          timestamp: entry.recordedAt,
          to: isKeepsake ? '/journal?filter=keepsake' : '/journal',
          icon: isKeepsake ? '✨' : entry.contentType === 'voice' ? '🎙️' : '📝',
          iconName,
        };
      }),
  );
}

export function buildRecentChanges(dash: DashData): RecentChangeItem[] {
  const milestoneChanges = sortByTimestamp(
    dash.milestoneRecords
      .filter((record) => Boolean(record.achievedAt) && isWithinDays(record.achievedAt!, 7))
      .map((record) => ({
        id: `milestone:${record.milestoneId}`,
        domain: 'milestone' as const,
        label: i18nText('Timeline.domain.milestone'),
        title: milestoneById.get(record.milestoneId)?.title ?? i18nText('Timeline.milestone.newMilestone'),
        detail: i18nText('Timeline.recent.recorded', { time: fmtRel(record.achievedAt!) }),
        metric: null,
        subtitle: fmtRel(record.achievedAt!),
        summary: null,
        timestamp: record.achievedAt!,
        to: '/profile',
        icon: '🏆',
        iconName: 'trophy' as const,
      })),
  );
  const vaccineChanges = sortByTimestamp(
    dash.vaccineRecords
      .filter((record) => isWithinDays(record.vaccinatedAt, 7))
      .map((record) => ({
        id: `vaccine:${record.recordId}`,
        domain: 'vaccine' as const,
        label: i18nText('Timeline.domain.vaccine'),
        title: record.vaccineName,
        detail: i18nText('Timeline.recent.vaccineRecorded', { time: fmtRel(record.vaccinatedAt) }),
        metric: null,
        subtitle: fmtRel(record.vaccinatedAt),
        summary: null,
        timestamp: record.vaccinatedAt,
        to: '/profile',
        icon: '💉',
        iconName: 'syringe' as const,
      })),
  );
  const groupedCandidates = [
    milestoneChanges,
    vaccineChanges,
    buildMeasurementChanges(dash.measurements),
    buildSleepRecordChanges(dash.sleepRecords),
    buildJournalChanges(dash.journalEntries),
  ];
  const picked: RecentChangeItem[] = [];
  const seenDomains = new Set<RecentChangeItem['domain']>();
  for (const group of groupedCandidates) {
    for (const item of group) {
      if (picked.length >= 3) break;
      if (seenDomains.has(item.domain)) continue;
      seenDomains.add(item.domain);
      picked.push(item);
    }
    if (picked.length >= 3) break;
  }
  return picked;
}

function hasVisibleGrowthReminder(agenda: ReminderAgenda) {
  const visible = [...agenda.todayFocus, ...agenda.upcoming, ...agenda.overdueSummary.items];
  return visible.some((reminder) => ['growth', 'checkup', 'nutrition'].includes(reminder.rule.domain));
}

export function buildDataGapAlert(
  dash: DashData,
  ageMonths: number,
  agenda: ReminderAgenda,
): DataGapAlertItem | null {
  if (hasVisibleGrowthReminder(agenda)) return null;
  const latestMeasurements = latestByType(dash.measurements);
  const height = latestMeasurements.get('height') ?? null;
  const weight = latestMeasurements.get('weight') ?? null;
  if (!height && !weight && ageMonths > 3) {
    return {
      id: 'growth_missing_baseline',
      title: i18nText('Timeline.dataGap.missingBaselineTitle'),
      detail: i18nText('Timeline.dataGap.missingBaselineDetail'),
      to: '/profile',
    };
  }
  const staleParts = [height, weight]
    .filter((record): record is MeasurementRow => record !== null)
    .map((record) => {
      const meta = MEASUREMENT_META[record.typeId];
      if (!meta) return null;
      const staleDays = Math.floor((Date.now() - new Date(record.measuredAt).getTime()) / DAY_MS);
      return staleDays > 90 ? i18nText('Timeline.dataGap.stalePart', { metric: meta.label, days: staleDays }) : null;
    })
    .filter((value): value is string => Boolean(value));
  if (staleParts.length === 0) return null;

  return {
    id: 'growth_freshness_gap',
    title: i18nText('Timeline.dataGap.staleTitle'),
    detail: i18nText('Timeline.dataGap.staleDetail', { parts: staleParts.join(i18nText('Common.list.separator')) }),
    to: '/profile',
  };
}

function buildGrowthSnapshot(measurements: DashData['measurements']): TimelineHomeViewModel['growthSnapshot'] {
  const latestMeasurements = latestByType(measurements);
  const metrics: GrowthSnapshotMetric[] = ['height', 'weight', 'head-circumference', 'bmi']
    .map((typeId) => {
      const measurement = latestMeasurements.get(typeId);
      const meta = MEASUREMENT_META[typeId];
      if (!measurement || !meta) return null;
      return { id: typeId, label: meta.label, value: `${measurement.value}`, unit: meta.unit };
    })
    .filter((item): item is GrowthSnapshotMetric => item !== null)
    .slice(0, 4);
  const trends: GrowthTrendItem[] = ['height', 'weight']
    .map((typeId) => {
      const meta = MEASUREMENT_META[typeId];
      if (!meta) return null;
      const records = measurements.filter((measurement) => measurement.typeId === typeId).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
      const recent = records.slice(-8);
      if (recent.length === 0) return null;
      const latest = recent[recent.length - 1]!;
      const latestVal = typeof latest.value === 'number' ? latest.value : Number(latest.value);
      let delta: number | null = null;
      let deltaPercent: number | null = null;
      if (recent.length >= 2) {
        const prev = recent[recent.length - 2]!;
        const prevVal = typeof prev.value === 'number' ? prev.value : Number(prev.value);
        if (Number.isFinite(latestVal) && Number.isFinite(prevVal)) {
          delta = Math.round((latestVal - prevVal) * 10) / 10;
          deltaPercent = prevVal !== 0 ? Math.round(((latestVal - prevVal) / prevVal) * 1000) / 10 : null;
        }
      }
      return {
        id: typeId,
        label: meta.label,
        latestValue: `${latest.value}`,
        unit: meta.unit,
        points: recent.map((measurement) => ({
          date: measurement.measuredAt.slice(0, 10),
          value: typeof measurement.value === 'number' ? measurement.value : Number(measurement.value),
        })),
        delta,
        deltaPercent,
      };
    })
    .filter((item): item is GrowthTrendItem => item !== null);
  const latestGrowthRecord = [...latestMeasurements.values()]
    .filter((measurement) => ['height', 'weight', 'head-circumference', 'bmi'].includes(measurement.typeId))
    .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))[0] ?? null;

  return {
    updatedAt: latestGrowthRecord?.measuredAt ?? null,
    updatedLabel: latestGrowthRecord
      ? i18nText('Timeline.growthSnapshot.updated', { time: fmtRel(latestGrowthRecord.measuredAt) })
      : i18nText('Timeline.growthSnapshot.empty'),
    metrics,
    trends,
  };
}

function buildVisionSnapshot(measurements: DashData['measurements']): VisionSnapshotSummary {
  const latest = latestByType(measurements);
  const left = latest.get('vision-left');
  const right = latest.get('vision-right');
  const latestRecord = [left, right]
    .filter((record): record is MeasurementRow => record != null)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] ?? null;

  return {
    leftEye: left ? `${left.value}` : null,
    rightEye: right ? `${right.value}` : null,
    measuredAt: latestRecord?.measuredAt ?? null,
    measuredLabel: latestRecord
      ? i18nText('Timeline.visionSnapshot.checked', { time: fmtRel(latestRecord.measuredAt) })
      : i18nText('Timeline.visionSnapshot.empty'),
  };
}

function buildRecentLines(journalEntries: DashData['journalEntries']): RecentLineItem[] {
  return [...journalEntries]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 4)
    .map((entry) => {
      const reasonLabel = getKeepsakeReasonLabel(entry.keepsakeReason);
      const isKeepsake = entry.keepsake === 1;
      return {
        id: entry.entryId,
        title: entry.keepsakeTitle?.trim() || entry.textContent?.slice(0, 56) || (entry.contentType === 'voice' ? i18nText('Timeline.journal.voiceRecord') : i18nText('Timeline.journal.observationRecord')),
        detail: isKeepsake
          ? reasonLabel
            ? i18nText('Timeline.journal.keepsakeReason', { reason: reasonLabel })
            : i18nText('Timeline.journal.keepsakeReplayMoment')
          : fmtRel(entry.recordedAt),
        recordedAt: entry.recordedAt,
        to: isKeepsake ? '/journal?filter=keepsake' : '/journal',
        badge: isKeepsake ? i18nText('Timeline.journal.badgeKeepsake') : i18nText('Timeline.journal.badgeNote'),
        badgeTone: isKeepsake ? 'keepsake' : 'default',
        tag: reasonLabel,
      };
    });
}

export function isColdStart(d: DashData): boolean {
  return d.measurements.length === 0
    && d.sleepRecords.length === 0
    && d.vaccineRecords.length === 0
    && d.journalEntries.length === 0
    && d.outdoorRecords.length === 0
    && !d.milestoneRecords.some((record) => Boolean(record.achievedAt));
}

const STAGE_INSIGHT_PRIORITY_ORDER: Record<ReminderPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

// @nimi-authority: rule.parentos.time.r011
export function buildStageInsight(
  ageMonths: number,
  nurtureMode: NurtureMode,
  rules: readonly ReminderRule[] = REMINDER_RULES,
): StageInsightSummary | null {
  const eligible = rules
    .filter((rule) => rule.triggerAge.startMonths <= ageMonths
      && (rule.triggerAge.endMonths === -1 || rule.triggerAge.endMonths >= ageMonths)
      && (rule.category === 'rigid' || rule.category === 'stage')
      && rule.nurtureMode[nurtureMode] !== 'hidden')
    .sort((left, right) => STAGE_INSIGHT_PRIORITY_ORDER[left.priority] - STAGE_INSIGHT_PRIORITY_ORDER[right.priority]
      || left.triggerAge.startMonths - right.triggerAge.startMonths
      || left.ruleId.localeCompare(right.ruleId));
  const toItem = (rule: ReminderRule): StageInsightItem => ({
    ruleId: rule.ruleId,
    title: rule.title,
    description: rule.description,
    domain: rule.domain,
    priority: rule.priority,
  });
  const health = eligible.filter((rule) => rule.kind === 'task' || rule.kind === 'consult').map(toItem);
  const development = eligible.filter((rule) => rule.kind === 'guide' || rule.kind === 'practice').map(toItem);
  if (health.length === 0 && development.length === 0) return null;

  return { ageLabel: formatAgeLabel(ageMonths), health, development };
}

export function buildTimelineHomeViewModel(params: {
  child: ChildProfile;
  d: DashData;
  ageMonths: number;
  agenda: ReminderAgenda;
}): TimelineHomeViewModel {
  const coldStart = isColdStart(params.d);
  return {
    coldStart,
    stageInsight: coldStart ? buildStageInsight(params.ageMonths, params.child.nurtureMode) : null,
    recentChanges: buildRecentChanges(params.d),
    dataGapAlert: buildDataGapAlert(params.d, params.ageMonths, params.agenda),
    growthSnapshot: buildGrowthSnapshot(params.d.measurements),
    sleepTrend: buildSleepTrend(params.d.sleepRecords),
    visionSnapshot: buildVisionSnapshot(params.d.measurements),
    milestoneTimeline: buildMilestoneTimeline(params.d.milestoneRecords, params.ageMonths),
    observationDistribution: buildObservationDistribution(params.d.journalEntries),
    recentLines: buildRecentLines(params.d.journalEntries),
  };
}

export function buildQuickLinks(ageMonths: number): QuickLink[] {
  const visible = QLINKS_REGISTRY.filter((link) => !link.ageGate || link.ageGate(ageMonths));
  const tier = QLINKS_TIERS.find((item) => ageMonths <= item.maxAge)!;
  const ordered: QuickLink[] = [];
  const seen = new Set<string>();
  for (const id of tier.topIds) {
    const link = registryById.get(id);
    if (link && visible.includes(link)) {
      ordered.push(link);
      seen.add(id);
    }
  }
  for (const link of visible) {
    if (!seen.has(link.id) && ordered.length < 6) {
      ordered.push(link);
    }
  }
  return ordered.slice(0, 6);
}

export const DOMAIN_ROUTES: Record<string, string> = {
  milestone: '/profile',
  vaccine: '/profile',
  growth: '/profile',
  vision: '/profile',
  dental: '/profile',
  sleep: '/profile',
  'bone-age': '/profile',
  checkup: '/profile',
  nutrition: '/profile',
  posture: '/profile',
  fitness: '/profile',
  tanner: '/profile',
};

export function fmtDate() {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export { C };
