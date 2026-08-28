import type { SleepRecordRow } from '../../bridge/sqlite-bridge.js';
import { referenceSleepRange } from './sleep-page-shared.js';

// @nimi-authority: rule.parentos.prof.r010
export const MIN_SAMPLE_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
// Bedtimes before noon are treated as past-midnight of the previous evening.
const NOON_MINUTES = 12 * 60;

export type SleepRegularity = 'good' | 'fair' | 'variable' | 'insufficient';
export type SleepSufficiency = 'within' | 'below' | 'above' | 'insufficient';

export interface SleepWeekStats {
  daysWithRecords: number;
  totalSampleDays: number;
  bedtimeSampleDays: number;
  avgTotalMin: number | null;
  avgNightMin: number | null;
  avgNapMin: number | null;
  avgBedtimeMin: number | null;
  bedtimeStdMin: number | null;
  regularity: SleepRegularity;
  sufficiency: SleepSufficiency;
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** ISO dates (local) for the last 7 calendar days ending at `today`, oldest first. */
export function last7DayDates(today: Date): string[] {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
  const dates: string[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    dates.push(toLocalDateString(new Date(base.getTime() - offset * DAY_MS)));
  }
  return dates;
}

/** Records aligned to the last 7 calendar days; `null` marks days without a record. */
export function last7DayRecords(
  records: SleepRecordRow[],
  today: Date,
): { date: string; record: SleepRecordRow | null }[] {
  const byDate = new Map<string, SleepRecordRow>();
  for (const record of records) {
    const date = record.sleepDate.split('T')[0] ?? '';
    if (date) byDate.set(date, record);
  }
  return last7DayDates(today).map((date) => ({ date, record: byDate.get(date) ?? null }));
}

export function totalMinutes(record: SleepRecordRow): number | null {
  const night = record.durationMinutes ?? 0;
  const nap = record.napMinutes ?? 0;
  if (night <= 0 && nap <= 0) return null;
  return night + nap;
}

export function meanMinutes(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Parse "HH:mm" (or an ISO datetime containing a time part) into minutes of day. */
export function timeToMinutesOfDay(value: string): number | null {
  const timePart = value.includes('T') ? value.split('T')[1] ?? '' : value;
  const match = timePart.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesOfDay(minutes: number): string {
  const normalized = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Circular mean of clock times: times before noon are unfolded to the next day
 * so that e.g. 23:50 and 00:10 average to midnight instead of noon.
 */
export function circularMeanTime(times: number[]): number | null {
  if (times.length === 0) return null;
  const unfolded = times.map((t) => (t < NOON_MINUTES ? t + MINUTES_PER_DAY : t));
  const mean = unfolded.reduce((sum, t) => sum + t, 0) / unfolded.length;
  return Math.round(mean) % MINUTES_PER_DAY;
}

/** Population standard deviation of clock times, using the same unfolding as circularMeanTime. */
export function timeStdMinutes(times: number[]): number | null {
  if (times.length === 0) return null;
  const unfolded = times.map((t) => (t < NOON_MINUTES ? t + MINUTES_PER_DAY : t));
  const mean = unfolded.reduce((sum, t) => sum + t, 0) / unfolded.length;
  const variance = unfolded.reduce((sum, t) => sum + (t - mean) ** 2, 0) / unfolded.length;
  return Math.round(Math.sqrt(variance));
}

export function regularityLabel(stdMin: number | null, sampleDays: number): SleepRegularity {
  if (stdMin == null || sampleDays < MIN_SAMPLE_DAYS) return 'insufficient';
  if (stdMin <= 30) return 'good';
  if (stdMin <= 60) return 'fair';
  return 'variable';
}

export function sufficiencyLabel(
  avgTotalMin: number | null,
  sampleDays: number,
  ageMonths: number,
): SleepSufficiency {
  if (avgTotalMin == null || sampleDays < MIN_SAMPLE_DAYS) return 'insufficient';
  const [refLo, refHi] = referenceSleepRange(ageMonths);
  if (avgTotalMin < refLo * 60) return 'below';
  if (avgTotalMin > refHi * 60) return 'above';
  return 'within';
}

export function computeWeekStats(
  records: SleepRecordRow[],
  ageMonths: number,
  today: Date,
): SleepWeekStats {
  const days = last7DayRecords(records, today);
  const present = days.filter((day) => day.record != null).map((day) => day.record as SleepRecordRow);

  const totals = present.map(totalMinutes).filter((v): v is number => v != null);
  const nights = present.map((r) => r.durationMinutes).filter((v): v is number => v != null && v > 0);
  const naps = present.map((r) => r.napMinutes).filter((v): v is number => v != null && v > 0);
  const bedtimes = present
    .map((r) => (r.bedtime ? timeToMinutesOfDay(r.bedtime) : null))
    .filter((v): v is number => v != null);

  const avgTotalMin = meanMinutes(totals);
  const bedtimeStdMin = timeStdMinutes(bedtimes);

  return {
    daysWithRecords: present.length,
    totalSampleDays: totals.length,
    bedtimeSampleDays: bedtimes.length,
    avgTotalMin,
    avgNightMin: meanMinutes(nights),
    avgNapMin: meanMinutes(naps),
    avgBedtimeMin: circularMeanTime(bedtimes),
    bedtimeStdMin,
    regularity: regularityLabel(bedtimeStdMin, bedtimes.length),
    sufficiency: sufficiencyLabel(avgTotalMin, totals.length, ageMonths),
  };
}
