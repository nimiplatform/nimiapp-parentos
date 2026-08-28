import { computeAgeMonthsAt, formatAge, type ChildProfile } from '../../app-shell/app-store.js';
import type {
  JournalEntryRow,
  MeasurementRow,
  MilestoneRecordRow,
  ReminderStateRow,
  VaccineRecordRow,
} from '../../bridge/sqlite-bridge.js';
import { GROWTH_STANDARDS, MILESTONE_CATALOG, REMINDER_RULES } from '../../knowledge-base/index.js';
import { mapReminderStateRow, summarizeReminderProgression } from '../../engine/reminder-engine.js';
import { buildStructuredTrendSignals, type StructuredTrendSignal } from './trend-analysis.js';
import { i18nText, i18nTextForLanguage } from '../../i18n/index.js';


export type GrowthReportType = 'monthly' | 'quarterly' | 'quarterly-letter' | 'custom';

/**
 * Keywords that must never become the hero monthly keyword. Two families:
 *   1. Generic domain, state, and time nouns.
 *   2. Single discrete events that don't describe the child's monthly theme
 *      such as vaccinations or checkups. Events are facts about the calendar,
 *      not arcs of growth; they slip into the fallback path because the AI
 *      narrative often opens with the most recent event.
 *
 * Used by both the AI keyword validator (narrative-prompt.ts) and the
 * legacy-format hero derivation (reports-monthly-letter.tsx) so the two
 * code paths apply identical rules.
 */
function getPlaceholderKeywords(): ReadonlySet<string> {
  return new Set(
    [i18nTextForLanguage('en', 'Reports.placeholderKeywords'), i18nTextForLanguage('zh', 'Reports.placeholderKeywords')]
      .join('|')
      .split('|')
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  );
}

/**
 * Returns true when `keyword` should be rejected as low-signal. Callers
 * still need to apply per-report checks (e.g. matches child name) on top.
 */
export function isPlaceholderKeyword(keyword: string | null | undefined): boolean {
  if (!keyword) return true;
  const t = keyword.trim();
  if (!t || t.length > 8) return true;
  return getPlaceholderKeywords().has(t);
}

const GROWTH_REPORT_TYPES = ['monthly', 'quarterly', 'quarterly-letter', 'custom'] as const satisfies readonly GrowthReportType[];

export interface StructuredGrowthReportMetric {
  id: string;
  label: string;
  value: string;
  detail?: string;
}

export interface StructuredGrowthReportSection {
  id: string;
  title: string;
  items: string[];
}

export interface StructuredGrowthReportContent {
  version: 1;
  format: 'structured-local';
  reportType: GrowthReportType;
  title: string;
  subtitle: string;
  generatedAt: string;
  overview: string[];
  metrics: StructuredGrowthReportMetric[];
  trendSignals: StructuredTrendSignal[];
  sections: StructuredGrowthReportSection[];
  /** Top-priority open reminders with advisor links. Older v1 reports may not include this field. */
  actionItems?: ActionItem[];
  sources: string[];
  safetyNote: string;
}

/* ── Narrative report types (v2) ── */

export interface NarrativeSection {
  id: string;
  title: string;
  narrative: string;
  dataPoints?: Array<{ label: string; value: string; detail?: string }>;
}

export interface ActionItem {
  id: string;
  text: string;
  linkTo?: string;
  ruleId?: string;
}

/**
 * Parent-authored note attached to a specific anchor inside the report.
 * Stored inline in the report JSON so notes travel with the report.
 */
