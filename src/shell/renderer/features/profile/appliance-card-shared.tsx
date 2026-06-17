import { Button, IconButton, StatusBadge, cn } from '@nimiplatform/kit/ui';
/**
 * Shared building blocks for the multi-appliance orthodontic cards
 * (`appliance-hero-card` / `appliance-compact-card`). Keeping the header,
 * phase pill and log-action row here is what makes the hero and compact
 * variants read as the same component family at two densities.
 */
import type { ReactNode } from 'react';
import type { OrthodonticApplianceRow } from '../../bridge/sqlite-bridge.js';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { applianceTypeLabel } from './orthodontic-derive.js';
import type { ApplianceNextAction } from './appliance-next-action.js';
import type { AppliancePhaseProgress } from './orthodontic-derive.js';
import { GearIcon } from './orthodontic-treatment-card-parts.js';
import { i18nText } from '../../i18n/index.js';


/** Cross-card per-appliance action callbacks, keyed by the appliance row. */
export interface ApplianceCardHandlers {
  onEditAppliance: (appliance: OrthodonticApplianceRow) => void;
  onBackfillUnwear: (appliance: OrthodonticApplianceRow) => void;
  onLogIssue: (appliance: OrthodonticApplianceRow) => void;
  onAdvancePhase: (appliance: OrthodonticApplianceRow) => void;
  onNextAction: (appliance: OrthodonticApplianceRow, action: ApplianceNextAction) => void;
}

/** Month/day label from a yyyy-mm-dd date. */
export function formatMonthDay(ymd: string): string {
  const [, m, d] = ymd.split('-');
  if (!m || !d) return ymd;
  return i18nText('Orthodontic.applianceCard.monthDay', { month: Number(m), day: Number(d) });
}

/** Child age at the appliance start date. */
export function ageAtLabel(birthDate: string, startedAt: string): string {
  const months = computeAgeMonthsAt(birthDate, startedAt);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0
    ? i18nText('Orthodontic.applianceCard.ageYearsMonths', { years, months: rem })
    : i18nText('Orthodontic.applianceCard.ageYears', { years });
}

export function DaysAwayPill({ daysAway }: { daysAway: number }) {
  return (
    <StatusBadge
      tone={daysAway < 0 ? 'warning' : 'success'}
      className="whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold"
    >
      {daysAway < 0
        ? i18nText('Orthodontic.applianceCard.daysOverdue', { days: -daysAway })
        : i18nText('Orthodontic.applianceCard.daysAway', { days: daysAway })}
    </StatusBadge>
  );
}

/** Color dot + appliance name + (optional) inline pill + (optional) gear button. */
export function ApplianceCardHeader({
  appliance,
  onEditAppliance,
  inline,
  trailing,
}: {
  appliance: OrthodonticApplianceRow;
  onEditAppliance: (appliance: OrthodonticApplianceRow) => void;
  /** Sits right after the appliance name (e.g. `AlignerIndexPill`). */
  inline?: ReactNode;
  /** Right-aligned next to the gear icon. */
  trailing?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--nimi-action-primary-bg)]"
      />
      <span
        className="text-[15px] font-bold text-[var(--nimi-text-primary)]"
      >
        {applianceTypeLabel(appliance.applianceType)}
      </span>
      {inline}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        {trailing}
        <IconButton
          onClick={() => onEditAppliance(appliance)}
          aria-label={i18nText('Orthodontic.applianceCard.settings')}
          title={i18nText('Orthodontic.applianceCard.settings')}
          tone="ghost"
          size="sm"
          className="h-7 min-h-7 w-7 rounded-full text-[var(--nimi-text-muted)]"
          icon={<GearIcon />}
        />
      </div>
    </div>
  );
}

