// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDash } from './timeline-data-fetch.js';

const bridgeMocks = vi.hoisted(() => ({
  getAllergyRecords: vi.fn(),
  getCustomTodos: vi.fn(),
  getGrowthReports: vi.fn(),
  getJournalEntries: vi.fn(),
  getMeasurements: vi.fn(),
  getMilestoneRecords: vi.fn(),
  getOrthodonticCheckins: vi.fn(),
  getOrthodonticDashboard: vi.fn(),
  getOutdoorGoal: vi.fn(),
  getOutdoorRecords: vi.fn(),
  getReminderStates: vi.fn(),
  getSleepRecords: vi.fn(),
  getVaccineRecords: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => bridgeMocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function monthlyReport(childId: string) {
  return {
    reportId: `report-${childId}`,
    childId,
    reportType: 'monthly',
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-07-31T23:59:59.999Z',
    ageMonthsStart: 24,
    ageMonthsEnd: 25,
    content: '{}',
    generatedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('useDash child ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of [
      bridgeMocks.getAllergyRecords,
      bridgeMocks.getCustomTodos,
      bridgeMocks.getJournalEntries,
      bridgeMocks.getMeasurements,
      bridgeMocks.getMilestoneRecords,
      bridgeMocks.getOutdoorRecords,
      bridgeMocks.getReminderStates,
      bridgeMocks.getSleepRecords,
      bridgeMocks.getVaccineRecords,
    ]) {
      mock.mockResolvedValue([]);
    }
    bridgeMocks.getOutdoorGoal.mockResolvedValue(null);
    bridgeMocks.getOrthodonticDashboard.mockResolvedValue({ activeAppliances: [] });
    bridgeMocks.getOrthodonticCheckins.mockResolvedValue([]);
  });

  it('hides the previous child snapshot immediately while the next child loads', async () => {
    const childBReports = deferred<ReturnType<typeof monthlyReport>[]>();
    bridgeMocks.getGrowthReports.mockImplementation((childId: string) => (
      childId === 'child-a'
        ? Promise.resolve([monthlyReport(childId)])
        : childBReports.promise
    ));

    const { result, rerender } = renderHook(
      ({ childId }) => useDash(childId),
      { initialProps: { childId: 'child-a' as string | null } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.d.latestMonthlyReport?.reportId).toBe('report-child-a');

    rerender({ childId: 'child-b' });

    expect(result.current.loading).toBe(true);
    expect(result.current.d.latestMonthlyReport).toBeNull();

    await act(async () => { childBReports.resolve([]); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.d.latestMonthlyReport).toBeNull();
  });

  it('discards a late response from the previously selected child', async () => {
    const childAReports = deferred<ReturnType<typeof monthlyReport>[]>();
    bridgeMocks.getGrowthReports.mockImplementation((childId: string) => (
      childId === 'child-a' ? childAReports.promise : Promise.resolve([])
    ));

    const { result, rerender } = renderHook(
      ({ childId }) => useDash(childId),
      { initialProps: { childId: 'child-a' as string | null } },
    );

    rerender({ childId: 'child-b' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.d.latestMonthlyReport).toBeNull();

    await act(async () => { childAReports.resolve([monthlyReport('child-a')]); });

    expect(result.current.loading).toBe(false);
    expect(result.current.d.latestMonthlyReport).toBeNull();
  });
});
