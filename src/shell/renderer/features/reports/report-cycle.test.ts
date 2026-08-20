import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsUtc,
  findNextEligibleRollingReportPeriod,
  getFirstReportAccumulation,
  getRollingReportPeriod,
  isValidRollingMonthlyReport,
  requireValidGrowthReports,
} from './report-cycle.js';

describe('rolling monthly report cycles', () => {
  it('keeps the first report accumulating until one calendar month after profile creation', () => {
    const status = getFirstReportAccumulation(
      '2026-08-17T00:00:00.000Z',
      new Date('2026-08-19T00:00:00.000Z'),
    );

    expect(status.periodStart).toBe('2026-08-17T00:00:00.000Z');
    expect(status.generationAt).toBe('2026-09-17T00:00:00.000Z');
    expect(status.elapsedDays).toBe(3);
    expect(status.isEligible).toBe(false);
  });

  it('clamps short months while preserving the original anchor for later boundaries', () => {
    expect(addCalendarMonthsUtc('2026-01-31T08:30:00.000Z', 1).toISOString()).toBe('2026-02-28T08:30:00.000Z');
    expect(addCalendarMonthsUtc('2026-01-31T08:30:00.000Z', 2).toISOString()).toBe('2026-03-31T08:30:00.000Z');
  });

  it('returns the earliest closed rolling period that has not been persisted', () => {
    const first = getRollingReportPeriod('2026-06-17T00:00:00.000Z', 1);
    const next = findNextEligibleRollingReportPeriod(
      '2026-06-17T00:00:00.000Z',
      [{
        reportType: 'monthly',
        periodStart: first.periodStart,
        periodEnd: first.periodEnd,
        generatedAt: first.generationAt,
      }],
      new Date('2026-08-19T00:00:00.000Z'),
    );

    expect(next?.cycleNumber).toBe(2);
    expect(next?.periodStart).toBe('2026-07-17T00:00:00.000Z');
    expect(next?.generationAt).toBe('2026-08-17T00:00:00.000Z');
  });

  it('fails closed on a persisted monthly row outside the rolling-window contract', () => {
    const createdAt = '2026-08-17T14:11:49.989Z';
    const invalidHalfMonth = {
      reportType: 'monthly',
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-17T14:11:50.165Z',
      generatedAt: '2026-08-17T14:11:50.165Z',
    };

    expect(isValidRollingMonthlyReport(
      createdAt,
      invalidHalfMonth,
      new Date('2026-09-18T00:00:00.000Z'),
    )).toBe(false);
    expect(() => requireValidGrowthReports(
      createdAt,
      [invalidHalfMonth],
      new Date('2026-09-18T00:00:00.000Z'),
    )).toThrow(/Invalid rolling monthly report window/);
    expect(() => findNextEligibleRollingReportPeriod(
      createdAt,
      [invalidHalfMonth],
      new Date('2026-09-18T00:00:00.000Z'),
    )).toThrow(/Invalid rolling monthly report window/);
  });

  it('rejects a report that uses the right start but was persisted before the window closed', () => {
    const createdAt = '2026-08-17T14:11:49.989Z';
    const first = getRollingReportPeriod(createdAt, 1);

    expect(isValidRollingMonthlyReport(createdAt, {
      reportType: 'monthly',
      periodStart: first.periodStart,
      periodEnd: '2026-08-31T23:59:59.999Z',
      generatedAt: '2026-08-31T23:59:59.999Z',
    }, new Date('2026-09-18T00:00:00.000Z'))).toBe(false);
  });

  it('rejects a report whose persistence timestamp is in the future', () => {
    const createdAt = '2026-07-17T14:11:49.989Z';
    const first = getRollingReportPeriod(createdAt, 1);

    expect(isValidRollingMonthlyReport(createdAt, {
      reportType: 'monthly',
      periodStart: first.periodStart,
      periodEnd: first.periodEnd,
      generatedAt: '2026-09-20T00:00:00.000Z',
    }, new Date('2026-09-18T00:00:00.000Z'))).toBe(false);
  });
});
