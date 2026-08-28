import { Surface } from '@nimiplatform/kit/ui';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipValueType } from 'recharts';
import type { SleepRecordRow } from '../../bridge/sqlite-bridge.js';
import { fmtDuration, referenceSleepRange } from './sleep-page-shared.js';
import {
  computeWeekStats,
  formatMinutesOfDay,
  last7DayRecords,
  timeToMinutesOfDay,
  totalMinutes,
} from './sleep-week-stats.js';
import { i18nText } from '../../i18n/index.js';

type TrendTab = 'duration' | 'bedtime' | 'wake';

const TABS: { id: TrendTab; labelKey: string }[] = [
  { id: 'duration', labelKey: 'Sleep.trend.tabDuration' },
  { id: 'bedtime', labelKey: 'Sleep.trend.tabBedtime' },
  { id: 'wake', labelKey: 'Sleep.trend.tabWake' },
];

// Fixed minute-of-day windows so one late/early day does not blow out the axis.
const BEDTIME_DOMAIN: [number, number] = [18 * 60, 24 * 60];
const WAKE_DOMAIN: [number, number] = [4 * 60 + 30, 9 * 60 + 30];

export function SleepTrendChart({
  records,
  ageMonths,
}: {
  records: SleepRecordRow[];
  ageMonths: number;
}) {
  const [tab, setTab] = useState<TrendTab>('duration');
  const [refLo, refHi] = referenceSleepRange(ageMonths);

  const stats = useMemo(() => computeWeekStats(records, ageMonths, new Date()), [records, ageMonths]);

  const data = useMemo(() => {
    return last7DayRecords(records, new Date()).map(({ date, record }) => {
      let value: number | null = null;
      if (record) {
        if (tab === 'duration') {
          const total = totalMinutes(record);
          value = total != null ? Math.round((total / 60) * 10) / 10 : null;
        } else {
          const raw = tab === 'bedtime' ? record.bedtime : record.wakeTime;
          value = raw ? timeToMinutesOfDay(raw) : null;
        }
      }
      return { date: date.slice(5), value };
    });
  }, [records, tab]);

  const pointCount = data.filter((point) => point.value != null).length;

  const avgWakeMin = useMemo(() => {
    const wakeTimes = last7DayRecords(records, new Date())
      .map(({ record }) => (record?.wakeTime ? timeToMinutesOfDay(record.wakeTime) : null))
      .filter((v): v is number => v != null);
    if (wakeTimes.length === 0) return null;
    return Math.round(wakeTimes.reduce((sum, v) => sum + v, 0) / wakeTimes.length);
  }, [records]);

  const subtitle = (() => {
    if (tab === 'duration') {
      const reference = i18nText('Sleep.trend.referenceRange', { low: refLo, high: refHi });
      if (stats.avgTotalMin == null) return reference;
      return `${reference} · ${i18nText('Sleep.trend.avg7d', { value: fmtDuration(stats.avgTotalMin) })}`;
    }
    if (tab === 'bedtime') {
      return stats.avgBedtimeMin != null
        ? i18nText('Sleep.trend.avgBedtime7d', { value: formatMinutesOfDay(stats.avgBedtimeMin) })
        : '';
    }
    return avgWakeMin != null
      ? i18nText('Sleep.trend.avgWake7d', { value: formatMinutesOfDay(avgWakeMin) })
      : '';
  })();

  const formatValue = (value: TooltipValueType | undefined): string => {
    if (typeof value !== 'number') return '-';
    return tab === 'duration' ? `${value}h` : formatMinutesOfDay(value);
  };

  const tooltipLabel =
    tab === 'duration'
      ? i18nText('Sleep.trend.durationLabel')
      : tab === 'bedtime'
        ? i18nText('Sleep.trend.tabBedtime')
        : i18nText('Sleep.trend.tabWake');

  return (
    <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="mb-4 rounded-3xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{i18nText('Sleep.trend.title')}</span>
        <div className="flex gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-2.5 py-1 text-[12px] transition-colors ${
                tab === item.id
                  ? 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)] font-medium text-[var(--nimi-action-primary-bg)]'
                  : 'text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]'
              }`}
            >
              {i18nText(item.labelKey)}
            </button>
          ))}
        </div>
      </div>
      {subtitle ? (
        <p className="text-[12px] mb-2 text-[var(--nimi-text-muted)]">{subtitle}</p>
      ) : null}
      {pointCount < 2 ? (
        <p className="py-8 text-center text-[13px] text-[var(--nimi-text-muted)]">
          {i18nText('Sleep.overview.insufficientData')}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={'var(--nimi-action-primary-bg)'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={'var(--nimi-action-primary-bg)'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nimi-border-subtle)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--nimi-text-muted)' }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--nimi-text-muted)' }}
              tickLine={false}
              axisLine={false}
              domain={tab === 'duration' ? ['auto', 'auto'] : tab === 'bedtime' ? BEDTIME_DOMAIN : WAKE_DOMAIN}
              tickFormatter={tab === 'duration' ? undefined : (v: number) => formatMinutesOfDay(v)}
            />
            {tab === 'duration' ? (
              <ReferenceArea y1={refLo} y2={refHi} fill="var(--nimi-text-primary)" fillOpacity={0.08} />
            ) : null}
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${'var(--nimi-border-subtle)'}`, boxShadow: 'var(--nimi-elevation-raised)' }}
              formatter={(value: TooltipValueType | undefined) => [formatValue(value), tooltipLabel]}
            />
            <Area
              type="monotone"
              dataKey="value"
              connectNulls={false}
              stroke={'var(--nimi-action-primary-bg)'}
              strokeWidth={2}
              fill="url(#sleepGrad)"
              dot={{ r: 3, fill: 'var(--nimi-action-primary-bg)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Surface>
  );
}
