const DAY_MS = 24 * 60 * 60 * 1000;

export interface RollingReportPeriod {
  cycleNumber: number;
  periodStart: string;
  periodEnd: string;
  generationAt: string;
}

export interface FirstReportAccumulation extends RollingReportPeriod {
  elapsedDays: number;
  totalDays: number;
  progressPercent: number;
  isEligible: boolean;
}

export interface PersistedReportWindow {
  reportType: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
}

function parseIso(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return date;
}

/** Adds calendar months without allowing JavaScript date overflow to skip a month. */
export function addCalendarMonthsUtc(anchorIso: string, months: number): Date {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error(`Calendar-month offset must be a non-negative integer: ${months}`);
  }

  const anchor = parseIso(anchorIso, 'report anchor');
  const absoluteMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(anchor.getUTCDate(), lastDay);

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ));
}

export function getRollingReportPeriod(createdAt: string, cycleNumber: number): RollingReportPeriod {
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1) {
    throw new Error(`Report cycle number must be a positive integer: ${cycleNumber}`);
  }

  const start = addCalendarMonthsUtc(createdAt, cycleNumber - 1);
  const generationAt = addCalendarMonthsUtc(createdAt, cycleNumber);
  return {
    cycleNumber,
    periodStart: start.toISOString(),
    periodEnd: new Date(generationAt.getTime() - 1).toISOString(),
    generationAt: generationAt.toISOString(),
  };
}

export function getFirstReportAccumulation(createdAt: string, now = new Date()): FirstReportAccumulation {
  const current = parseIso(now.toISOString(), 'current time');
  const period = getRollingReportPeriod(createdAt, 1);
  const start = parseIso(period.periodStart, 'period start');
  const generationAt = parseIso(period.generationAt, 'generation time');
  const totalDuration = generationAt.getTime() - start.getTime();
  const elapsedDuration = Math.min(Math.max(current.getTime() - start.getTime(), 0), totalDuration);
  const elapsedDays = elapsedDuration === 0 ? 0 : Math.min(Math.floor(elapsedDuration / DAY_MS) + 1, Math.ceil(totalDuration / DAY_MS));

  return {
    ...period,
    elapsedDays,
    totalDays: Math.ceil(totalDuration / DAY_MS),
    progressPercent: totalDuration > 0 ? Math.round((elapsedDuration / totalDuration) * 100) : 100,
    isEligible: current.getTime() >= generationAt.getTime(),
  };
}

export function isValidRollingMonthlyReport(
  createdAt: string,
  report: PersistedReportWindow,
  now = new Date(),
): boolean {
  if (report.reportType !== 'monthly') return false;

  try {
    const reportStart = parseIso(report.periodStart, 'persisted report period start').getTime();
    const reportEnd = parseIso(report.periodEnd, 'persisted report period end').getTime();
    const generatedAt = parseIso(report.generatedAt, 'persisted report generation time').getTime();
    const currentTime = parseIso(now.toISOString(), 'current time').getTime();

    for (let cycleNumber = 1; cycleNumber <= 240; cycleNumber += 1) {
      const period = getRollingReportPeriod(createdAt, cycleNumber);
      const expectedStart = parseIso(period.periodStart, 'period start').getTime();
      if (expectedStart > reportStart) return false;
      if (expectedStart !== reportStart) continue;

      const expectedEnd = parseIso(period.periodEnd, 'period end').getTime();
      const generationAt = parseIso(period.generationAt, 'generation time').getTime();
      return reportEnd === expectedEnd
        && generatedAt >= generationAt
        && generatedAt <= currentTime
        && generationAt <= currentTime;
    }
  } catch {
    return false;
  }

  return false;
}

export function requireValidGrowthReports<T extends PersistedReportWindow>(
  createdAt: string,
  reports: T[],
  now = new Date(),
): T[] {
  const invalidMonthlyReport = reports.find((report) => (
    report.reportType === 'monthly' && !isValidRollingMonthlyReport(createdAt, report, now)
  ));
  if (invalidMonthlyReport) {
    throw new Error(`Invalid rolling monthly report window: ${invalidMonthlyReport.periodStart}`);
  }
  return reports;
}

export function findNextEligibleRollingReportPeriod(
  createdAt: string,
  existingReports: PersistedReportWindow[],
  now = new Date(),
): RollingReportPeriod | null {
  const currentTime = parseIso(now.toISOString(), 'current time').getTime();
  requireValidGrowthReports(createdAt, existingReports, now);
  const existingStarts = new Set(
    existingReports
      .filter((report) => report.reportType === 'monthly')
      .map((report) => report.periodStart),
  );

  // ParentOS profiles cover at most childhood. The cap also fails closed if corrupt
  // timestamps would otherwise turn this into an unbounded scan.
  for (let cycleNumber = 1; cycleNumber <= 240; cycleNumber += 1) {
    const period = getRollingReportPeriod(createdAt, cycleNumber);
    if (parseIso(period.generationAt, 'generation time').getTime() > currentTime) {
      return null;
    }
    if (!existingStarts.has(period.periodStart)) {
      return period;
    }
  }

  throw new Error('Rolling report cycle scan exceeded 240 months');
}
