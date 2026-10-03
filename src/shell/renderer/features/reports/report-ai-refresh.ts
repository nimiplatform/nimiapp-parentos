import type { ChildProfile } from '../../app-shell/app-store.js';
import {
  getAllergyRecords, getDentalRecords, getFitnessAssessments, getJournalEntries,
  getMeasurements, getMedicalEvents, getMilestoneRecords, getReminderStates,
  getGrowthReports, getSleepRecords, getTannerAssessments, getVaccineRecords, updateGrowthReportContent,
} from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';
import { i18nText } from '../../i18n/index.js';
import {
  hasParentosAIConfigCapability,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
} from '../settings/parentos-ai-config.js';
import { generateNarrativeReportForPeriod, type AllDomainData } from './narrative-prompt.js';
import {
  parseReportContent, type GrowthReportType, type NarrativeReportContent, type ParsedReportContent,
} from './structured-report.js';

type GrowthReportRow = Awaited<ReturnType<typeof getGrowthReports>>[number];

export function hasReportTextRuntime(): Promise<boolean> {
  return hasParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT);
}

export async function loadReportDomainData(childId: string): Promise<AllDomainData> {
  const [
    measurements, milestones, vaccines, journalEntries, reminderStates,
    sleepRecords, dentalRecords, allergyRecords, medicalEvents, fitnessAssessments, tannerAssessments,
  ] = await Promise.all([
    getMeasurements(childId), getMilestoneRecords(childId), getVaccineRecords(childId),
    getJournalEntries(childId, 200), getReminderStates(childId),
    getSleepRecords(childId), getDentalRecords(childId), getAllergyRecords(childId),
    getMedicalEvents(childId), getFitnessAssessments(childId), getTannerAssessments(childId),
  ]);
  return {
    measurements, milestones, vaccines, journalEntries, reminderStates,
    sleepRecords, dentalRecords, allergyRecords, medicalEvents, fitnessAssessments, tannerAssessments,
  };
}

export function buildNarrativeTitle(childName: string, reportType: GrowthReportType) {
  switch (reportType) {
    case 'monthly':
      return i18nText('Reports.page.narrativeTitle.monthly', { childName });
    case 'quarterly':
      return i18nText('Reports.page.narrativeTitle.quarterly', { childName });
    case 'quarterly-letter':
      return i18nText('Reports.page.narrativeTitle.quarterlyLetter', { childName });
    case 'custom':
    default:
      return i18nText('Reports.page.narrativeTitle.custom', { childName });
  }
}

/**
 * A report can be rewritten by the runtime only while it is still the
 * deterministic v1 payload. v2 content may carry parent edits and notes, so it
 * is never overwritten.
 */
export function isAiRefreshableContent(content: ParsedReportContent): boolean {
  return content.version === 1;
}

const inFlightByReport = new Map<string, Promise<NarrativeReportContent>>();

async function rewriteReport(child: ChildProfile, report: GrowthReportRow): Promise<NarrativeReportContent> {
  if (!isAiRefreshableContent(parseReportContent(report.content))) {
    throw new Error(`Growth report is not a local structured report: ${report.reportId}`);
  }
  if (!(await hasReportTextRuntime())) {
    throw new Error(i18nText('Reports.page.ai.runtimeUnavailable'));
  }

  const reportType = report.reportType as GrowthReportType;
  const data = await loadReportDomainData(child.childId);
  const built = await generateNarrativeReportForPeriod({
    child,
    period: { start: report.periodStart, end: report.periodEnd },
    data,
    reportType,
  });
  if (built.content.version !== 2) {
    throw new Error(`Runtime narration returned an unsupported payload: ${report.reportId}`);
  }

  const content: NarrativeReportContent = { ...built.content, reportType };
  if (reportType !== 'monthly') {
    content.title = buildNarrativeTitle(child.displayName, reportType);
    content.subtitle = i18nText('Reports.page.periodSubtitle', {
      start: report.periodStart.slice(0, 10),
      end: report.periodEnd.slice(0, 10),
    });
  }

  // Same growth_reports row, same period and reportType: only content changes.
  await updateGrowthReportContent({ reportId: report.reportId, content: JSON.stringify(content), now: isoNow() });
  return content;
}

// @nimi-authority: rule.parentos.advs.r009
export function refreshReportWithAi(child: ChildProfile, report: GrowthReportRow): Promise<NarrativeReportContent> {
  const existing = inFlightByReport.get(report.reportId);
  if (existing) return existing;
  const pending = rewriteReport(child, report).finally(() => {
    inFlightByReport.delete(report.reportId);
  });
  inFlightByReport.set(report.reportId, pending);
  return pending;
}
