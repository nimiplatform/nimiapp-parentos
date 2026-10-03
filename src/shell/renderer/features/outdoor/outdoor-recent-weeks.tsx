import { Surface } from '@nimiplatform/kit/ui';
import { Plus } from 'lucide-react';
import { i18nText } from '../../i18n/index.js';
import { HERO_ACCENT_TEXT } from './outdoor-goal-onboarding.js';
import { formatWeekRange, parseDate, type WeekSummary } from './outdoor-helpers.js';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

// Height of the plot, baseline to top. The scale tops out a little above the
// goal or the best week, whichever is higher, so neither touches the edge.
const PLOT_HEIGHT_PX = 126;
const SCALE_HEADROOM = 1.08;

const GRID_LINE = 'border-[color-mix(in_srgb,var(--nimi-text-primary)_9%,transparent)]';

/** Month names go under the first week of each month, if the previous name left room. */
function axisLabels(weeks: WeekSummary[], currentWeekStart: string): Array<string | null> {
  let lastMonth = -1;
  let lastLabelAt = -2;
  return weeks.map((week, index) => {
    if (week.weekStart === currentWeekStart) return i18nText('Outdoor.page.tracker.trend.thisWeek');
    const month = parseDate(week.weekStart).getMonth();
    const startsMonth = month !== lastMonth;
    lastMonth = month;
    // Keep the slot beside "本周" clear so the two never collide.
    if (!startsMonth || index - lastLabelAt < 2 || index >= weeks.length - 2) return null;
    lastLabelAt = index;
    return i18nText('Outdoor.date.monthLabel', { month: month + 1 });
  });
}

/**
 * Weekly totals for the last few weeks against the goal line, as a card: the
 * header carries the backfill action, the title and how many weeks met the
 * goal. Weeks that met the goal glow sunny; each bar opens that week in the
 * tracker, so the chart doubles as week navigation.
 */
