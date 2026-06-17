/**
 * Per-appliance "next action" projection for the multi-appliance surface.
 *
 * Each appliance has one forward-looking action keyed off its type:
 *   - clear-aligner → predicted switch date (PO-ORTHO-008)
 *   - expander      → next activation date (PO-ORTHO-014)
 *   - everything else → appliance.nextReviewDate
 *
 * Hero cards externalise this into `appliance-next-action-row`; the full-width
 * compact card embeds it inline. The agenda detail line is parent-entered
 * (`nextReviewAgenda`, PO-ORTHO-015) — never inferred.
 */
import type {
  OrthodonticApplianceRow,
  OrthodonticCheckinRow,
  OrthodonticUnwearIntervalRow,
} from '../../bridge/sqlite-bridge.js';
import {
  computeCycleProgress,
  computeExpanderActivationProjection,
} from './orthodontic-derive.js';
import { i18nText } from '../../i18n/index.js';


export type ApplianceNextActionKind = 'switch-aligner' | 'log-activation' | 'log-review';

export interface ApplianceNextAction {
  /** Localized next-action label. */
  label: string;
  /** yyyy-mm-dd, or null when there is no projected date. */
  date: string | null;
  /** Whole days from today; negative = overdue; null when no date. */
  daysAway: number | null;
  /** Secondary line — cadence / shift hint / parent-entered agenda. */
  detail: string | null;
  /** Button label for the inline / row action. */
  actionLabel: string;
  actionKind: ApplianceNextActionKind;
}

function daysBetween(targetYmd: string, nowIso: string): number {
  // Calendar-day diff in UTC: how many wall days from today to target. The
  // earlier `Math.round((target − now) / 24h)` form mixed midnight-target
  // with wall-clock-now, so a target on day+2 read as "1 day" whenever it
  // was already past noon (35h / 24 = 1.46 → round 1). The home dashboard's
  // `deriveOrthoCycle` uses the same calendar-day model — keeping them
  // aligned is what makes next-switch days-away consistent across surfaces.
  const targetMs = Date.UTC(
    Number(targetYmd.slice(0, 4)),
    Number(targetYmd.slice(5, 7)) - 1,
    Number(targetYmd.slice(8, 10)),
  );
  const now = new Date(nowIso);
  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function computeApplianceNextAction(params: {
  appliance: OrthodonticApplianceRow;
  intervals: OrthodonticUnwearIntervalRow[];
  checkins: OrthodonticCheckinRow[];
  nowIso: string;
}): ApplianceNextAction {
  const { appliance, intervals, checkins, nowIso } = params;

  if (appliance.applianceType === 'clear-aligner') {
    const cycle = computeCycleProgress({
      appliance,
      intervals,
      alignerChangeCheckins: checkins,
      nowIso,
    });
    const date = cycle.predictedSwitchDate.slice(0, 10);
    // On-schedule (daysShifted === 0) renders no detail line — the date +
    // days-away pill already convey "you're on track", and the redundant
    // on-schedule word felt like editorialising for the common-case parent.
    const detail =
      cycle.daysShifted > 0
        ? i18nText('Orthodontic.nextAction.shiftDelayed', { days: cycle.daysShifted })
        : cycle.daysShifted < 0
          ? i18nText('Orthodontic.nextAction.shiftEarly', { days: -cycle.daysShifted })
          : null;
    return {
      label: i18nText('Orthodontic.nextAction.switchAligner'),
      date,
      daysAway: daysBetween(date, nowIso),
      detail,
      actionLabel: i18nText('Orthodontic.nextAction.switchAlignerAction'),
      actionKind: 'switch-aligner',
    };
  }

  if (appliance.applianceType === 'expander') {
    const proj = computeExpanderActivationProjection({
      appliance,
      activationCheckins: checkins,
      nowIso,
    });
    const cadence = appliance.activationIntervalDays ?? 1;
    return {
      label: i18nText('Orthodontic.nextAction.logActivation'),
      date: proj.nextActivationDate,
      daysAway: proj.nextActivationDate ? daysBetween(proj.nextActivationDate, nowIso) : null,
      detail: proj.isComplete
        ? i18nText('Orthodontic.ring.activationCompleteFooter')
        : i18nText('Orthodontic.nextAction.activationCadence', { days: cadence }),
      actionLabel: i18nText('Orthodontic.nextAction.logActivationAction'),
      actionKind: 'log-activation',
    };
  }

  return {
    label: i18nText('Orthodontic.nextAction.review'),
    date: appliance.nextReviewDate,
    daysAway: appliance.nextReviewDate
      ? daysBetween(appliance.nextReviewDate, nowIso)
      : null,
    detail: appliance.nextReviewAgenda,
    actionLabel: i18nText('Orthodontic.nextAction.logReviewAction'),
    actionKind: 'log-review',
  };
}
