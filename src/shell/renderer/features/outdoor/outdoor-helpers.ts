import type { OutdoorRecordRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';

// ── Week boundary helpers (ISO week: Monday = day 1) ──────

/** Return YYYY-MM-DD of the Monday for the week containing `date`. */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon…6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return fmtDate(d);
}

/** Days remaining in the current week *including* today (1–7). */
export function getRemainingDaysInWeek(date: Date): number {
  const day = date.getDay(); // 0=Sun
  return day === 0 ? 1 : 8 - day;
}

/** Shift a week start string by N weeks (negative = past). */
export function shiftWeek(weekStart: string, weeks: number): string {
  const d = parseDate(weekStart);
  d.setDate(d.getDate() + weeks * 7);
  return fmtDate(d);
}

export function formatWeekRange(weekStart: string): string {
  const start = parseDate(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    i18nText('Outdoor.date.shortMonthDay', {
      month: d.getMonth() + 1,
      day: d.getDate(),
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

const WEEKDAY_LABEL_KEYS = [
  'Outdoor.date.weekday.sun',
  'Outdoor.date.weekday.mon',
  'Outdoor.date.weekday.tue',
  'Outdoor.date.weekday.wed',
  'Outdoor.date.weekday.thu',
  'Outdoor.date.weekday.fri',
  'Outdoor.date.weekday.sat',
] as const;
export function weekdayLabel(date: Date): string {
  return i18nText(WEEKDAY_LABEL_KEYS[date.getDay()]!);
}

// ── Week summary computation ─────────────────────────────

export interface DailyBreakdown {
  date: string;
  weekday: string;
  minutes: number;
}

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  dailyBreakdown: DailyBreakdown[];
  goalMinutes: number;
  remainingMinutes: number;
  remainingDays: number;
  pacePerDay: number;
  isComplete: boolean;
  overMinutes: number;
}

export function computeWeekSummary(
  records: OutdoorRecordRow[],
  goalMinutes: number,
  weekStart: string,
  today?: string,
): WeekSummary {
  const weekEndDate = parseDate(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEndStr = fmtDate(weekEndDate);

  // Build daily breakdown for all 7 days
  const dailyMinutes = new Map<string, number>();
  for (const r of records) {
    if (r.activityDate >= weekStart && r.activityDate <= weekEndStr) {
      dailyMinutes.set(r.activityDate, (dailyMinutes.get(r.activityDate) ?? 0) + r.durationMinutes);
    }
  }

  const breakdown: DailyBreakdown[] = [];
  const startDate = parseDate(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = fmtDate(d);
    breakdown.push({
      date: dateStr,
      weekday: weekdayLabel(d),
      minutes: dailyMinutes.get(dateStr) ?? 0,
    });
  }

  const totalMinutes = breakdown.reduce((sum, d) => sum + d.minutes, 0);
  const remainingMinutes = Math.max(0, goalMinutes - totalMinutes);
  const overMinutes = Math.max(0, totalMinutes - goalMinutes);
  const isComplete = totalMinutes >= goalMinutes;

  // Remaining days: if today is within this week, count from today to Sunday inclusive
  const todayStr = today ?? fmtDate(new Date());
  let remainingDays: number;
  if (todayStr < weekStart) {
    remainingDays = 7; // future week
  } else if (todayStr > weekEndStr) {
    remainingDays = 0; // past week
  } else {
    const todayDate = parseDate(todayStr);
    remainingDays = getRemainingDaysInWeek(todayDate);
  }

  const pacePerDay = remainingDays > 0 ? Math.ceil(remainingMinutes / remainingDays) : 0;

  return {
    weekStart,
    weekEnd: weekEndStr,
    totalMinutes,
    dailyBreakdown: breakdown,
    goalMinutes,
    remainingMinutes,
    remainingDays,
    pacePerDay,
    isComplete,
    overMinutes,
  };
}

/** Compute summaries for the most recent N weeks ending with the current week. */
export function computeRecentWeeks(
  records: OutdoorRecordRow[],
  goalMinutes: number,
  count: number,
  today?: string,
): WeekSummary[] {
  const todayStr = today ?? fmtDate(new Date());
  const currentWeekStart = getWeekStart(parseDate(todayStr));
  const weeks: WeekSummary[] = [];
  for (let i = 0; i < count; i++) {
    const ws = shiftWeek(currentWeekStart, -i);
    weeks.push(computeWeekSummary(records, goalMinutes, ws, todayStr));
  }
  return weeks;
}

// ── Supportive messaging ─────────────────────────────────

export type OutdoorMessageType =
  | 'empty'
  | 'in-progress-on-track'
  | 'in-progress-behind'
  | 'complete'
  | 'over-complete'
  | 'past-complete'
  | 'past-incomplete';

export interface OutdoorMessage {
  type: OutdoorMessageType;
  primary: string;
  secondary: string;
}

export function buildOutdoorMessage(summary: WeekSummary, isPastWeek: boolean): OutdoorMessage {
  if (isPastWeek) {
    if (summary.isComplete) {
      return {
        type: 'past-complete',
        primary: i18nText('Outdoor.weekMessage.pastCompletePrimary', { minutes: summary.totalMinutes }),
        secondary: summary.overMinutes > 0
          ? i18nText('Outdoor.weekMessage.overTarget', { minutes: summary.overMinutes })
          : i18nText('Outdoor.weekMessage.justMetGoal'),
      };
    }
    return {
      type: 'past-incomplete',
      primary: i18nText('Outdoor.weekMessage.pastIncompletePrimary', {
        total: summary.totalMinutes,
        goal: summary.goalMinutes,
      }),
      secondary: i18nText('Outdoor.weekMessage.remainingMinutes', { minutes: summary.remainingMinutes }),
    };
  }

  if (summary.totalMinutes === 0) {
    return {
      type: 'empty',
      primary: i18nText('Outdoor.weekMessage.emptyPrimary'),
      secondary: i18nText('Outdoor.weekMessage.emptySecondary'),
    };
  }

  if (summary.isComplete) {
    if (summary.overMinutes > 0) {
      return {
        type: 'over-complete',
        primary: i18nText('Outdoor.weekMessage.completePrimary', { minutes: summary.totalMinutes }),
        secondary: i18nText('Outdoor.weekMessage.overTarget', { minutes: summary.overMinutes }),
      };
    }
    return {
      type: 'complete',
      primary: i18nText('Outdoor.weekMessage.completePrimary', { minutes: summary.totalMinutes }),
      secondary: i18nText('Outdoor.weekMessage.keepGoing'),
    };
  }

  // In progress — check pace
  const progress = summary.totalMinutes / summary.goalMinutes;
  const expectedProgress = summary.remainingDays < 7 ? (7 - summary.remainingDays) / 7 : 0;
  const isOnTrack = progress >= expectedProgress * 0.8; // 80% of expected pace counts as on-track

  if (isOnTrack) {
    return {
      type: 'in-progress-on-track',
      primary: i18nText('Outdoor.weekMessage.onTrackPrimary', { minutes: summary.totalMinutes }),
      secondary: i18nText('Outdoor.weekMessage.stillNeeds', { minutes: summary.remainingMinutes }),
    };
  }

  // Behind pace
  if (summary.remainingDays <= 2) {
    return {
      type: 'in-progress-behind',
      primary: i18nText('Outdoor.weekMessage.behindPrimary', {
        total: summary.totalMinutes,
        remaining: summary.remainingMinutes,
      }),
      secondary: i18nText('Outdoor.weekMessage.remainingDaysPlan', { days: summary.remainingDays }),
    };
  }

  return {
    type: 'in-progress-behind',
    primary: i18nText('Outdoor.weekMessage.behindPrimary', {
      total: summary.totalMinutes,
      remaining: summary.remainingMinutes,
    }),
    secondary: i18nText('Outdoor.weekMessage.pacePlan', {
      days: summary.remainingDays,
      pace: summary.pacePerDay,
    }),
  };
}

// ── Date utilities ───────────────────────────────────────

export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function formatShortDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** "9月28日 周一" — a day as the tracker names it. */
export function formatDayLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  const monthDay = i18nText('Outdoor.date.shortMonthDay', { month: d.getMonth() + 1, day: d.getDate() });
  return `${monthDay} ${weekdayLabel(d)}`;
}

export const DEFAULT_OUTDOOR_GOAL_MINUTES = 630;

/** One goal-stepper tap: ten minutes more (or fewer) outdoors a day. */
export const OUTDOOR_GOAL_STEP_MINUTES = 7 * 10;

/** A weekly goal can't hold more minutes than the week has. */
export const MAX_OUTDOOR_GOAL_MINUTES = 7 * 24 * 60;

/** Goal quick picks as minutes outdoors per day; the goal itself is stored per week. */
export const OUTDOOR_GOAL_DAILY_PRESETS = [60, 90, 120] as const;

/**
 * The weekly goal one stepper tap away. A hand-typed goal off the step grid
 * snaps to the next grid value in the tap's direction; at either bound the
 * goal comes back unchanged.
 */
export function stepOutdoorGoalMinutes(minutes: number, direction: 1 | -1): number {
  const step = OUTDOOR_GOAL_STEP_MINUTES;
  const next = direction > 0
    ? (Math.floor(minutes / step) + 1) * step
    : (Math.ceil(minutes / step) - 1) * step;
  const clamped = Math.min(MAX_OUTDOOR_GOAL_MINUTES, Math.max(step, next));
  // Clamping must never move the goal against the tap (e.g. "−" below one step).
  return direction > 0 ? Math.max(minutes, clamped) : Math.min(minutes, clamped);
}

/** Quick-select duration presets in minutes. */
export const DURATION_PRESETS = [30, 60, 90, 120] as const;

/** Duration a new record starts from before the parent adjusts it. */
export const DEFAULT_RECORD_MINUTES = 60;

/** One duration-stepper tap. */
export const RECORD_STEP_MINUTES = 10;

/** A single record can't hold more minutes than the day has. */
export const MAX_RECORD_MINUTES = 24 * 60;

/**
 * The record duration one stepper tap away. Like the goal stepper, a
 * hand-typed value off the step grid snaps to the next grid value in the
 * tap's direction, and the bounds hand the value back unchanged.
 */
export function stepRecordMinutes(minutes: number, direction: 1 | -1): number {
  const step = RECORD_STEP_MINUTES;
  const next = direction > 0
    ? (Math.floor(minutes / step) + 1) * step
    : (Math.ceil(minutes / step) - 1) * step;
  const clamped = Math.min(MAX_RECORD_MINUTES, Math.max(step, next));
  return direction > 0 ? Math.max(minutes, clamped) : Math.min(minutes, clamped);
}

/** "45 分钟" below an hour, "1.5 小时" on the half hour, "75 分钟" otherwise. */
export function formatOutdoorDuration(minutes: number): string {
  return minutes >= 60 && minutes % 30 === 0
    ? i18nText('Outdoor.page.duration.hours', { hours: minutes / 60 })
    : i18nText('Outdoor.page.duration.minutes', { minutes });
}

/** The weekly goal spread evenly over seven days, as the day suns measure it. */
export function dailyTargetMinutes(goalMinutes: number): number {
  return Math.round(goalMinutes / 7);
}

/** How many recent weeks the trend strip shows, current week included. */
export const OUTDOOR_TREND_WEEKS = 12;