export interface UserNote {
  id: string;
  /**
   * Where the note is anchored. Must match a known location key:
   * - 'opening' | 'closingMessage' | 'milestoneReplay'
   * - 'section:<narrativeSection.id>'
   * - 'report' for whole-report notes
   */
  anchor: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One section of the redacted professional (teacher/doctor) summary.
 * `body` is the live text (user-edited overrides AI). `aiOriginal` is the
 * pristine AI-generated version so we can offer a "restore" affordance.
 * `enabled` is the user toggle — only enabled sections are included when
 * the summary is exported/copied.
 */
export interface ProfessionalSummarySection {
  id: string;
  title: string;
  body: string;
  aiOriginal: string;
  enabled: boolean;
}

export interface ProfessionalSummary {
  generatedAt: string;
  format: 'ai' | 'fallback';
  childSummary: string;
  sections: ProfessionalSummarySection[];
  disclaimer: string;
}

export interface NarrativeReportContent {
  version: 2;
  format: 'narrative' | 'narrative-ai';
  reportType: GrowthReportType;
  title: string;
  subtitle: string;
  teaser: string;
  /** Monthly theme keyword distilled from data. Older reports may not include this field. */
  keyword?: string;
  /** One-line sublabel below the keyword. Older reports may not include this field. */
  keywordSub?: string;
  generatedAt: string;
  opening?: string;
  narrativeSections: NarrativeSection[];
  milestoneReplay?: string | null;
  highlights?: string[];
  watchNext?: string[];
  closingMessage?: string;
  actionItems: ActionItem[];
  trendSignals: StructuredTrendSignal[];
  metrics: StructuredGrowthReportMetric[];
  /** Parent-authored notes attached to specific anchors inside this report. */
  userNotes?: UserNote[];
  /** Redacted professional summary for teachers/doctors. */
  professionalSummary?: ProfessionalSummary;
  sources: string[];
  safetyNote: string;
}

export type ParsedReportContent = StructuredGrowthReportContent | NarrativeReportContent;

export interface BuiltStructuredGrowthReport {
  reportType: GrowthReportType;
  periodStart: string;
  periodEnd: string;
  ageMonthsStart: number;
  ageMonthsEnd: number;
  content: StructuredGrowthReportContent | NarrativeReportContent;
}

export interface StructuredGrowthReportSnapshot {
  child: ChildProfile;
  reportType: GrowthReportType;
  now: string;
  periodStart?: string;
  periodEnd?: string;
  measurements: MeasurementRow[];
  milestones: MilestoneRecordRow[];
  vaccines: VaccineRecordRow[];
  journalEntries: JournalEntryRow[];
  reminderStates: ReminderStateRow[];
}

const growthStandardById = new Map(GROWTH_STANDARDS.map((item) => [item.typeId, item]));
const milestoneById = new Map(MILESTONE_CATALOG.map((item) => [item.milestoneId, item]));
const reminderRuleById = new Map(REMINDER_RULES.map((item) => [item.ruleId, item]));

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfUtcQuarter(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

function formatDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function truncate(value: string, max = 160) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function listSeparator() {
  return i18nText('Common.list.separator');
}

function getReportPeriod(reportType: GrowthReportType, now: string) {
  const target = new Date(now);
  const start = reportType === 'monthly' ? startOfUtcMonth(target) : startOfUtcQuarter(target);
  return {
    start: start.toISOString(),
    end: target.toISOString(),
  };
}

function inPeriod(value: string | null | undefined, start: string, end: string) {
  return Boolean(value && value >= start && value <= end);
}

function summarizeMeasurements(measurements: MeasurementRow[], start: string, end: string) {
  const inWindow = measurements.filter((item) => inPeriod(item.measuredAt, start, end));
  if (inWindow.length === 0) return [];

  const latestByType = new Map<string, MeasurementRow>();
  for (const measurement of inWindow) {
    latestByType.set(measurement.typeId, measurement);
  }

  return Array.from(latestByType.values())
    .sort((left, right) => left.typeId.localeCompare(right.typeId))
    .map((measurement) => {
      const standard = growthStandardById.get(measurement.typeId as typeof GROWTH_STANDARDS[number]['typeId']);
      const label = standard?.displayName ?? measurement.typeId;
      const unit = standard?.unit ? ` ${standard.unit}` : '';
      return i18nText('Reports.structured.lines.measurement', {
        label, value: measurement.value, unit, date: formatDate(measurement.measuredAt),
      });
    });
}

function summarizeMilestones(milestones: MilestoneRecordRow[], start: string, end: string) {
  const achieved = milestones.filter((item) => inPeriod(item.achievedAt, start, end));
  if (achieved.length === 0) return [];

  return achieved.map((item) => {
    const milestone = milestoneById.get(item.milestoneId);
    const title = milestone?.title ?? item.milestoneId;
    const date = item.achievedAt ? formatDate(item.achievedAt) : i18nText('Reports.structured.lines.dateNotRecorded');
    return i18nText('Reports.structured.lines.milestone', { title, date });
  });
}

function summarizeVaccines(vaccines: VaccineRecordRow[], start: string, end: string) {
  const inWindow = vaccines.filter((item) => inPeriod(item.vaccinatedAt, start, end));
  if (inWindow.length === 0) return [];

  return inWindow.map((item) => i18nText('Reports.structured.lines.vaccine', {
    name: item.vaccineName, date: formatDate(item.vaccinatedAt),
  }));
}

function summarizeJournalEntries(journalEntries: JournalEntryRow[], child: ChildProfile, start: string, end: string) {
  const inWindow = journalEntries.filter((item) => inPeriod(item.recordedAt, start, end));
  if (inWindow.length === 0) return [];

  const recorderCounts = new Map<string, number>();
  let keepsakeCount = 0;
  let voiceCount = 0;
  let mixedCount = 0;

  for (const entry of inWindow) {
    if (entry.keepsake === 1) keepsakeCount += 1;
    if (entry.contentType === 'voice') voiceCount += 1;
    if (entry.contentType === 'mixed') mixedCount += 1;
    if (entry.recorderId) {
      recorderCounts.set(entry.recorderId, (recorderCounts.get(entry.recorderId) ?? 0) + 1);
    }
  }

  const items = [
    i18nText('Reports.structured.lines.journalCount', { count: inWindow.length }),
    i18nText('Reports.structured.lines.journalKeepsake', { count: keepsakeCount }),
    i18nText('Reports.structured.lines.journalVoiceMixed', { voice: voiceCount, mixed: mixedCount }),
  ];

  if (recorderCounts.size > 0) {
    const recorderNameById = new Map((child.recorderProfiles ?? []).map((item) => [item.id, item.name]));
    const recorderSummary = Array.from(recorderCounts.entries())
      .map(([recorderId, count]) => `${recorderNameById.get(recorderId) ?? recorderId}: ${count}`)
      .join(listSeparator());
    items.push(i18nText('Reports.structured.lines.journalRecorders', { summary: recorderSummary }));
  }

  return items;
}

const OPEN_REMINDER_STATUSES = new Set(['pending', 'active', 'overdue']);
const OPEN_REMINDER_STATUS_RANK: Record<string, number> = { overdue: 0, active: 1, pending: 2 };

function openReminderStates(reminderStates: ReminderStateRow[]) {
  return reminderStates
    .filter((item) => OPEN_REMINDER_STATUSES.has(item.status))
    .sort((left, right) => (OPEN_REMINDER_STATUS_RANK[left.status] ?? 3) - (OPEN_REMINDER_STATUS_RANK[right.status] ?? 3));
}

function summarizeReminders(reminderStates: ReminderStateRow[]) {
  return openReminderStates(reminderStates).map((item) => {
    const rule = reminderRuleById.get(item.ruleId);
    const title = rule?.title ?? item.ruleId;
    return i18nText('Reports.structured.lines.reminder', {
      title,
      status: i18nText(`Reports.structured.reminderStatus.${item.status}`),
    });
  });
}

function buildOverview(
  child: ChildProfile,
  reportType: GrowthReportType,
  periodStart: string,
  periodEnd: string,
  measurements: MeasurementRow[],
  milestones: MilestoneRecordRow[],
  vaccines: VaccineRecordRow[],
  journalEntries: JournalEntryRow[],
  reminderStates: ReminderStateRow[],
) {
  const measurementCount = measurements.filter((item) => inPeriod(item.measuredAt, periodStart, periodEnd)).length;
  const milestoneCount = milestones.filter((item) => inPeriod(item.achievedAt, periodStart, periodEnd)).length;
  const vaccineCount = vaccines.filter((item) => inPeriod(item.vaccinatedAt, periodStart, periodEnd)).length;
  const journalCount = journalEntries.filter((item) => inPeriod(item.recordedAt, periodStart, periodEnd)).length;
  // PO-REMI-009 progression evidence: cite kind-aware parent engagement, not
  // a flat "pending / active / overdue" count.
  const evidence = summarizeReminderProgression(reminderStates.map(mapReminderStateRow), REMINDER_RULES);

  const engagementParts: string[] = [];
  if (evidence.tasksCompleted > 0) {
    engagementParts.push(i18nText('Reports.structured.engagement.tasksCompleted', { count: evidence.tasksCompleted }));
  }
  if (evidence.guidesAcknowledged > 0) {
    engagementParts.push(
      evidence.guidesReflected > 0
        ? i18nText('Reports.structured.engagement.guidesAcknowledgedReflected', { count: evidence.guidesAcknowledged, reflected: evidence.guidesReflected })
        : i18nText('Reports.structured.engagement.guidesAcknowledged', { count: evidence.guidesAcknowledged }),
    );
  }
  if (evidence.practicesInProgress > 0) {
    engagementParts.push(i18nText('Reports.structured.engagement.practicesInProgress', { count: evidence.practicesInProgress, events: evidence.practiceTotalEvents }));
  }
  if (evidence.practicesHabituated > 0) {
    engagementParts.push(i18nText('Reports.structured.engagement.practicesHabituated', { count: evidence.practicesHabituated }));
  }
  if (evidence.consultsCompleted > 0) {
    engagementParts.push(i18nText('Reports.structured.engagement.consultsCompleted', { count: evidence.consultsCompleted }));
  }

  const engagementLine = engagementParts.length > 0
    ? i18nText('Reports.structured.engagement.some', { parts: engagementParts.join(listSeparator()) })
    : i18nText('Reports.structured.engagement.none');

  return [
    i18nText('Reports.structured.overview.coverage', {
      childName: child.displayName,
      reportType: i18nText(`Reports.structured.reportType.${reportType}`),
      start: formatDate(periodStart),
      end: formatDate(periodEnd),
    }),
    i18nText('Reports.structured.overview.counts', {
      measurements: measurementCount,
      journals: journalCount,
      milestones: milestoneCount,
      vaccines: vaccineCount,
    }),
    `${engagementLine} ${i18nText('Reports.structured.overview.openReminders', { count: evidence.unfinished })}`,
  ];
}

export function buildStructuredGrowthReport(snapshot: StructuredGrowthReportSnapshot): BuiltStructuredGrowthReport {
  const {
    child,
    reportType,
    now,
    periodStart,
    periodEnd,
    measurements,
    milestones,
    vaccines,
    journalEntries,
    reminderStates,
  } = snapshot;
  const period = periodStart && periodEnd
    ? { start: periodStart, end: periodEnd }
    : getReportPeriod(reportType, now);
  const ageMonthsStart = computeAgeMonthsAt(child.birthDate, period.start);
  const ageMonthsEnd = computeAgeMonthsAt(child.birthDate, period.end);
  const ageStartLabel = formatAge(ageMonthsStart);
  const ageEndLabel = formatAge(ageMonthsEnd);

  const titleKey = reportType === 'quarterly-letter' ? 'quarterlyLetter' : reportType;
  const title = i18nText(`Reports.page.narrativeTitle.${titleKey}`, { childName: child.displayName });

  const subtitle = i18nText('Reports.structured.subtitle', {
    date: formatDate(now),
    ageStart: ageStartLabel,
    ageEnd: ageEndLabel,
  });
  const trendSignals = buildStructuredTrendSignals({
    measurements,
    journalEntries,
    periodStart: period.start,
    periodEnd: period.end,
  });

  const content: StructuredGrowthReportContent = {
    version: 1,
    format: 'structured-local',
    reportType,
    title,
    subtitle,
    generatedAt: now,
    overview: buildOverview(child, reportType, period.start, period.end, measurements, milestones, vaccines, journalEntries, reminderStates),
    metrics: [
      {
        id: 'age-range',
        label: i18nText('Reports.structured.metrics.ageWindow'),
        value: `${ageStartLabel} – ${ageEndLabel}`,
        detail: i18nText('Reports.page.periodRange', { start: formatDate(period.start), end: formatDate(period.end) }),
      },
      {
        id: 'measurement-count',
        label: i18nText('Reports.structured.metrics.measurements'),
        value: String(measurements.filter((item) => inPeriod(item.measuredAt, period.start, period.end)).length),
      },
      {
        id: 'journal-count',
        label: i18nText('Reports.structured.metrics.journalEntries'),
        value: String(journalEntries.filter((item) => inPeriod(item.recordedAt, period.start, period.end)).length),
      },
      {
        id: 'milestone-count',
        label: i18nText('Reports.structured.metrics.milestonesRecorded'),
        value: String(milestones.filter((item) => inPeriod(item.achievedAt, period.start, period.end)).length),
      },
      {
        id: 'reminder-count',
        label: i18nText('Reports.structured.metrics.openReminders'),
        value: String(openReminderStates(reminderStates).length),
      },
    ],
    trendSignals,
    sections: [
      { id: 'growth', title: i18nText('Reports.structured.sections.growth'), items: summarizeMeasurements(measurements, period.start, period.end) },
      { id: 'milestones', title: i18nText('Reports.structured.sections.milestones'), items: summarizeMilestones(milestones, period.start, period.end) },
      { id: 'vaccines', title: i18nText('Reports.structured.sections.vaccines'), items: summarizeVaccines(vaccines, period.start, period.end) },
      { id: 'journal', title: i18nText('Reports.structured.sections.journal'), items: summarizeJournalEntries(journalEntries, child, period.start, period.end) },
      { id: 'timeline', title: i18nText('Reports.structured.sections.timeline'), items: summarizeReminders(reminderStates) },
    ],
    actionItems: buildNarrativeActionItems(reminderStates),
    sources: [
      i18nText('Reports.structured.sources.childProfile'),
      i18nText('Reports.structured.sources.growthMeasurements'),
      i18nText('Reports.structured.sources.journalEntries'),
      i18nText('Reports.structured.sources.milestones'),
      i18nText('Reports.structured.sources.vaccines'),
      i18nText('Reports.structured.sources.reminders'),
    ],
    safetyNote: i18nText('Reports.structured.safetyNote'),
  };

  return {
    reportType,
    periodStart: period.start,
    periodEnd: period.end,
    ageMonthsStart,
    ageMonthsEnd,
    content,
  };
}

/* ── Action items builder (used by narrative-prompt.ts) ── */

const DOMAIN_ROUTES: Record<string, string> = {
  vaccine: '/profile', checkup: '/profile', growth: '/profile',
  vision: '/profile', dental: '/profile', sleep: '/profile',
  'bone-age': '/profile', sensitivity: '/journal', milestone: '/profile',
  posture: '/profile', fitness: '/profile/fitness', tanner: '/profile',
};

export function buildNarrativeActionItems(reminderStates: ReminderStateRow[]): ActionItem[] {
  return openReminderStates(reminderStates)
    .map((s) => ({ state: s, rule: reminderRuleById.get(s.ruleId) }))
    .filter((item) => item.rule != null)
    .slice(0, 3)
    .map((item) => {
      const rule = item.rule!;
      const statusLabel = item.state.status === 'overdue' ? i18nText('Reports.structured.action.overdueSuffix') : '';
      const route = DOMAIN_ROUTES[rule.domain] ?? '/profile';
      return {
        id: `action-${item.state.ruleId}`,
        text: `${rule.title}${statusLabel}`,
        linkTo: `/advisor?topic=${encodeURIComponent(rule.title)}&desc=${encodeURIComponent(rule.description)}&record=${encodeURIComponent(route)}`,
        ruleId: item.state.ruleId,
      };
    });
}

/* ── Parsers ── */

function parseActionItems(raw: unknown): ActionItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return (raw as Array<Record<string, unknown>>).map((a) => ({
    id: String(a.id ?? ''), text: String(a.text ?? ''),
    linkTo: typeof a.linkTo === 'string' ? a.linkTo : undefined,
    ruleId: typeof a.ruleId === 'string' ? a.ruleId : undefined,
  }));
}

function parseNarrativeReportContent(parsed: Record<string, unknown>): NarrativeReportContent {
  const fmt = parsed.format;
  if (parsed.version !== 2 || (fmt !== 'narrative' && fmt !== 'narrative-ai') || typeof parsed.title !== 'string' ||
    !Array.isArray(parsed.narrativeSections) || !Array.isArray(parsed.actionItems) ||
    !Array.isArray(parsed.sources) || typeof parsed.safetyNote !== 'string') {
    throw new Error('Invalid narrative report payload');
  }
  return {
    version: 2, format: fmt as 'narrative' | 'narrative-ai',
    reportType: typeof parsed.reportType === 'string' ? parsed.reportType as GrowthReportType : 'custom',
    title: parsed.title,
    subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : '',
    teaser: typeof parsed.teaser === 'string' ? parsed.teaser : '',
    keyword: typeof parsed.keyword === 'string' ? parsed.keyword : undefined,
    keywordSub: typeof parsed.keywordSub === 'string' ? parsed.keywordSub : undefined,
    generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
    opening: typeof parsed.opening === 'string' ? parsed.opening : undefined,
    milestoneReplay: typeof parsed.milestoneReplay === 'string' ? parsed.milestoneReplay : undefined,
    highlights: Array.isArray(parsed.highlights) ? (parsed.highlights as string[]).map(String) : undefined,
    watchNext: Array.isArray(parsed.watchNext) ? (parsed.watchNext as string[]).map(String) : undefined,
    closingMessage: typeof parsed.closingMessage === 'string' ? parsed.closingMessage : undefined,
    narrativeSections: (parsed.narrativeSections as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id ?? ''), title: String(s.title ?? ''), narrative: String(s.narrative ?? ''),
      dataPoints: Array.isArray(s.dataPoints) ? (s.dataPoints as Array<Record<string, unknown>>).map((d) => ({
        label: String(d.label ?? ''), value: String(d.value ?? ''), detail: d.detail != null ? String(d.detail) : undefined,
      })) : undefined,
    })),
    actionItems: parseActionItems(parsed.actionItems) ?? [],
    trendSignals: Array.isArray(parsed.trendSignals)
      ? (parsed.trendSignals as Array<Record<string, unknown>>).map((s) => ({
        id: String(s.id ?? ''), title: String(s.title ?? ''), summary: truncate(String(s.summary ?? '')),
        evidence: Array.isArray(s.evidence) ? (s.evidence as string[]).map((e) => truncate(String(e))) : [],
        sources: Array.isArray(s.sources) ? (s.sources as string[]).map((e) => String(e)) : [],
      })) : [],
    metrics: Array.isArray(parsed.metrics)
      ? (parsed.metrics as Array<Record<string, unknown>>).map((m) => ({
        id: String(m.id ?? ''), label: String(m.label ?? ''), value: String(m.value ?? ''),
        detail: m.detail != null ? String(m.detail) : undefined,
      })) : [],
    userNotes: parseUserNotes(parsed.userNotes),
    professionalSummary: parseProfessionalSummary(parsed.professionalSummary),
    sources: (parsed.sources as string[]).map((s) => String(s)),
    safetyNote: parsed.safetyNote as string,
  };
}

