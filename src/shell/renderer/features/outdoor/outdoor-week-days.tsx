import { i18nText } from '../../i18n/index.js';
import { formatDayLabel, type DailyBreakdown } from './outdoor-helpers.js';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

// Eight short rays, drawn once a day reaches its share of the weekly goal.
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  return {
    x1: 20 + Math.cos(angle) * 14.5,
    y1: 20 + Math.sin(angle) * 14.5,
    x2: 20 + Math.cos(angle) * 18.5,
    y2: 20 + Math.sin(angle) * 18.5,
  };
});

/**
 * One sun per day of the week. A sun grows with that day's outdoor minutes
 * and gains rays at the daily share of the goal; a day without a record is a
 * dashed ring that turns into "+" on hover. Tapping a past day or today logs
 * time for that date; future days are inert.
 */
export function OutdoorWeekDays({ days, dailyTarget, todayStr, onSelectDay, className = '' }: {
  days: DailyBreakdown[];
  dailyTarget: number;
  todayStr: string;
  onSelectDay: (date: string) => void;
  className?: string;
}) {
  return (
    <ol aria-label={i18nText('Outdoor.page.tracker.days.aria')} className={`grid grid-cols-7 gap-1 ${className}`}>
      {days.map((day) => {
        const isToday = day.date === todayStr;
        const isFuture = day.date > todayStr;
        const ratio = dailyTarget > 0 ? day.minutes / dailyTarget : 0;
        const date = formatDayLabel(day.date);
        const label = isFuture
          ? i18nText('Outdoor.page.tracker.days.future', { date })
          : day.minutes > 0
            ? i18nText('Outdoor.page.tracker.days.logged', { date, minutes: day.minutes })
            : i18nText('Outdoor.page.tracker.days.empty', { date });

        return (
          <li key={day.date} className="min-w-0">
            <button
              type="button"
              disabled={isFuture}
              onClick={() => onSelectDay(day.date)}
              aria-label={label}
              title={label}
              aria-current={isToday ? 'date' : undefined}
              className={`group flex w-full cursor-pointer flex-col items-center gap-1 rounded-2xl pb-2 pt-2 transition-[background-color,box-shadow] duration-150 disabled:cursor-default ${FOCUS_RING} ${isToday
                ? 'bg-white/80 shadow-[0_12px_28px_-20px_rgba(34,94,160,0.7)] ring-1 ring-white'
                : 'hover:bg-white/50 disabled:hover:bg-transparent'}`}
            >
              <span className={`text-[12px] leading-4 ${isToday
                ? 'font-semibold text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_84%,var(--nimi-text-primary))]'
                : isFuture ? 'text-[color-mix(in_srgb,var(--nimi-text-muted)_70%,transparent)]' : 'text-[var(--nimi-text-muted)]'}`}
              >
                {isToday ? i18nText('Outdoor.page.tracker.days.today') : day.weekday}
              </span>
              <DaySun ratio={ratio} future={isFuture} />
              <span className={`text-[12px] leading-4 tabular-nums ${day.minutes > 0
                ? 'font-semibold text-[#9a5b06]'
                : 'text-[color-mix(in_srgb,var(--nimi-text-muted)_70%,transparent)]'}`}
              >
                {day.minutes > 0 ? day.minutes : '–'}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The sun glyph alone, for the legend under the strip. */
export function FullSunGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return <DaySun ratio={1} future={false} className={className} />;
}

function DaySun({ ratio, future, className = 'h-10 w-10' }: { ratio: number; future: boolean; className?: string }) {
  if (ratio <= 0) {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
        <circle
          cx="20"
          cy="20"
          r="10.5"
          strokeWidth="1.5"
          strokeDasharray="2.6 3.4"
          strokeLinecap="round"
          className={future
            ? 'fill-none stroke-[color-mix(in_srgb,var(--nimi-text-muted)_24%,transparent)]'
            : 'fill-white/60 stroke-[color-mix(in_srgb,var(--nimi-text-muted)_45%,transparent)] transition-[stroke] duration-150 group-hover:stroke-[var(--nimi-action-primary-bg)] group-focus-visible:stroke-[var(--nimi-action-primary-bg)]'}
        />
        {future ? null : (
          <path
            d="M20 16v8M16 20h8"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="fill-none stroke-[var(--nimi-action-primary-bg)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </svg>
    );
  }

  const full = ratio >= 1;
  // Area tracks minutes (radius ∝ √ratio), from a small dot up to the full disc.
  const radius = 5 + 6 * Math.sqrt(Math.min(1, ratio));
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={`overflow-visible ${className}`}>
      <circle cx="20" cy="20" r={radius + 3.5} className="fill-[#ffe6a0] opacity-70" />
      {full
        ? RAYS.map((ray, i) => (
          <line key={i} {...ray} strokeWidth="2.2" strokeLinecap="round" className="stroke-[#f7ab2a]" />
        ))
        : null}
      <circle cx="20" cy="20" r={radius} className="fill-[#ffc23d]" />
    </svg>
  );
}