export function OutdoorRecentWeeks({ weeks, goalMinutes, currentWeekStart, selectedWeekStart, onSelectWeek, onAdd, className = '' }: {
  /** Oldest first, ending with the current week. */
  weeks: WeekSummary[];
  goalMinutes: number;
  currentWeekStart: string;
  selectedWeekStart: string;
  onSelectWeek: (weekStart: string) => void;
  /** Omitted when the selected week has no earlier day to fill in yet. */
  onAdd?: () => void;
  className?: string;
}) {
  const scaleMax = Math.max(goalMinutes, ...weeks.map((week) => week.totalMinutes)) * SCALE_HEADROOM;
  const percentOf = (minutes: number) => (minutes / scaleMax) * 100;
  const ticks = [goalMinutes, Math.round(goalMinutes / 2), 0];
  const metCount = weeks.filter((week) => week.isComplete).length;
  const labels = axisLabels(weeks, currentWeekStart);

  return (
    <Surface
      as="section"
      aria-labelledby="outdoor-trend-title"
      tone="card"
      material="glass-thick"
      elevation="base"
      padding="none"
      className={`min-w-0 rounded-[20px] ${className}`}
    >
      <header className={`grid min-h-[54px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b px-6 py-2 ${GRID_LINE}`}>
        <div className="min-w-0">
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className={`-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-full px-1 text-[14px] font-medium ${HERO_ACCENT_TEXT} hover:underline ${FOCUS_RING}`}
            >
              <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
              {i18nText('Outdoor.page.tracker.trend.add')}
            </button>
          ) : null}
        </div>
        <h3 id="outdoor-trend-title" className="text-center text-[16px] font-semibold text-[var(--nimi-text-primary)]">
          {i18nText('Outdoor.page.tracker.trend.title', { weeks: weeks.length })}
        </h3>
        <span className="min-w-0 text-right text-[13px] tabular-nums text-[var(--nimi-text-muted)]">
          {i18nText('Outdoor.page.tracker.trend.summary', { count: metCount })}
        </span>
      </header>

      <div className="px-6 pb-6 pt-5">
        <p aria-hidden="true" className="text-[12px] leading-4 text-[var(--nimi-text-muted)]">
          {i18nText('Outdoor.page.tracker.trend.unit')}
        </p>

        <div className="mt-2.5 flex" style={{ height: PLOT_HEIGHT_PX }}>
          <ol aria-hidden="true" className="relative w-9 shrink-0 text-[12px] leading-4 tabular-nums text-[var(--nimi-text-muted)]">
            {ticks.map((minutes) => (
              <li key={minutes} className="absolute right-2.5 translate-y-1/2" style={{ bottom: `${percentOf(minutes)}%` }}>
                {minutes}
              </li>
            ))}
          </ol>

          {/* The right gutter holds the goal label, clear of the bars. */}
          <div className="relative min-w-0 flex-1 pr-14">
            <div aria-hidden="true" className={`absolute inset-x-0 bottom-0 border-t ${GRID_LINE}`} />
            <div
              aria-hidden="true"
              className="absolute left-0 right-14 border-t border-dotted border-[color-mix(in_srgb,var(--nimi-text-primary)_10%,transparent)]"
              style={{ bottom: `${percentOf(goalMinutes / 2)}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute left-0 right-14 border-t border-dashed border-[color-mix(in_srgb,#f7ab2a_80%,transparent)]"
              style={{ bottom: `${percentOf(goalMinutes)}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute right-0 w-[52px] translate-y-1/2 whitespace-nowrap text-right text-[12px] font-semibold leading-4 tabular-nums text-[#b06a0a]"
              style={{ bottom: `${percentOf(goalMinutes)}%` }}
            >
              {i18nText('Outdoor.page.tracker.trend.goal', { minutes: goalMinutes })}
            </span>

            <ol className="relative flex h-full">
              {weeks.map((week) => {
                const selected = week.weekStart === selectedWeekStart;
                const range = formatWeekRange(week.weekStart);
                const label = week.isComplete
                  ? i18nText('Outdoor.page.tracker.trend.barMet', { range, minutes: week.totalMinutes })
                  : i18nText('Outdoor.page.tracker.trend.bar', { range, minutes: week.totalMinutes });
                return (
                  <li key={week.weekStart} className="relative flex h-full min-w-0 flex-1">
                    <span aria-hidden="true" className={`absolute inset-y-0 left-1/2 border-l border-dotted ${GRID_LINE}`} />
                    <button
                      type="button"
                      onClick={() => onSelectWeek(week.weekStart)}
                      aria-label={label}
                      aria-pressed={selected}
                      title={label}
                      className={`group relative flex h-full w-full cursor-pointer items-end justify-center rounded-[7px] ${FOCUS_RING}`}
                    >
                      <span
                        className={`w-[min(24px,62%)] rounded-[6px] transition-[filter] duration-150 group-hover:brightness-95 ${week.isComplete
                          ? 'bg-[linear-gradient(180deg,#ffd46a,#ffb42e)]'
                          : week.totalMinutes > 0
                            ? 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_36%,white)]'
                            : 'bg-[color-mix(in_srgb,var(--nimi-text-muted)_20%,transparent)]'} ${selected
                          ? 'shadow-[0_0_0_2px_var(--nimi-surface-card),0_0_0_3.5px_color-mix(in_srgb,var(--nimi-action-primary-bg)_84%,var(--nimi-text-primary))]'
                          : ''}`}
                        style={{ height: `max(4px, ${percentOf(week.totalMinutes)}%)` }}
                      />
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <ol aria-hidden="true" className="ml-9 mr-14 mt-3.5 flex text-[12px] leading-4 text-[var(--nimi-text-muted)]">
          {weeks.map((week, index) => (
            <li key={week.weekStart} className="relative h-4 min-w-0 flex-1">
              {labels[index] ? (
                <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${week.weekStart === currentWeekStart
                  ? 'font-semibold text-[var(--nimi-text-secondary)]'
                  : ''}`}
                >
                  {labels[index]}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </Surface>
  );
}
