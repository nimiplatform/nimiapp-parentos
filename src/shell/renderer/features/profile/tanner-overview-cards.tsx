import '@nimiplatform/kit/ui';
import { Link } from 'react-router-dom';
import type { MeasurementRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


type TannerOverviewCardsProps = {
  boneAgeMeasurements: MeasurementRow[];
  bodyFatMeasurements: MeasurementRow[];
  heightMeasurements: MeasurementRow[];
};

const MIN_VELOCITY_GAP_DAYS = 60;
const DAYS_PER_MONTH = 30.44;

function sortByMeasuredAtDesc(rows: MeasurementRow[]): MeasurementRow[] {
  return [...rows].sort((left, right) => right.measuredAt.localeCompare(left.measuredAt));
}

/**
 * Annualized height velocity from the two most recent height records at least
 * 60 days apart. Objective description only — no PHV norms, no adult-height
 * prediction (no admitted reference dataset, see
 * defer/parentos-puberty-reference-gaps.defer.md).
 */
function computeHeightVelocity(sortedDesc: MeasurementRow[]): { months: number; delta: number; annualized: number } | null {
  const latest = sortedDesc[0];
  if (!latest) return null;
  const latestTime = Date.parse(latest.measuredAt);
  if (Number.isNaN(latestTime)) return null;
  for (let index = 1; index < sortedDesc.length; index += 1) {
    const earlier = sortedDesc[index];
    if (!earlier) continue;
    const earlierTime = Date.parse(earlier.measuredAt);
    if (Number.isNaN(earlierTime)) continue;
    const gapDays = (latestTime - earlierTime) / (24 * 60 * 60 * 1000);
    if (gapDays >= MIN_VELOCITY_GAP_DAYS) {
      const months = gapDays / DAYS_PER_MONTH;
      const delta = latest.value - earlier.value;
      return { months, delta, annualized: (delta * 12) / months };
    }
  }
  return null;
}

export function TannerOverviewCards({
  boneAgeMeasurements,
  bodyFatMeasurements,
  heightMeasurements,
}: TannerOverviewCardsProps) {
  if (boneAgeMeasurements.length === 0 && bodyFatMeasurements.length === 0 && heightMeasurements.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 mb-5">
      {(() => {
        const latest = sortByMeasuredAtDesc(heightMeasurements)[0];
        if (!latest) return <div />;
        const velocity = computeHeightVelocity(sortByMeasuredAtDesc(heightMeasurements));
        return (
          <div className="rounded-2xl bg-[var(--nimi-surface-panel)] p-4">
            <p className="text-[12px] font-medium text-[var(--nimi-text-muted)]">{i18nText('Tanner.overview.height')}</p>
            <p className="text-[20px] font-bold mt-1 text-[var(--nimi-text-primary)]">{latest.value} cm</p>
            <p className="text-[12px] mt-1 text-[var(--nimi-text-muted)]">
              {velocity
                ? i18nText('Tanner.overview.heightVelocity', {
                  months: Math.round(velocity.months),
                  delta: velocity.delta.toFixed(1),
                  annualized: velocity.annualized.toFixed(1),
                })
                : i18nText('Tanner.overview.heightVelocityInsufficient')}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[12px] text-[var(--nimi-text-muted)]">{latest.measuredAt.split('T')[0]}</span>
              <Link to="/profile/growth?metric=growth.height" className="text-[12px] hover:underline text-[var(--nimi-action-primary-bg)]">
                {i18nText('Tanner.overview.heightGrowthCurveLink')}
              </Link>
            </div>
          </div>
        );
      })()}
      {(() => {
        const latest = sortByMeasuredAtDesc(boneAgeMeasurements)[0];
        if (!latest) return <div />;
        const actualYears = latest.ageMonths / 12;
        const diff = latest.value - actualYears;
        const status = Math.abs(diff) <= 1
          ? { label: i18nText('Tanner.overview.boneAgeMatched'), className: 'border-[color-mix(in_srgb,var(--nimi-status-success)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-success)_8%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]', dot: 'bg-[var(--nimi-status-success)]' }
          : Math.abs(diff) > 2
            ? { label: i18nText('Tanner.overview.boneAgeDeviationLarge'), className: 'border-[color-mix(in_srgb,var(--nimi-status-warning)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_8%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]', dot: 'bg-[var(--nimi-status-warning)]' }
            : diff > 1
              ? { label: i18nText('Tanner.overview.boneAgeAhead', { years: Math.abs(diff).toFixed(1) }), className: 'border-[color-mix(in_srgb,var(--nimi-status-warning)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_8%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]', dot: 'bg-[var(--nimi-status-warning)]' }
              : { label: i18nText('Tanner.overview.boneAgeBehind', { years: Math.abs(diff).toFixed(1) }), className: 'border-[color-mix(in_srgb,var(--nimi-status-info)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-info)_8%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]', dot: 'bg-[var(--nimi-status-info)]' };
        return (
          <div className={`rounded-2xl border p-4 ${status.className}`}>
            <p className="text-[12px] font-medium text-[var(--nimi-text-muted)]">{i18nText('Tanner.overview.boneAge')}</p>
            <p className="text-[20px] font-bold mt-1 text-[var(--nimi-text-primary)]">{latest.value} {i18nText('Common.unit.year')}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              <span className="text-[13px]">{status.label}</span>
            </div>
            <p className="text-[12px] mt-1 text-[var(--nimi-text-muted)]">{i18nText('Tanner.overview.boneAgeCaption')}</p>
            <p className="text-[12px] mt-1 text-[var(--nimi-text-muted)]">{latest.measuredAt.split('T')[0]}</p>
          </div>
        );
      })()}
      {(() => {
        const sorted = sortByMeasuredAtDesc(bodyFatMeasurements);
        const latest = sorted[0];
        if (!latest) return <div />;
        const previous = sorted[1];
        const delta = previous ? latest.value - previous.value : null;
        return (
          <div className="rounded-2xl bg-[var(--nimi-surface-panel)] p-4">
            <p className="text-[12px] font-medium text-[var(--nimi-text-muted)]">{i18nText('Tanner.overview.bodyFat')}</p>
            <p className="text-[20px] font-bold mt-1 text-[var(--nimi-text-primary)]">{latest.value}%</p>
            {delta != null ? (
              <p className="text-[12px] mt-1 text-[var(--nimi-text-muted)]">
                {i18nText('Tanner.overview.bodyFatDelta', { delta: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}` })}
              </p>
            ) : null}
            <p className="text-[12px] mt-1 text-[var(--nimi-text-muted)]">{latest.measuredAt.split('T')[0]}</p>
          </div>
        );
      })()}
    </div>
  );
}