function parseUserNotes(raw: unknown): UserNote[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const notes: UserNote[] = [];
  for (const entry of raw as Array<Record<string, unknown>>) {
    if (typeof entry?.id !== 'string' || typeof entry?.anchor !== 'string' || typeof entry?.text !== 'string') continue;
    notes.push({
      id: entry.id,
      anchor: entry.anchor,
      text: entry.text,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    });
  }
  return notes.length > 0 ? notes : undefined;
}

function parseProfessionalSummary(raw: unknown): ProfessionalSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.sections)) return undefined;
  const sections: ProfessionalSummarySection[] = [];
  for (const entry of data.sections as Array<Record<string, unknown>>) {
    if (typeof entry?.id !== 'string' || typeof entry?.title !== 'string' || typeof entry?.body !== 'string') continue;
    sections.push({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      aiOriginal: typeof entry.aiOriginal === 'string' ? entry.aiOriginal : entry.body,
      enabled: entry.enabled !== false,
    });
  }
  if (sections.length === 0) return undefined;
  return {
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : '',
    format: data.format === 'fallback' ? 'fallback' : 'ai',
    childSummary: typeof data.childSummary === 'string' ? data.childSummary : '',
    sections,
    disclaimer: typeof data.disclaimer === 'string' ? data.disclaimer : i18nText('Reports.professionalSummary.disclaimer'),
  };
}