/** Appliance start metadata line. */
export function ApplianceMetaLine({
  appliance,
  childBirthDate,
}: {
  appliance: OrthodonticApplianceRow;
  childBirthDate: string;
}) {
  return (
    <div className="mt-1 text-[12px] text-[var(--nimi-text-muted)]">
      {i18nText('Orthodontic.applianceCard.startMeta', {
        date: appliance.startedAt,
        age: ageAtLabel(childBirthDate, appliance.startedAt),
      })}
    </div>
  );
}

/**
 * Clear-aligner tray index indicator. Rides inline next to
 * the appliance name in `ApplianceCardHeader` so the which-tray-of-the-series
 * context sits right next to the appliance identity, not buried by the phase
 * pill row. When `totalAligners` is null the indicator only shows the current
 * tray index.
 */
export function AlignerIndexPill({
  currentAlignerIndex,
  totalAligners,
}: {
  currentAlignerIndex: number;
  totalAligners: number | null;
}) {
  const label =
    totalAligners !== null
      ? i18nText('Orthodontic.applianceCard.alignerIndexWithTotal', {
          current: currentAlignerIndex,
          total: totalAligners,
        })
      : i18nText('Orthodontic.applianceCard.alignerIndex', { current: currentAlignerIndex });
  return (
    <span
      className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--nimi-text-primary)_5%,transparent)] px-3 text-[12px] font-semibold text-[var(--nimi-text-primary)]"
    >
      {label}
    </span>
  );
}

/**
 * Per-appliance treatment-phase pill (PO-ORTHO-013). Renders the phase label +
 * month counter when a phase is set, otherwise a muted phase-setting affordance
 * that opens the phase-advance dialog (the first advance sets the initial phase).
 */
export function AppliancePhasePill({
  appliance,
  phase,
  onAdvancePhase,
}: {
  appliance: OrthodonticApplianceRow;
  phase: AppliancePhaseProgress | null;
  onAdvancePhase: (appliance: OrthodonticApplianceRow) => void;
}) {
  if (!phase) {
    return (
      <Button
        onClick={() => onAdvancePhase(appliance)}
        tone="ghost"
        size="sm"
        className="min-h-7 rounded-full border-dashed border-[var(--nimi-border-subtle)] px-3 text-[12px] text-[var(--nimi-text-muted)]"
      >
        {i18nText('Orthodontic.applianceCard.setPhase')}
      </Button>
    );
  }
  return (
    <Button
      onClick={() => onAdvancePhase(appliance)}
      title={i18nText('Orthodontic.applianceCard.advancePhase')}
      tone="ghost"
      size="sm"
      className="min-h-7 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--nimi-status-info)_15%,transparent)] px-3 text-[12px] text-[var(--nimi-status-info)]"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-[var(--nimi-status-info)]"
      />
      {i18nText('Orthodontic.applianceCard.phaseProgress', {
        phase: phase.label,
        months: phase.monthsInPhase,
        expectedMonths: phase.expectedMonths,
      })}
    </Button>
  );
}

/**
 * Log-action row shown under the ring. Backfill is limited to wear-gap
 * appliance types (PO-ORTHO-005a); issue logging is always present.
 */
export function ApplianceLogActions({
  appliance,
  supportsWearGap,
  handlers,
}: {
  appliance: OrthodonticApplianceRow;
  supportsWearGap: boolean;
  handlers: Pick<ApplianceCardHandlers, 'onBackfillUnwear' | 'onLogIssue'>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      {supportsWearGap && (
        <Button
          onClick={() => handlers.onBackfillUnwear(appliance)}
          tone="secondary"
          size="md"
          className="rounded-full px-4 text-[13px]"
        >
          {i18nText('Orthodontic.applianceCard.backfillUnwearInterval')}
        </Button>
      )}
      <Button
        onClick={() => handlers.onLogIssue(appliance)}
        tone="primary"
        size="md"
        className={cn('rounded-full px-4 text-[13px]', !supportsWearGap && 'min-w-[128px]')}
      >
        {i18nText('Orthodontic.applianceCard.logIssue')}
      </Button>
    </div>
  );
}
