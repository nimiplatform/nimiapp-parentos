/**
 * Ring-metric dispatch for the multi-appliance orthodontic surface.
 *
 * Every appliance card shows one progress ring, but the *metric* the ring
 * tracks depends on the appliance type and treatment context:
 *
 *   - clear-aligner            → PO-ORTHO-008 per-cycle continuous projection
 *   - expander (w/ prescribed) → PO-ORTHO-014 activation count
 *   - retention removables     → PO-ORTHO-008a daily net-wear view
 *   - everything else          → PO-ORTHO-013 phase month counter
 *
 * This module is the single place that decision is made; it produces a
 * uniform `ApplianceRingView` the `ApplianceRing` component renders verbatim.
 * Wording stays factual (PO-ORTHO-010) — no prescriptive verbs.
 */
import type {
  OrthodonticApplianceRow,
  OrthodonticCaseRow,
  OrthodonticCheckinRow,
  OrthodonticUnwearIntervalRow,
} from '../../bridge/sqlite-bridge.js';
import { applianceIdentity } from './appliance-identity.js';
import {
  applianceSupportsWearGap,
  computeAppliancePhaseProgress,
  computeCycleProgress,
  computeDailyNetWear,
  computeExpanderActivationProjection,
  computeOpenIntervalState,
} from './orthodontic-derive.js';
import { computeTreatmentRingCopy } from './orthodontic-treatment-ring-copy.js';
import { i18nText } from '../../i18n/index.js';


const UNWEAR_AMBER = '#f59e0b';

export type ApplianceRingView =
  | {
      kind: 'metric';
      /** Small caption above the number. */
      caption: string;
      /** Big center value. */
      value: string;
      /** Unit suffix next to the value. */
      unit: string;
      /** Optional mono footer line. */
      footer: string | null;
      /** 0..1 fill ratio, or null for an unfilled track. */
      ratio: number | null;
      /** Ring stroke colour. */
      accent: string;
    }
  | { kind: 'message'; message: string; accent: string };

/** Picks the ring metric for one appliance and renders it to a uniform view. */
export function computeApplianceRingView(params: {
  appliance: OrthodonticApplianceRow;
  caseRow: Pick<OrthodonticCaseRow, 'stage'>;
  intervals: OrthodonticUnwearIntervalRow[];
  checkins: OrthodonticCheckinRow[];
  nowIso: string;
}): ApplianceRingView {
  const { appliance, caseRow, intervals, checkins, nowIso } = params;
  const identityColor = applianceIdentity(appliance.applianceType).solid;
  const openState = applianceSupportsWearGap(appliance.applianceType)
    ? computeOpenIntervalState(intervals, nowIso)
    : { hasOpen: false, intervalId: null, startAt: null, ageHours: 0 };
  const accent = openState.hasOpen ? UNWEAR_AMBER : identityColor;

  // ── clear-aligner: PO-ORTHO-008 cycle projection ──────────────────────
  if (appliance.applianceType === 'clear-aligner') {
    const cycle = computeCycleProgress({
      appliance,
      intervals,
      alignerChangeCheckins: checkins,
      nowIso,
    });
    const copy = computeTreatmentRingCopy({ primaryAppliance: appliance, cycle, openState });
    if (copy.kind === 'cycle') {
      return {
        kind: 'metric',
        caption: copy.caption,
        value: copy.primaryNumber,
        unit: copy.unit,
        footer: copy.footer,
        ratio: Math.max(0, Math.min(1, cycle.cycleProgressRatio)),
        accent,
      };
    }
    return { kind: 'message', message: copy.message, accent };
  }

  // ── expander with a prescribed cap: PO-ORTHO-014 activation count ─────
  if (appliance.applianceType === 'expander' && appliance.prescribedActivations !== null) {
    const proj = computeExpanderActivationProjection({
      appliance,
      activationCheckins: checkins,
      nowIso,
    });
    return {
      kind: 'metric',
      caption: proj.isComplete ? i18nText('Orthodontic.ring.expanderComplete') : i18nText('Orthodontic.ring.expanderProgress'),
      value: String(proj.completedActivations),
      unit: i18nText('Orthodontic.ring.activationUnit', { total: proj.prescribedActivations }),
      footer: proj.isComplete
        ? i18nText('Orthodontic.ring.activationCompleteFooter')
        : i18nText('Orthodontic.ring.activationRemainingFooter', {
          count: Math.max(0, (proj.prescribedActivations ?? 0) - proj.completedActivations),
        }),
      ratio: proj.ratio,
      accent,
    };
  }

  // ── retention removables: PO-ORTHO-008a daily net-wear view ──────────
  const isRetentionDaily =
    appliance.applianceType === 'retainer-removable' ||
    (applianceSupportsWearGap(appliance.applianceType) && caseRow.stage === 'retention');
  if (isRetentionDaily) {
    const daily = computeDailyNetWear({
      intervals,
      prescribedHoursPerDay: appliance.prescribedHoursPerDay,
      nowIso,
    });
    const rounded = Math.round(daily.todayNetWearHours);
    return {
      kind: 'metric',
      caption: openState.hasOpen ? i18nText('Orthodontic.ring.unworn') : i18nText('Orthodontic.ring.todayWear'),
      value: String(rounded),
      unit: daily.todayTargetHours !== null ? ` / ${daily.todayTargetHours} h` : ' h',
      footer: i18nText('Orthodontic.ring.todayNetWearApprox'),
      ratio:
        daily.todayTargetHours !== null && daily.todayTargetHours > 0
          ? Math.max(0, Math.min(1, daily.todayNetWearHours / daily.todayTargetHours))
          : null,
      accent,
    };
  }

  // ── everything else: PO-ORTHO-013 phase month counter ────────────────
  const phase = computeAppliancePhaseProgress(appliance, nowIso);
  if (!phase) {
    return { kind: 'message', message: i18nText('Orthodontic.ring.phaseNotSet'), accent: identityColor };
  }
  return {
    kind: 'metric',
    caption: phase.label,
    value: String(phase.monthsInPhase),
    unit: i18nText('Orthodontic.ring.phaseMonthUnit', { months: phase.expectedMonths }),
    footer: i18nText('Orthodontic.ring.phaseFooter', { current: phase.phaseNumber, total: phase.phaseTotal }),
    ratio: Math.max(0, Math.min(1, phase.monthsInPhase / phase.expectedMonths)),
    accent,
  };
}
