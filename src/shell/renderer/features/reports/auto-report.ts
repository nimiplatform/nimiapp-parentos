import type { ChildProfile } from '../../app-shell/app-store.js';
import {
  getAllergyRecords, getDentalRecords, getFitnessAssessments, getGrowthReports,
  getJournalEntries, getMeasurements, getMedicalEvents, getMilestoneRecords,
  getReminderStates, getSleepRecords, getTannerAssessments, getVaccineRecords,
  insertGrowthReport,
} from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { generateNarrativeReport } from './narrative-prompt.js';
import { hasParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { findNextEligibleRollingReportPeriod, requireValidGrowthReports } from './report-cycle.js';
import { buildStructuredGrowthReport } from './structured-report.js';

const inFlightByChild = new Map<string, Promise<string | null>>();

async function generateNextEligibleMonthlyReport(child: ChildProfile): Promise<string | null> {
  const existing = await getGrowthReports(child.childId);
  const period = findNextEligibleRollingReportPeriod(child.createdAt, existing);
  if (!period) return null;

  const now = isoNow();
  const [measurements, milestones, vaccines, journalEntries, reminderStates] = await Promise.all([
    getMeasurements(child.childId), getMilestoneRecords(child.childId),
    getVaccineRecords(child.childId), getJournalEntries(child.childId, 200),
    getReminderStates(child.childId),
  ]);

  let report: Awaited<ReturnType<typeof generateNarrativeReport>> | ReturnType<typeof buildStructuredGrowthReport> | null = null;
  if (hasParentOSNimiClient()) {
    const [sleepRecords, dentalRecords, allergyRecords, medicalEvents, fitnessAssessments, tannerAssessments] = await Promise.all([
      getSleepRecords(child.childId), getDentalRecords(child.childId), getAllergyRecords(child.childId),
      getMedicalEvents(child.childId), getFitnessAssessments(child.childId), getTannerAssessments(child.childId),
    ]);
    try {
      report = await generateNarrativeReport(
        child,
        { start: period.periodStart, end: period.periodEnd },
        {
          measurements,
          milestones,
          vaccines,
          journalEntries,
          reminderStates,
          sleepRecords,
          dentalRecords,
          allergyRecords,
          medicalEvents,
          fitnessAssessments,
          tannerAssessments,
        },
      );
    } catch (error) {
      catchLog('reports', 'action:auto-generate-narrative-report-failed', 'warn')(error);
    }
  }

  if (!report) {
    report = buildStructuredGrowthReport({
      child,
      reportType: 'monthly',
      now,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      measurements,
      milestones,
      vaccines,
      journalEntries,
      reminderStates,
    });
  }

  // Runtime narration can take time. Re-check immediately before persistence so
  // route changes or a second surface cannot produce the same period twice.
  const latest = requireValidGrowthReports(child.createdAt, await getGrowthReports(child.childId));
  if (latest.some((item) => item.reportType === 'monthly' && item.periodStart === period.periodStart)) {
    return null;
  }

  const reportId = ulid();
  await insertGrowthReport({
    reportId, childId: child.childId, reportType: report.reportType,
    periodStart: report.periodStart, periodEnd: report.periodEnd,
    ageMonthsStart: report.ageMonthsStart, ageMonthsEnd: report.ageMonthsEnd,
    content: JSON.stringify(report.content), generatedAt: now, now,
  });

  return reportId;
}

export function autoGenerateMonthlyReport(child: ChildProfile): Promise<string | null> {
  const existing = inFlightByChild.get(child.childId);
  if (existing) return existing;

  const pending = generateNextEligibleMonthlyReport(child).finally(() => {
    inFlightByChild.delete(child.childId);
  });
  inFlightByChild.set(child.childId, pending);
  return pending;
}
