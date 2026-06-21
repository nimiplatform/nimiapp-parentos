import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { OutdoorRecordRow } from '../../bridge/sqlite-bridge.js';
import { getWeekStart, computeWeekSummary, buildOutdoorMessage, fmtDate, DEFAULT_OUTDOOR_GOAL_MINUTES } from '../outdoor/outdoor-helpers.js';
import { fmtRel, type GrowthSnapshotMetric, type GrowthTrendItem, type RecentLineItem } from './timeline-data.js';
import { Cd, Hdr, textMain, textMuted } from './timeline-card-primitives.js';
import { i18nText } from '../../i18n/index.js';


const TREND_COLORS: Record<string, { stroke: string; gradId: string; grad0: string }> = {
  height: { stroke: '#818CF8', gradId: 'heightGrad', grad0: '#C4B5FD' },
  weight: { stroke: '#4ECCA3', gradId: 'weightGrad', grad0: '#A7F3D0' },
};

function MiniTrendRow({ trend }: { trend: GrowthTrendItem }) {
  const colors = TREND_COLORS[trend.id] ?? TREND_COLORS.height!;
  const hasChart = trend.points.length >= 2;
  const hasDelta = trend.delta !== null;
  const isUp = hasDelta && trend.delta! > 0;
  const isDown = hasDelta && trend.delta! < 0;
  const deltaColor = isUp ? '#22c55e' : isDown ? '#ef4444' : textMuted;
  const deltaArrow = isUp ? '↑' : isDown ? '↓' : '';

  return (
    <div className="dashboard-inset rounded-[16px] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium" style={{ color: textMuted }}>{trend.label}</p>
          {hasDelta ? (
            <p className="mt-1 text-[12px] font-semibold" style={{ color: deltaColor }}>
              {deltaArrow} {trend.delta! > 0 ? '+' : ''}{trend.delta}{trend.unit ? ` ${trend.unit}` : ''}
              {trend.deltaPercent !== null ? <span className="ml-1 font-normal" style={{ color: '#64748b' }}>({trend.deltaPercent! > 0 ? '+' : ''}{trend.deltaPercent}%)</span> : null}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <span className="text-[24px] font-semibold leading-none tracking-tight" style={{ color: textMain }}>{trend.latestValue}</span>
          {trend.unit ? <span className="ml-1 text-[12px]" style={{ color: '#64748b' }}>{trend.unit}</span> : null}
        </div>
      </div>
      {hasChart ? (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={trend.points} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id={colors.gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.grad0} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={colors.grad0} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={30} />
              <Area type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} fill={`url(#${colors.gradId})`} dot={false} activeDot={{ r: 3, fill: colors.stroke }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

export function GrowthSnapshotCard({ snapshot }: { snapshot: { updatedAt: string | null; updatedLabel: string; metrics: GrowthSnapshotMetric[]; trends: GrowthTrendItem[] } }) {
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.home.growthSnapshotTitle')} to="/profile" link={i18nText('Timeline.home.viewCurves')} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.latestGrowthMeasurement')}</p>
        <span className="text-[12px]" style={{ color: '#64748b' }}>{snapshot.updatedLabel}</span>
      </div>
      {snapshot.trends.length > 0 ? (
        <div className="space-y-3">{snapshot.trends.map((trend) => <MiniTrendRow key={trend.id} trend={trend} />)}</div>
      ) : (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.noGrowthSnapshotTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.home.noGrowthSnapshotBody')}</p>
        </div>
      )}
    </Cd>
  );
}

export function RecentLinesCard({ lines }: { lines: RecentLineItem[] }) {
  return (
    <Cd cls="col-span-8">
      <Hdr title={i18nText('Timeline.home.recentLinesTitle')} to="/journal" link={i18nText('Timeline.home.viewAllRecords')} />
      {lines.length > 0 ? (
        <div className="grid grid-cols-4 gap-4">
          {lines.map((line) => (
            <Link key={line.id} to={line.to} className="dashboard-inset dashboard-inset--interactive rounded-[16px] p-5 transition-all duration-200 hover:-translate-y-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[12px] font-medium"
                  style={line.badgeTone === 'keepsake'
                    ? { background: 'rgba(245, 158, 11, 0.12)', color: '#b45309' }
                    : { background: 'rgba(255,255,255,0.6)', color: textMuted }}
                >
                  {line.badge}
                </span>
                <span className="text-[12px]" style={{ color: '#64748b' }}>{fmtRel(line.recordedAt)}</span>
              </div>
              <p className="mt-3 line-clamp-3 text-[14px] font-medium leading-relaxed" style={{ color: textMain }}>{line.title}</p>
              <p className="mt-2 text-[12px]" style={{ color: textMuted }}>{line.detail}</p>
              {line.tag ? <p className="mt-2 text-[12px] font-medium" style={{ color: '#b45309' }}>{line.tag}</p> : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.noRecentLinesTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.home.noRecentLinesBody')}</p>
        </div>
      )}
    </Cd>
  );
}

export function OutdoorGoalCard({
  records,
  goalMinutes,
}: {
  records: OutdoorRecordRow[];
  goalMinutes: number | null;
}) {
  const effectiveGoal = goalMinutes ?? DEFAULT_OUTDOOR_GOAL_MINUTES;
  const todayStr = fmtDate(new Date());
  const weekStart = getWeekStart(new Date());
  const summary = computeWeekSummary(records, effectiveGoal, weekStart, todayStr);
  const message = buildOutdoorMessage(summary, false);
  const progressPercent = Math.min(100, Math.round((summary.totalMinutes / effectiveGoal) * 100));
  const barColor = summary.isComplete ? '#4ECCA3' : '#818CF8';

  if (goalMinutes === null) {
    return (
      <Cd cls="col-span-4">
        <Hdr title={i18nText('Timeline.home.outdoorGoalTitle')} to="/profile" link={i18nText('Timeline.home.setGoal')} />
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.home.noOutdoorGoalTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>
            {i18nText('Timeline.home.noOutdoorGoalBody')}
          </p>
        </div>
      </Cd>
    );
  }

  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.home.outdoorGoalTitle')} to="/profile" />
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-[18px] font-bold tabular-nums" style={{ color: textMain }}>
            {summary.totalMinutes} <span className="text-[14px] font-normal" style={{ color: textMuted }}>/ {effectiveGoal} {i18nText('Timeline.home.minutesUnit')}</span>
          </p>
          <span className="text-[14px] font-medium tabular-nums" style={{ color: barColor }}>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(226,232,240,0.5)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPercent}%`, background: barColor }} />
        </div>
        <p className="text-[14px]" style={{ color: textMuted }}>{message.primary}</p>
        {message.secondary ? <p className="text-[13px]" style={{ color: textMuted }}>{message.secondary}</p> : null}
      </div>
    </Cd>
  );
}
