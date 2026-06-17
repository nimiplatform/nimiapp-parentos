import type { TodoRecurrenceRule, TodoRecurrenceUnit } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


const WEEKDAY_LABELS = [
  i18nText('TodoRecurrence.weekday.sunday'),
  i18nText('TodoRecurrence.weekday.monday'),
  i18nText('TodoRecurrence.weekday.tuesday'),
  i18nText('TodoRecurrence.weekday.wednesday'),
  i18nText('TodoRecurrence.weekday.thursday'),
  i18nText('TodoRecurrence.weekday.friday'),
  i18nText('TodoRecurrence.weekday.saturday'),
];

export const REMINDER_OFFSET_PRESETS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 5, label: i18nText('Common.relative.minutesAgoCompact', { minutes: 5 }) },
  { minutes: 10, label: i18nText('Common.relative.minutesAgoCompact', { minutes: 10 }) },
  { minutes: 30, label: i18nText('Common.relative.minutesAgoCompact', { minutes: 30 }) },
  { minutes: 60, label: i18nText('Common.relative.hoursAgoCompact', { hours: 1 }) },
  { minutes: 120, label: i18nText('Common.relative.hoursAgoCompact', { hours: 2 }) },
  { minutes: 60 * 24, label: i18nText('Common.relative.daysAgoCompact', { days: 1 }) },
  { minutes: 60 * 24 * 2, label: i18nText('Common.relative.daysAgoCompact', { days: 2 }) },
  { minutes: 60 * 24 * 7, label: i18nText('Common.relative.weeksAgoCompact', { weeks: 1 }) },
];

export function parseRecurrenceRule(raw: string | null): TodoRecurrenceRule | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TodoRecurrenceRule;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.preset) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeRecurrenceRule(rule: TodoRecurrenceRule | null): string | null {
  if (!rule) return null;
  return JSON.stringify(rule);
}

export function describeRecurrenceRule(rule: TodoRecurrenceRule | null): string {
  if (!rule) return '';
  switch (rule.preset) {
    case 'daily':
      return i18nText('TodoRecurrence.preset.daily');
    case 'weekly':
      return i18nText('TodoRecurrence.preset.weekly');
    case 'monthly':
      return i18nText('TodoRecurrence.preset.monthly');
    case 'yearly':
      return i18nText('TodoRecurrence.preset.yearly');
    case 'custom': {
      const interval = Math.max(1, rule.interval ?? 1);
      const unit = rule.unit ?? 'day';
      const recurrenceUnitLabel = unitLabel(unit, interval);
      const base = interval === 1
        ? i18nText('TodoRecurrence.custom.everyUnit', { unit: recurrenceUnitLabel })
        : i18nText('TodoRecurrence.custom.everyIntervalUnit', { interval, unit: recurrenceUnitLabel });
      if (unit === 'week' && rule.weekdays && rule.weekdays.length > 0) {
        const days = [...rule.weekdays]
          .sort((a, b) => a - b)
          .map((d) => i18nText('TodoRecurrence.weekday.prefixed', {
            day: WEEKDAY_LABELS[d] ?? i18nText('TodoRecurrence.weekday.unknown'),
          }))
          .join(i18nText('Common.list.separator'));
        return i18nText('TodoRecurrence.custom.weekdays', { base, days });
      }
      return base;
    }
    default:
      return i18nText('TodoRecurrence.fallback');
  }
}

export function describeReminderOffset(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '';
  const preset = REMINDER_OFFSET_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return i18nText('Common.relative.minutesAgoCompact', { minutes });
  if (minutes < 60 * 24) return i18nText('Common.relative.hoursAgoCompact', { hours: Math.round(minutes / 60) });
  const days = Math.round(minutes / (60 * 24));
  return i18nText('Common.relative.daysAgoCompact', { days });
}

function unitLabel(unit: TodoRecurrenceUnit, count: number): string {
  switch (unit) {
    case 'day': return i18nText('TodoRecurrence.unit.day', { count });
    case 'week': return i18nText('TodoRecurrence.unit.week', { count });
    case 'month': return i18nText('TodoRecurrence.unit.month', { count });
    case 'year': return i18nText('TodoRecurrence.unit.year', { count });
    default: return i18nText('TodoRecurrence.unit.day', { count });
  }
}

/**
 * Compute the next dueDate (ISO yyyy-mm-dd) after the current occurrence completes.
 * For "weekly + weekdays" rules, advances to the next selected weekday.
 * For simple presets, adds the preset's interval. Returns null if no valid previous
 * dueDate + rule combination can produce a next date.
 */
export function computeNextDueDate(
  currentDueDate: string | null,
  rule: TodoRecurrenceRule | null,
  referenceNow: Date = new Date(),
): string | null {
  if (!rule) return null;
  const base = parseIsoDate(currentDueDate) ?? startOfLocalDay(referenceNow);

  switch (rule.preset) {
    case 'daily':
      return formatIsoDate(addDays(base, 1));
    case 'weekly':
      return formatIsoDate(addDays(base, 7));
    case 'monthly':
      return formatIsoDate(addMonths(base, 1));
    case 'yearly':
      return formatIsoDate(addMonths(base, 12));
    case 'custom': {
      const interval = Math.max(1, rule.interval ?? 1);
      const unit = rule.unit ?? 'day';
      if (unit === 'week' && rule.weekdays && rule.weekdays.length > 0) {
        return formatIsoDate(advanceToNextSelectedWeekday(base, rule.weekdays, interval));
      }
      switch (unit) {
        case 'day':   return formatIsoDate(addDays(base, interval));
        case 'week':  return formatIsoDate(addDays(base, interval * 7));
        case 'month': return formatIsoDate(addMonths(base, interval));
        case 'year':  return formatIsoDate(addMonths(base, interval * 12));
      }
      return null;
    }
    default:
      return null;
  }
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function addMonths(d: Date, months: number): Date {
  const year = d.getFullYear();
  const month = d.getMonth() + months;
  const day = d.getDate();
  const target = new Date(year, month, day);
  if (target.getMonth() !== ((month % 12) + 12) % 12) {
    return new Date(target.getFullYear(), target.getMonth(), 0);
  }
  return target;
}

function advanceToNextSelectedWeekday(base: Date, weekdays: number[], interval: number): Date {
  const sorted = [...new Set(weekdays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  const firstDayNextBlock = sorted[0];
  if (firstDayNextBlock === undefined) return addDays(base, interval * 7);
  const currentDay = base.getDay();
  const nextInWeek = sorted.find((d) => d > currentDay);
  if (nextInWeek !== undefined) {
    return addDays(base, nextInWeek - currentDay);
  }
  const daysToJump = 7 * interval - currentDay + firstDayNextBlock;
  return addDays(base, daysToJump);
}

export function combineDateAndReminderOffset(
  dueDate: string | null,
  reminderOffsetMinutes: number | null,
  assumedTimeHHMM = '09:00',
): Date | null {
  if (!dueDate || reminderOffsetMinutes === null || reminderOffsetMinutes === undefined) return null;
  const [hh, mm] = assumedTimeHHMM.split(':').map(Number);
  const base = parseIsoDate(dueDate);
  if (!base) return null;
  const due = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh || 0, mm || 0, 0, 0);
  return new Date(due.getTime() - reminderOffsetMinutes * 60 * 1000);
}
