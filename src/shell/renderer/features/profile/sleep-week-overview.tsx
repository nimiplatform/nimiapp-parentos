import { Surface } from '@nimiplatform/kit/ui';
import { useMemo } from 'react';
import type { SleepRecordRow } from '../../bridge/sqlite-bridge.js';
import { fmtDuration } from './sleep-page-shared.js';
import {
  computeWeekStats,
  formatMinutesOfDay,
  type SleepRegularity,
  type SleepSufficiency,
  type SleepWeekStats,
} from './sleep-week-stats.js';
import { i18nText } from '../../i18n/index.js';

const SUFFICIENCY_KEYS: Record<SleepSufficiency, string> = {
  within: 'Sleep.overview.sufficiency.within',
  below: 'Sleep.overview.sufficiency.below',
  above: 'Sleep.overview.sufficiency.above',
  insufficient: 'Sleep.overview.sufficiency.insufficient',
};

const REGULARITY_KEYS: Record<SleepRegularity, string> = {
  good: 'Sleep.overview.regularityValue.good',
  fair: 'Sleep.overview.regularityValue.fair',
  variable: 'Sleep.overview.regularityValue.variable',
  insufficient: 'Sleep.overview.regularityValue.insufficient',
};

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-[var(--nimi-text-muted)]">{label}</span>
      <span className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{value}</span>
    </div>
  );
}

export function SleepWeekOverview({
  records,
  ageMonths,
}: {
  records: SleepRecordRow[];
  ageMonths: number;
}) {
  const stats: SleepWeekStats = useMemo(
    () => computeWeekStats(records, ageMonths, new Date()),
    [records, ageMonths],
  );

  if (stats.daysWithRecords === 0) return null;

  const insufficientLabel = i18nText('Sleep.overview.insufficientData');

  return (
    <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="mb-4 rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <div>
            <span className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Sleep.overview.title')}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] font-bold text-[var(--nimi-text-primary)]">
                {stats.avgTotalMin != null ? fmtDuration(stats.avgTotalMin) : insufficientLabel}
              </span>
              <span className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Sleep.overview.avgTotal')}</span>
            </div>
          </div>
          <span className="rounded-full px-2 py-0.5 text-[12px] font-medium bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,transparent)] text-[var(--nimi-action-primary-bg)]">
            {i18nText(SUFFICIENCY_KEYS[stats.sufficiency])}
          </span>
        </div>
        <div className="flex gap-5">
          <SmallMetric
            label={i18nText('Sleep.overview.night')}
            value={stats.avgNightMin != null ? fmtDuration(stats.avgNightMin) : insufficientLabel}
          />
          <SmallMetric
            label={i18nText('Sleep.overview.nap')}
            value={stats.avgNapMin != null ? fmtDuration(stats.avgNapMin) : insufficientLabel}
          />
          <SmallMetric
            label={i18nText('Sleep.overview.bedtime')}
            value={stats.avgBedtimeMin != null ? formatMinutesOfDay(stats.avgBedtimeMin) : insufficientLabel}
          />
          <SmallMetric
            label={i18nText('Sleep.overview.regularity')}
            value={i18nText(REGULARITY_KEYS[stats.regularity])}
          />
        </div>
      </div>
    </Surface>
  );
}
