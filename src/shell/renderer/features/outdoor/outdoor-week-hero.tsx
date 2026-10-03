import { Button } from '@nimiplatform/kit/ui';
import { ArrowRight, ChevronLeft, ChevronRight, Plus, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { i18nText } from '../../i18n/index.js';
import { HERO_ACCENT_TEXT, HERO_CTA_CLASS } from './outdoor-goal-onboarding.js';
import {
  dailyTargetMinutes,
  formatWeekRange,
  type OutdoorMessage,
  type OutdoorMessageType,
  type WeekSummary,
} from './outdoor-helpers.js';
import { FullSunGlyph, OutdoorWeekDays } from './outdoor-week-days.js';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

type StatusKey = 'empty' | 'onTrack' | 'behind' | 'complete' | 'pastIncomplete';

const STATUS_BY_MESSAGE: Record<OutdoorMessageType, StatusKey> = {
  empty: 'empty',
  'in-progress-on-track': 'onTrack',
  'in-progress-behind': 'behind',
  complete: 'complete',
  'over-complete': 'complete',
  'past-complete': 'complete',
  'past-incomplete': 'pastIncomplete',
};

const STATUS_CHIP_CLASS: Record<StatusKey, string> = {
  empty: 'bg-white/80 text-[var(--nimi-text-secondary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-text-primary)_8%,transparent)]',
  pastIncomplete: 'bg-white/80 text-[var(--nimi-text-secondary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-text-primary)_8%,transparent)]',
  onTrack: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_16%,white)] text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_62%,var(--nimi-text-primary))]',
  behind: 'bg-[#fff0cc] text-[#9a5b06]',
  complete: 'bg-[#ffe39a] text-[#7c4a02]',
};

/**
 * Top of the weekly outdoor tracker's main column: the week switcher, the
 * running total against the goal, a status line, one sun per day, and the
 * day's main action. The illustration sits beside it in the side column
 * (`OutdoorWeekScene`).
 */
export function OutdoorWeekHero({
  summary,
  message,
  todayStr,
  isCurrentWeek,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  onLogDay,
  onLogToday,
  onBackfill,
  onChangeGoal,
}: {
  summary: WeekSummary;
  message: OutdoorMessage;
  todayStr: string;
  isCurrentWeek: boolean;
  onPreviousWeek: () => void;
  /** Omitted on the current week: there is nothing ahead to show. */
  onNextWeek?: () => void;
  onThisWeek: () => void;
  onLogDay: (date: string) => void;
  onLogToday: () => void;
  onBackfill: () => void;
  onChangeGoal: () => void;
}) {
  const percent = Math.min(100, Math.round((summary.totalMinutes / summary.goalMinutes) * 100));
  const dailyTarget = dailyTargetMinutes(summary.goalMinutes);
  const status = STATUS_BY_MESSAGE[message.type];

  return (
    <div className="min-w-0">
      <Link to="/profile" className="text-[14px] text-[var(--nimi-text-muted)] hover:underline">
        {i18nText('Outdoor.page.backToProfile')}
      </Link>

      <div className="parentos-onboarding-enter-left mt-8 flex flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className={`text-[14px] font-semibold ${HERO_ACCENT_TEXT}`}>
            {isCurrentWeek ? i18nText('Outdoor.page.tracker.thisWeek') : i18nText('Outdoor.page.tracker.pastWeek')}
          </p>
          <div className="flex items-center rounded-full bg-white/80 p-1 shadow-[0_6px_16px_-12px_rgba(34,94,160,0.5),inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-text-primary)_6%,transparent)]">
            <WeekStepButton label={i18nText('Outdoor.page.tracker.previousWeek')} onClick={onPreviousWeek}>
              <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
            </WeekStepButton>
            <span className="px-2 text-[14px] font-semibold tabular-nums text-[var(--nimi-text-primary)]">
              {formatWeekRange(summary.weekStart)}
            </span>
            <WeekStepButton label={i18nText('Outdoor.page.tracker.nextWeek')} onClick={onNextWeek}>
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </WeekStepButton>
          </div>
          {isCurrentWeek ? null : (
            <button
              type="button"
              onClick={onThisWeek}
              className={`cursor-pointer rounded-full text-[13px] font-medium ${HERO_ACCENT_TEXT} hover:underline ${FOCUS_RING}`}
            >
              {i18nText('Outdoor.page.tracker.backToThisWeek')}
            </button>
          )}
        </div>

        <p className="mt-3.5 flex items-baseline gap-2.5 text-[var(--nimi-text-primary)]">
          <span className="text-[64px] font-bold leading-none tracking-[-0.02em] tabular-nums">{summary.totalMinutes}</span>
          <span className="text-[18px] text-[var(--nimi-text-muted)]">
            {i18nText('Outdoor.page.tracker.ofGoal', { minutes: summary.goalMinutes })}
          </span>
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={i18nText('Outdoor.page.progressAriaLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/75 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-text-primary)_7%,transparent)]"
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#ffd978,#ffb42e)] transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-10 text-right text-[13px] font-medium tabular-nums text-[var(--nimi-text-secondary)]">{percent}%</span>
        </div>

        <p className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-6 text-[var(--nimi-text-secondary)]">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${STATUS_CHIP_CLASS[status]}`}>
            {status === 'complete' ? <Sun size={13} strokeWidth={2.4} aria-hidden="true" /> : null}
            {i18nText(`Outdoor.page.tracker.status.${status}`)}
          </span>
          <span>{message.secondary}</span>
        </p>

        <OutdoorWeekDays
          days={summary.dailyBreakdown}
          dailyTarget={dailyTarget}
          todayStr={todayStr}
          onSelectDay={onLogDay}
          className="-mx-1 mt-7"
        />
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[var(--nimi-text-muted)]">
          <FullSunGlyph className="h-4 w-4 shrink-0" />
          {i18nText('Outdoor.page.tracker.days.legend', { minutes: dailyTarget })}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          {isCurrentWeek ? (
            <Button
              tone="primary"
              size="lg"
              onClick={onLogToday}
              trailingIcon={<ArrowRight size={18} strokeWidth={2} aria-hidden="true" />}
              className={HERO_CTA_CLASS}
            >
              {i18nText('Outdoor.page.tracker.logToday')}
            </Button>
          ) : (
            <Button
              tone="secondary"
              size="lg"
              onClick={onBackfill}
              leadingIcon={<Plus size={17} strokeWidth={2} aria-hidden="true" />}
              className="min-h-11 rounded-full px-5 text-[15px] font-medium"
            >
              {i18nText('Outdoor.page.tracker.backfill')}
            </Button>
          )}
          <button
            type="button"
            onClick={onChangeGoal}
            className={`group cursor-pointer rounded-full text-[13.5px] text-[var(--nimi-text-muted)] transition-colors hover:text-[var(--nimi-text-primary)] ${FOCUS_RING}`}
          >
            {i18nText('Outdoor.page.tracker.weeklyGoal', { minutes: summary.goalMinutes })}
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span className={`font-medium ${HERO_ACCENT_TEXT} group-hover:underline`}>{i18nText('Outdoor.page.tracker.changeGoal')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function WeekStepButton({ label, onClick, children }: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!onClick}
      onClick={onClick}
      className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--nimi-text-secondary)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)] hover:text-[var(--nimi-text-primary)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
