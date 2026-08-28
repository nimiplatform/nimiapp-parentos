import { describe, expect, it } from 'vitest';
import type { SleepRecordRow } from '../../bridge/sqlite-bridge.js';
import {
  circularMeanTime,
  computeWeekStats,
  formatMinutesOfDay,
  last7DayDates,
  last7DayRecords,
  regularityLabel,
  sufficiencyLabel,
  timeStdMinutes,
  timeToMinutesOfDay,
  totalMinutes,
} from './sleep-week-stats.js';

function makeRecord(overrides: Partial<SleepRecordRow> = {}): SleepRecordRow {
  return {
    recordId: 'rec-1',
    childId: 'child-1',
    sleepDate: '2026-08-26',
    bedtime: '20:00',
    wakeTime: '06:30',
    durationMinutes: 630,
    napCount: 2,
    napMinutes: 120,
    quality: 'good',
    ageMonths: 20,
    notes: null,
    createdAt: '2026-08-26T08:00:00.000Z',
    ...overrides,
  };
}

describe('last7DayDates', () => {
  it('returns 7 ISO dates ending at today, oldest first', () => {
    const dates = last7DayDates(new Date(2026, 7, 26, 15, 0, 0));
    expect(dates).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
  });
});

describe('last7DayRecords', () => {
  it('aligns records to calendar days and keeps gaps as null', () => {
    const records = [
      makeRecord({ recordId: 'a', sleepDate: '2026-08-24' }),
      makeRecord({ recordId: 'b', sleepDate: '2026-08-26' }),
      makeRecord({ recordId: 'old', sleepDate: '2026-08-10' }),
    ];
    const days = last7DayRecords(records, new Date(2026, 7, 26, 15, 0, 0));
    expect(days.map((d) => d.record?.recordId ?? null)).toEqual([
      null, null, null, null, 'a', null, 'b',
    ]);
  });
});

describe('totalMinutes', () => {
  it('sums night and nap, null when both absent', () => {
    expect(totalMinutes(makeRecord())).toBe(750);
    expect(totalMinutes(makeRecord({ durationMinutes: null, napMinutes: null }))).toBeNull();
    expect(totalMinutes(makeRecord({ durationMinutes: 600, napMinutes: null }))).toBe(600);
  });
});

describe('timeToMinutesOfDay', () => {
  it('parses HH:mm and ISO datetimes', () => {
    expect(timeToMinutesOfDay('19:59')).toBe(1199);
    expect(timeToMinutesOfDay('2026-08-26T06:37:00')).toBe(397);
    expect(timeToMinutesOfDay('bad')).toBeNull();
  });
});

describe('circularMeanTime', () => {
  it('averages typical evening bedtimes', () => {
    expect(circularMeanTime([20 * 60, 20 * 60 + 10])).toBe(20 * 60 + 5);
  });

  it('wraps across midnight instead of averaging to noon', () => {
    expect(circularMeanTime([23 * 60 + 50, 10])).toBe(0);
  });

  it('returns null for empty input', () => {
    expect(circularMeanTime([])).toBeNull();
  });
});

describe('timeStdMinutes', () => {
  it('computes deviation across midnight', () => {
    expect(timeStdMinutes([23 * 60 + 50, 10])).toBe(10);
  });

  it('returns 0 for identical times', () => {
    expect(timeStdMinutes([20 * 60, 20 * 60, 20 * 60])).toBe(0);
  });
});

describe('regularityLabel', () => {
  it('requires at least 4 sample days', () => {
    expect(regularityLabel(5, 3)).toBe('insufficient');
  });

  it('maps std thresholds', () => {
    expect(regularityLabel(30, 4)).toBe('good');
    expect(regularityLabel(31, 4)).toBe('fair');
    expect(regularityLabel(60, 4)).toBe('fair');
    expect(regularityLabel(61, 4)).toBe('variable');
  });

  it('returns insufficient when std is null', () => {
    expect(regularityLabel(null, 7)).toBe('insufficient');
  });
});

describe('sufficiencyLabel', () => {
  // ageMonths 20 → reference range [11, 14] hours
  it('requires at least 4 sample days', () => {
    expect(sufficiencyLabel(12 * 60, 3, 20)).toBe('insufficient');
  });

  it('classifies against the age reference band', () => {
    expect(sufficiencyLabel(12 * 60, 4, 20)).toBe('within');
    expect(sufficiencyLabel(10 * 60 + 30, 4, 20)).toBe('below');
    expect(sufficiencyLabel(14 * 60 + 30, 4, 20)).toBe('above');
  });
});

describe('computeWeekStats', () => {
  const today = new Date(2026, 7, 26, 15, 0, 0);

  it('aggregates the last 7 calendar days', () => {
    const records = [
      makeRecord({ recordId: '1', sleepDate: '2026-08-24', durationMinutes: 600, napMinutes: 120, bedtime: '20:00' }),
      makeRecord({ recordId: '2', sleepDate: '2026-08-25', durationMinutes: 620, napMinutes: 110, bedtime: '20:10' }),
      makeRecord({ recordId: '3', sleepDate: '2026-08-26', durationMinutes: 640, napMinutes: 130, bedtime: '19:50' }),
      makeRecord({ recordId: 'old', sleepDate: '2026-08-01', durationMinutes: 999, napMinutes: 999 }),
    ];
    const stats = computeWeekStats(records, 20, today);
    expect(stats.daysWithRecords).toBe(3);
    expect(stats.avgTotalMin).toBe(740);
    expect(stats.avgNightMin).toBe(620);
    expect(stats.avgNapMin).toBe(120);
    expect(stats.avgBedtimeMin).toBe(20 * 60);
    // Only 3 days in the window → fail-close to insufficient.
    expect(stats.regularity).toBe('insufficient');
    expect(stats.sufficiency).toBe('insufficient');
  });

  it('reports within-range and good regularity with enough samples', () => {
    const records = ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25'].map((date, index) =>
      makeRecord({
        recordId: `r${index}`,
        sleepDate: date,
        durationMinutes: 630,
        napMinutes: 120,
        bedtime: index % 2 === 0 ? '20:00' : '20:10',
      }),
    );
    const stats = computeWeekStats(records, 20, today);
    expect(stats.sufficiency).toBe('within');
    expect(stats.regularity).toBe('good');
    expect(stats.bedtimeStdMin).toBe(5);
  });

  it('handles missing bedtimes and durations independently', () => {
    const records = [
      makeRecord({ recordId: '1', sleepDate: '2026-08-25', bedtime: null, durationMinutes: null, napMinutes: null }),
      makeRecord({ recordId: '2', sleepDate: '2026-08-26', bedtime: '20:00', durationMinutes: 600, napMinutes: null }),
    ];
    const stats = computeWeekStats(records, 20, today);
    expect(stats.daysWithRecords).toBe(2);
    expect(stats.totalSampleDays).toBe(1);
    expect(stats.bedtimeSampleDays).toBe(1);
    expect(stats.avgBedtimeMin).toBe(20 * 60);
    expect(stats.avgTotalMin).toBe(600);
  });
});

describe('formatMinutesOfDay', () => {
  it('formats and normalizes', () => {
    expect(formatMinutesOfDay(1199)).toBe('19:59');
    expect(formatMinutesOfDay(24 * 60)).toBe('00:00');
    expect(formatMinutesOfDay(-1)).toBe('23:59');
  });
});
