import { Surface, cn } from '@nimiplatform/kit/ui';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bone, Percent, Ruler } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MeasurementRow } from '../../bridge/sqlite-bridge.js';
import { formatTannerDate } from './tanner-page-shared.js';
import { i18nText } from '../../i18n/index.js';

type TannerOverviewCardsProps = {
  boneAgeMeasurements: MeasurementRow[];
  bodyFatMeasurements: MeasurementRow[];
  heightMeasurements: MeasurementRow[];
};

type MeasurementTile = {
  key: string;
  label: string;
  row: MeasurementRow | undefined;
  unit: string;
  icon: ReactNode;
  iconClassName: string;
};

const ICON_PROPS = { size: 16, strokeWidth: 1.6 } as const;

function sorted(rows: MeasurementRow[]) {
  return [...rows].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

/** Supporting measurements, each with its own measurement date; shown after the records. */
// @nimi-authority: rule.parentos.prof.r012
export function TannerOverviewCards({
  boneAgeMeasurements,
  bodyFatMeasurements,
  heightMeasurements,
}: TannerOverviewCardsProps) {
  const heights = sorted(heightMeasurements);
  const height = heights[0];
  const earlier = height
    ? heights.find(
        (row) => Date.parse(height.measuredAt) - Date.parse(row.measuredAt) >= 60 * 86400000,
      )
    : undefined;
  const heightDelta = height && earlier ? height.value - earlier.value : null;
  const tiles = (
    [
      {
        key: 'height',
        label: i18nText('Tanner.overview.height'),
        row: height,
        unit: 'cm',
        icon: <Ruler {...ICON_PROPS} />,
        iconClassName:
          'bg-[color-mix(in_srgb,var(--nimi-color-indigo)_12%,transparent)] text-[var(--nimi-color-indigo)]',
      },
      {
        key: 'bone-age',
        label: i18nText('Tanner.overview.boneAge'),
        row: sorted(boneAgeMeasurements)[0],
        unit: i18nText('Common.unit.year'),
        icon: <Bone {...ICON_PROPS} />,
        iconClassName:
          'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,transparent)] text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_75%,var(--nimi-text-primary))]',
      },
      {
        key: 'body-fat',
        label: i18nText('Tanner.overview.bodyFat'),
        row: sorted(bodyFatMeasurements)[0],
        unit: '%',
        icon: <Percent {...ICON_PROPS} />,
        iconClassName: 'bg-[var(--nimi-surface-active)] text-[var(--nimi-text-muted)]',
      },
    ] satisfies MeasurementTile[]
  ).filter((tile) => tile.row);

  return (
    <section aria-labelledby="tanner-measurements">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        <h2
          id="tanner-measurements"
          className="m-0 text-[15px] font-semibold text-[var(--nimi-text-primary)]"
        >
          {i18nText('Tanner.redesign.measurements')}
        </h2>
        <Link
          to="/profile/growth?metric=growth.height"
          className="flex items-center gap-1 text-[12.5px] text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_75%,var(--nimi-text-primary))] no-underline hover:underline"
        >
          {i18nText('Tanner.overview.heightGrowthCurveLink')}
          <ArrowUpRight size={14} />
        </Link>
      </div>
      {tiles.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {tiles.map((tile) => {
            const row = tile.row!;
            return (
              <Surface
                key={tile.key}
                tone="card"
                material="solid"
                elevation="raised"
                padding="md"
                className="flex items-start gap-3 rounded-2xl"
              >
                <div
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                    tile.iconClassName,
                  )}
                >
                  {tile.icon}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="text-[11px] tracking-[0.02em] text-[var(--nimi-text-muted)]">
                    {tile.label}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <div className="text-[22px] font-bold leading-[1.1] tabular-nums text-[var(--nimi-text-primary)]">
                      {row.value}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--nimi-text-muted)]">
                      {tile.unit}
                    </div>
                  </div>
                  <time
                    dateTime={row.measuredAt.slice(0, 10)}
                    className="mt-0.5 text-[11px] text-[var(--nimi-text-muted)]"
                  >
                    {formatTannerDate(row.measuredAt)}
                  </time>
                  {tile.key === 'height' && earlier && heightDelta != null ? (
                    <p className="mt-1.5 text-[11.5px] leading-[1.5] text-[var(--nimi-text-secondary)]">
                      {i18nText('Tanner.redesign.heightDelta', {
                        from: formatTannerDate(earlier.measuredAt),
                        delta: `${heightDelta > 0 ? '+' : ''}${heightDelta.toFixed(1)}`,
                      })}
                    </p>
                  ) : null}
                </div>
              </Surface>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--nimi-border-subtle)] px-5 py-4 text-[13px] leading-[1.7] text-[var(--nimi-text-muted)]">
          {i18nText('Tanner.redesign.noMeasurements')}
        </p>
      )}
    </section>
  );
}
