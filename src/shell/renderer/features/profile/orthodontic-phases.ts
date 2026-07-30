import type {
  OrthodonticApplianceRow,
  OrthodonticApplianceType,
} from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function parseIso(iso: string): number {
  return new Date(iso).getTime();
}

function ymdToIsoMidnight(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

// ── Per-appliance treatment phase (PO-ORTHO-013) ────────────────────────

export interface AppliancePhase {
  phaseId: string;
  /** Short phase name shown on the appliance card pill. */
  label: string;
  /** One-sentence plain-language explanation surfaced in the phase dialog. */
  description: string;
  /** Typical phase duration — a projection for the month counter, never a deadline. */
  expectedMonths: number;
}

/**
 * Ordered per-appliance-type treatment-phase sequences. TS mirror of
 * `data/structured/parentos/orthodontic-protocols.yaml#appliancePhases`; the YAML is the sole authority
 * and `orthodontic-protocol-catalog.test.ts` pins this against it.
 */
export const APPLIANCE_PHASES: Record<OrthodonticApplianceType, AppliancePhase[]> = {
  'twin-block': [
    {
      phaseId: 'functional',
      label: i18nText('Orthodontic.appliancePhase.functionalMandibular.label'),
      description: i18nText('Orthodontic.appliancePhase.functionalMandibular.description'),
      expectedMonths: 9,
    },
    {
      phaseId: 'settling',
      label: i18nText('Orthodontic.appliancePhase.occlusionSettling.label'),
      description: i18nText('Orthodontic.appliancePhase.occlusionSettling.description'),
      expectedMonths: 3,
    },
  ],
  expander: [
    {
      phaseId: 'widening',
      label: i18nText('Orthodontic.appliancePhase.widening.label'),
      description: i18nText('Orthodontic.appliancePhase.widening.description'),
      expectedMonths: 3,
    },
    {
      phaseId: 'holding',
      label: i18nText('Orthodontic.appliancePhase.holding.label'),
      description: i18nText('Orthodontic.appliancePhase.holding.description'),
      expectedMonths: 6,
    },
  ],
  activator: [
    {
      phaseId: 'functional',
      label: i18nText('Orthodontic.appliancePhase.functionalMandibular.label'),
      description: i18nText('Orthodontic.appliancePhase.functionalMandibular.description'),
      expectedMonths: 9,
    },
    {
      phaseId: 'settling',
      label: i18nText('Orthodontic.appliancePhase.occlusionSettling.label'),
      description: i18nText('Orthodontic.appliancePhase.occlusionSettling.description'),
      expectedMonths: 3,
    },
  ],
  'metal-braces': [
    {
      phaseId: 'leveling',
      label: i18nText('Orthodontic.appliancePhase.leveling.label'),
      description: i18nText('Orthodontic.appliancePhase.leveling.description'),
      expectedMonths: 8,
    },
    {
      phaseId: 'space-closure',
      label: i18nText('Orthodontic.appliancePhase.spaceClosure.label'),
      description: i18nText('Orthodontic.appliancePhase.spaceClosure.description'),
      expectedMonths: 6,
    },
    {
      phaseId: 'finishing',
      label: i18nText('Orthodontic.appliancePhase.finishing.label'),
      description: i18nText('Orthodontic.appliancePhase.finishing.description'),
      expectedMonths: 4,
    },
    {
      phaseId: 'debond-prep',
      label: i18nText('Orthodontic.appliancePhase.debondPrep.label'),
      description: i18nText('Orthodontic.appliancePhase.debondPrep.description'),
      expectedMonths: 2,
    },
  ],
  'ceramic-braces': [
    {
      phaseId: 'leveling',
      label: i18nText('Orthodontic.appliancePhase.leveling.label'),
      description: i18nText('Orthodontic.appliancePhase.leveling.description'),
      expectedMonths: 8,
    },
    {
      phaseId: 'space-closure',
      label: i18nText('Orthodontic.appliancePhase.spaceClosure.label'),
      description: i18nText('Orthodontic.appliancePhase.spaceClosure.description'),
      expectedMonths: 6,
    },
    {
      phaseId: 'finishing',
      label: i18nText('Orthodontic.appliancePhase.finishing.label'),
      description: i18nText('Orthodontic.appliancePhase.finishing.description'),
      expectedMonths: 4,
    },
    {
      phaseId: 'debond-prep',
      label: i18nText('Orthodontic.appliancePhase.debondPrep.label'),
      description: i18nText('Orthodontic.appliancePhase.debondPrep.description'),
      expectedMonths: 2,
    },
  ],
  'clear-aligner': [
    {
      phaseId: 'active-series',
      label: i18nText('Orthodontic.appliancePhase.activeSeries.label'),
      description: i18nText('Orthodontic.appliancePhase.activeSeries.description'),
      expectedMonths: 12,
    },
    {
      phaseId: 'refinement',
      label: i18nText('Orthodontic.appliancePhase.refinement.label'),
      description: i18nText('Orthodontic.appliancePhase.refinement.description'),
      expectedMonths: 3,
    },
  ],
  'retainer-fixed': [
    {
      phaseId: 'stabilizing',
      label: i18nText('Orthodontic.appliancePhase.stabilizing.label'),
      description: i18nText('Orthodontic.appliancePhase.stabilizing.description'),
      expectedMonths: 12,
    },
    {
      phaseId: 'long-term',
      label: i18nText('Orthodontic.appliancePhase.longTerm.label'),
      description: i18nText('Orthodontic.appliancePhase.longTerm.description'),
      expectedMonths: 24,
    },
  ],
  'retainer-removable': [
    {
      phaseId: 'full-time',
      label: i18nText('Orthodontic.appliancePhase.fullTime.label'),
      description: i18nText('Orthodontic.appliancePhase.fullTime.description'),
      expectedMonths: 6,
    },
    {
      phaseId: 'night-time',
      label: i18nText('Orthodontic.appliancePhase.nightTime.label'),
      description: i18nText('Orthodontic.appliancePhase.nightTime.description'),
      expectedMonths: 12,
    },
    {
      phaseId: 'intermittent',
      label: i18nText('Orthodontic.appliancePhase.intermittent.label'),
      description: i18nText('Orthodontic.appliancePhase.intermittent.description'),
      expectedMonths: 24,
    },
  ],
};

/**
 * Whole months elapsed since an ISO date/datetime, ceil semantics matching the
 * case-level `monthsElapsed` projection: 0 before day 1, else
 * `max(1, ceil(days / 30))` so day 1 already reads as month 1.
 */
function monthsSinceCeil(fromIso: string, nowIso: string): number {
  const fromMs = parseIso(fromIso.length > 10 ? fromIso : ymdToIsoMidnight(fromIso));
  const days = Math.max(0, (parseIso(nowIso) - fromMs) / DAY_MS);
  return days > 0 ? Math.max(1, Math.ceil(days / 30)) : 0;
}

export interface AppliancePhaseProgress {
  phaseId: string;
  label: string;
  /** 1-based position of the current phase in the type sequence. */
  phaseNumber: number;
  phaseTotal: number;
  /** Whole months since `phaseStartedAt` (ceil). */
  monthsInPhase: number;
  /** Typical-duration projection — never a deadline (PO-ORTHO-013). */
  expectedMonths: number;
}

/**
 * Per-appliance phase view-model (PO-ORTHO-013). Returns null when the
 * appliance has no phase set yet (the admitted unset intermediate state) or
 * — defensively — when the persisted phase is not in the type's sequence (the
 * Rust read path already fail-closes on that, so this is belt-and-braces).
 */
export function computeAppliancePhaseProgress(
  appliance: OrthodonticApplianceRow,
  nowIso: string,
): AppliancePhaseProgress | null {
  if (!appliance.currentPhase) return null;
  const seq = APPLIANCE_PHASES[appliance.applianceType];
  const idx = seq.findIndex((p) => p.phaseId === appliance.currentPhase);
  if (idx < 0) return null;
  const phase = seq[idx]!;
  const anchor = appliance.phaseStartedAt ?? appliance.startedAt;
  return {
    phaseId: phase.phaseId,
    label: phase.label,
    phaseNumber: idx + 1,
    phaseTotal: seq.length,
    monthsInPhase: monthsSinceCeil(anchor, nowIso),
    expectedMonths: phase.expectedMonths,
  };
}

export interface AppliancePhaseOption {
  phaseId: string;
  label: string;
  /** Plain-language explanation of the phase, mirrored from the protocol catalog. */
  description: string;
  /** Typical-duration projection for the phase (months); never a deadline. */
  expectedMonths: number;
  state: 'past' | 'current' | 'future';
  /** True when the parent can advance to this phase from the current one. */
  advanceable: boolean;
}

/**
 * Per-appliance phase stepper view-model — the PO-ORTHO-013 mirror of
 * `computeStageOptions`. With a null `currentPhase` the first phase is the
 * single advanceable target; otherwise the immediate next phase is advanceable.
 */
export function computeAppliancePhaseOptions(
  appliance: Pick<OrthodonticApplianceRow, 'applianceType' | 'currentPhase'>,
): AppliancePhaseOption[] {
  const seq = APPLIANCE_PHASES[appliance.applianceType];
  const currentIdx = appliance.currentPhase
    ? seq.findIndex((p) => p.phaseId === appliance.currentPhase)
    : -1;
  return seq.map((phase, idx) => {
    const state: AppliancePhaseOption['state'] =
      idx < currentIdx ? 'past' : idx === currentIdx ? 'current' : 'future';
    return {
      phaseId: phase.phaseId,
      label: phase.label,
      description: phase.description,
      expectedMonths: phase.expectedMonths,
      state,
      advanceable: idx === currentIdx + 1,
    };
  });
}