export function parseReportContent(raw: string): ParsedReportContent {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.version === 2) return parseNarrativeReportContent(parsed);
  return parseStructuredGrowthReportContent(raw);
}

export function parseStructuredGrowthReportContent(raw: string): StructuredGrowthReportContent {
  const parsed = JSON.parse(raw) as Partial<StructuredGrowthReportContent>;
  const reportType = typeof parsed.reportType === 'string' ? parsed.reportType : null;
  if (
    parsed.version !== 1 ||
    parsed.format !== 'structured-local' ||
      !reportType ||
      !GROWTH_REPORT_TYPES.includes(reportType as GrowthReportType) ||
      typeof parsed.title !== 'string' ||
      !Array.isArray(parsed.overview) ||
      !Array.isArray(parsed.metrics) ||
      !Array.isArray(parsed.trendSignals) ||
      !Array.isArray(parsed.sections) ||
      !Array.isArray(parsed.sources) ||
      typeof parsed.safetyNote !== 'string'
  ) {
    throw new Error('Invalid structured growth report payload');
  }

  return {
    version: 1,
    format: 'structured-local',
    reportType,
    title: parsed.title,
    subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : '',
    generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
    overview: parsed.overview.map((item) => truncate(String(item))),
    metrics: parsed.metrics.map((item) => ({
      id: String(item.id),
      label: String(item.label),
      value: String(item.value),
      detail: item.detail == null ? undefined : String(item.detail),
    })),
    trendSignals: parsed.trendSignals.map((signal) => ({
      id: String(signal.id),
      title: String(signal.title),
      summary: truncate(String(signal.summary)),
      evidence: Array.isArray(signal.evidence) ? signal.evidence.map((item) => truncate(String(item))) : [],
      sources: Array.isArray(signal.sources) ? signal.sources.map((item) => String(item)) : [],
    })),
    sections: parsed.sections.map((section) => ({
      id: String(section.id),
      title: String(section.title),
      items: Array.isArray(section.items) ? section.items.map((item) => truncate(String(item))) : [],
    })),
    actionItems: parseActionItems(parsed.actionItems),
    sources: parsed.sources.map((item) => String(item)),
    safetyNote: parsed.safetyNote,
  };
}
