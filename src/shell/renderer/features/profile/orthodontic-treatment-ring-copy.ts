import type { OrthodonticApplianceRow } from '../../bridge/sqlite-bridge.js';
import type { CycleProgress, OpenIntervalState } from './orthodontic-derive.js';
import { i18nText } from '../../i18n/index.js';


// ── Copy generator (PO-ORTHO-010 fact-restatement only) ────

export type TreatmentRingCopy =
  | {
      kind: 'cycle';
      caption: string;
      primaryNumber: string;
      unit: string;
      footer: string | null;
    }
  | { kind: 'message'; message: string };

/**
 * Single source of every parent-facing string the wearing ring shows. The
 * PO-ORTHO-010 boundary lives entirely here — no other layer rewrites the
 * wording. Tests pin every branch (`orthodontic-treatment-ring-copy.test.ts`)
 * so a future "small UX tweak" cannot silently resurrect a retired
 * prescriptive verb.
 */
export function computeTreatmentRingCopy(input: {
  primaryAppliance: OrthodonticApplianceRow | null;
  cycle: CycleProgress | null;
  openState: OpenIntervalState | null;
}): TreatmentRingCopy {
  const { primaryAppliance, cycle, openState } = input;

  if (!primaryAppliance) {
    return {
      kind: 'message',
      message: i18nText('Orthodontic.ring.noActiveAppliance'),
    };
  }

  const isOpen = openState?.hasOpen ?? false;
  const ageHours = openState?.ageHours ?? 0;

  if (cycle) {
    const netHours = Math.round(cycle.cycleNetWearHours);
    const remaining = Math.max(0, cycle.cycleTargetHours - cycle.cycleNetWearHours);
    const remainingRounded = Math.round(remaining);
    const pct = Math.max(0, Math.min(100, Math.round(cycle.cycleProgressRatio * 100)));

    if (isOpen) {
      // Unworn interval open — number = open-interval age; footer keeps the cycle wear
      // tally + percentage so the parent still sees progress despite being off.
      const ageHoursRounded = Math.max(0, Math.round(ageHours));
      return {
        kind: 'cycle',
        caption: i18nText('Orthodontic.ring.unworn'),
        primaryNumber: String(ageHoursRounded),
        unit: 'h',
        footer: i18nText('Orthodontic.ring.currentAlignerWornFooter', { hours: netHours, percent: pct }),
      };
    }

    if (cycle.cycleProgressRatio >= 1) {
      return {
        kind: 'cycle',
        caption: i18nText('Orthodontic.ring.currentAlignerMet'),
        primaryNumber: String(netHours),
        unit: 'h',
        footer: '100%',
      };
    }

    return {
      kind: 'cycle',
      caption: i18nText('Orthodontic.ring.currentAlignerWorn'),
      primaryNumber: String(netHours),
      unit: 'h',
      footer: i18nText('Orthodontic.ring.currentAlignerRemainingFooter', { hours: remainingRounded, percent: pct }),
    };
  }

  // Non clear-aligner — no cycle math; surface a single-line fact only.
  if (isOpen) {
    const prescribed = primaryAppliance.prescribedHoursPerDay;
    return {
      kind: 'message',
      message: prescribed
        ? i18nText('Orthodontic.ring.unwornWithPrescription', { hours: prescribed })
        : i18nText('Orthodontic.ring.unworn'),
    };
  }
  if (primaryAppliance.prescribedHoursPerDay) {
    return {
      kind: 'message',
      message: i18nText('Orthodontic.ring.prescribedHours', { hours: primaryAppliance.prescribedHoursPerDay }),
    };
  }
  return { kind: 'message', message: i18nText('Orthodontic.ring.applianceInUse') };
}
