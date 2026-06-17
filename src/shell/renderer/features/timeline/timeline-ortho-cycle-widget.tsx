import { Link } from 'react-router-dom';
import type { OrthoCycleSummary } from './timeline-data-types.js';
import { i18nText } from '../../i18n/index.js';


/**
 * Compact cycle-progress widget for the dashboard right rail. Renders only
 * for an active clear-aligner appliance with a known daysPerAligner. Shows
 * tray N/M + a daysPerAligner-segment progress bar + status line keyed off
 * `daysUntilSwitch` (still wearing / today's the day / overdue / final tray).
 *
 * Calendar-based projection (anchor + daysPerAligner). The orthodontic page
 * surfaces the precise net-wear view via `computeCycleProgress`.
 */
export function OrthoCycleProgressWidget({ cycle }: { cycle: OrthoCycleSummary }) {
  const segments = cycle.daysPerAligner;
  const filledRaw = cycle.daysSinceAnchor;
  const filled = Math.max(0, Math.min(segments, filledRaw));
  const overdueDays = filledRaw > segments ? filledRaw - segments : 0;
  const status = (() => {
    if (cycle.isFinalAligner && cycle.daysUntilSwitch <= 0) {
      return { tone: 'final' as const, text: i18nText('Timeline.orthoCycle.status.final') };
    }
    if (overdueDays > 0) {
      return { tone: 'overdue' as const, text: i18nText('Timeline.orthoCycle.status.overdue', { days: overdueDays }) };
    }
    if (cycle.daysUntilSwitch === 0) {
      return { tone: 'due' as const, text: i18nText('Timeline.orthoCycle.status.dueToday') };
    }
    if (cycle.daysUntilSwitch === 1) {
      return { tone: 'soon' as const, text: i18nText('Timeline.orthoCycle.status.dueTomorrow') };
    }
    return {
      tone: 'normal' as const,
      text: i18nText('Timeline.orthoCycle.status.remaining', {
        days: cycle.daysUntilSwitch,
        predictedDate: cycle.predictedSwitchDate,
      }),
    };
  })();
  const accent = (() => {
    switch (status.tone) {
      case 'overdue':
        return '#d97706';
      case 'due':
        return '#15803d';
      case 'soon':
        return '#0ea5e9';
      case 'final':
        return '#7c3aed';
      default:
        return '#475569';
    }
  })();

  return (
    <Link
      to="/profile/dental?tab=orthodontic"
      className="mx-2 mb-3 block rounded-[14px] px-3 py-3 transition-colors hover:bg-white"
      style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(226,232,240,0.7)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold tracking-[0.04em]" style={{ color: '#1e293b' }}>
          {i18nText('Timeline.orthoCycle.trayProgress', { current: cycle.currentAlignerIndex, total: cycle.totalAligners })}
        </span>
        <span className="text-[11px]" style={{ color: '#64748b' }}>
          {i18nText('Timeline.orthoCycle.dayProgress', { filled, total: segments })}
        </span>
      </div>
      <div className="mt-2 flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: segments }, (_, idx) => {
          const isFilled = idx < filled;
          return (
            <span
              key={idx}
              className="h-[6px] flex-1 rounded-full"
              style={{
                background: isFilled ? 'var(--nimi-status-success)' : 'rgba(148,163,184,0.25)',
                opacity: isFilled ? 0.95 : 1,
              }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[12px]" style={{ color: accent, fontWeight: 500 }}>
        {status.text}
      </p>
    </Link>
  );
}
