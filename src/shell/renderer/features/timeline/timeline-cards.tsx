import type { MilestoneTimelineSummary, MonthlyReportSummary, ObservationDistributionSummary, SleepTrendSummary, VisionSnapshotSummary } from './timeline-data.js';
import { parseReportContent } from '../reports/structured-report.js';
import {
  fmtRel,
} from './timeline-data.js';
import { Cd, Hdr, textMain, textMuted } from './timeline-card-primitives.js';
import { i18nText } from '../../i18n/index.js';


export { ChildContextCard, GettingStartedCard, QuickLinksStrip, RecentChangesHeroCard, StageFocusCard, StageInsightCard } from './timeline-card-overview.js';
export { GrowthSnapshotCard, OutdoorGoalCard, RecentLinesCard } from './timeline-card-summary.js';

/* ── Sleep Trend ── */

const DOMAIN_LABEL_KEYS: Record<string, string> = {
  'gross-motor': 'Timeline.milestoneDomain.grossMotor',
  'fine-motor': 'Timeline.milestoneDomain.fineMotor',
  language: 'Timeline.milestoneDomain.language',
  cognitive: 'Timeline.milestoneDomain.cognitive',
  'social-emotional': 'Timeline.milestoneDomain.socialEmotional',
  'self-care': 'Timeline.milestoneDomain.selfCare',
};

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function milestoneDomainLabel(domain: string): string {
  const key = DOMAIN_LABEL_KEYS[domain];
  return key ? i18nText(key) : domain;
}

export function SleepTrendCard({ summary }: { summary: SleepTrendSummary }) {
  const hasData = summary.points.length > 0;
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.card.sleep.title')} to="/profile" link={i18nText('Timeline.action.viewDetails')} />
      {hasData ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[24px] font-semibold leading-none tracking-tight" style={{ color: textMain, letterSpacing: '-0.5px' }}>
                {summary.avgDurationMinutes != null ? fmtDuration(summary.avgDurationMinutes) : '--'}
              </p>
              <p className="mt-2 text-[13px]" style={{ color: textMuted }}>{i18nText('Timeline.card.sleep.averageDuration')}</p>
            </div>
            <div className="text-right">
              {summary.latestBedtime ? <p className="text-[13px]" style={{ color: textMuted }}>{i18nText('Timeline.card.sleep.latestBedtime')} <span className="font-semibold" style={{ color: textMain }}>{summary.latestBedtime}</span></p> : null}
              {summary.latestWakeTime ? <p className="mt-0.5 text-[13px]" style={{ color: textMuted }}>{i18nText('Timeline.card.sleep.latestWakeTime')} <span className="font-semibold" style={{ color: textMain }}>{summary.latestWakeTime}</span></p> : null}
            </div>
          </div>
          <div className="mt-6 flex items-end gap-2">
            {summary.points.slice(-10).map((point, _index, visiblePoints) => {
              const maxDur = Math.max(...visiblePoints.map((p) => p.durationMinutes));
              const minDur = Math.min(...visiblePoints.map((p) => p.durationMinutes));
              const range = maxDur - minDur || 1;
              const height = Math.max(((point.durationMinutes - minDur) / range) * 56 + 16, 16);
              return (
                <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${point.date}: ${fmtDuration(point.durationMinutes)}`}>
                  <div className="w-full rounded-lg" style={{ height, background: '#818CF8' }} />
                  <span className="whitespace-nowrap text-[10px] font-medium" style={{ color: '#64748b' }}>{point.date.slice(5).replace('-', '/')}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.card.sleep.emptyTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.card.sleep.emptySubtitle')}</p>
        </div>
      )}
    </Cd>
  );
}

/* ── Vision Snapshot ── */

export function VisionCard({ snapshot }: { snapshot: VisionSnapshotSummary }) {
  const hasData = snapshot.leftEye != null || snapshot.rightEye != null;
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.card.vision.title')} to="/profile" link={i18nText('Timeline.action.viewDetails')} />
      {hasData ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              {/* Left eye */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(96,165,250,0.12)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="text-[12px]" style={{ color: textMuted }}>{i18nText('Timeline.card.vision.leftEye')}</p>
                  <p className="text-[24px] font-semibold leading-none tracking-tight" style={{ color: textMain, letterSpacing: '-0.5px' }}>
                    {snapshot.leftEye ?? '--'}
                  </p>
                </div>
              </div>
              {/* Right eye */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(96,165,250,0.12)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="text-[12px]" style={{ color: textMuted }}>{i18nText('Timeline.card.vision.rightEye')}</p>
                  <p className="text-[24px] font-semibold leading-none tracking-tight" style={{ color: textMain, letterSpacing: '-0.5px' }}>
                    {snapshot.rightEye ?? '--'}
                  </p>
                </div>
              </div>
            </div>
            <span className="text-[12px]" style={{ color: '#64748b' }}>{snapshot.measuredLabel}</span>
          </div>
        </>
      ) : (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.card.vision.emptyTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.card.vision.emptySubtitle')}</p>
        </div>
      )}
    </Cd>
  );
}

/* ── Milestone ── */

export function MilestoneTimelineCard({ summary }: { summary: MilestoneTimelineSummary }) {
  const hasAchieved = summary.recentlyAchieved.length > 0;
  const hasUpcoming = summary.upcoming.length > 0;
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.card.milestone.title')} to="/profile" link={i18nText('Timeline.action.viewAll')} />
      {hasAchieved ? (
        <div className="mb-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: '#4ECCA3' }}>{i18nText('Timeline.card.milestone.recentlyAchieved')}</p>
          <div className="space-y-2">
            {summary.recentlyAchieved.map((item) => (
              <div key={item.milestoneId} className="dashboard-inset flex items-center gap-3 rounded-[14px] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]" style={{ background: 'rgba(78,204,163,0.15)', color: '#4ECCA3' }}>&#10003;</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold" style={{ color: textMain }}>{item.title}</p>
                  <p className="text-[12px]" style={{ color: textMuted }}>{milestoneDomainLabel(item.domain)} · {item.achievedAt ? fmtRel(item.achievedAt) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {hasUpcoming ? (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: '#818CF8' }}>{i18nText('Timeline.card.milestone.upcoming')}</p>
          <div className="space-y-2">
            {summary.upcoming.map((item) => (
              <div key={item.milestoneId} className="dashboard-inset flex items-center gap-3 rounded-[14px] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px]" style={{ background: 'rgba(129,140,248,0.15)', color: '#818CF8' }}>&#9679;</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold" style={{ color: textMain }}>{item.title}</p>
                  <p className="text-[12px]" style={{ color: textMuted }}>{i18nText('Timeline.card.milestone.typicalAge', { domain: milestoneDomainLabel(item.domain), age: item.typicalAgeLabel })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {!hasAchieved && !hasUpcoming ? (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.card.milestone.emptyTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.card.milestone.emptySubtitle')}</p>
        </div>
      ) : null}
    </Cd>
  );
}

/* ── Observation Distribution ── */

export function ObservationDistributionCard({ summary }: { summary: ObservationDistributionSummary }) {
  const hasData = summary.items.length > 0;
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.card.observation.title')} to="/journal" link={i18nText('Timeline.action.viewRecords')} />
      {hasData ? (
        <>
          <p className="mb-5 text-[13px]" style={{ color: textMuted }}>{i18nText('Timeline.card.observation.last30Days', { count: summary.totalEntries })}</p>
          <div className="space-y-3.5">
            {summary.items.map((item) => (
              <div key={item.dimensionId}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold" style={{ color: textMain }}>{item.displayName}</span>
                  <span className="text-[12px]" style={{ color: '#64748b' }}>{i18nText('Timeline.card.observation.countRatio', { count: item.count, ratio: Math.round(item.ratio * 100) })}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.16)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(item.ratio * 100, 4)}%`, background: '#818CF8' }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="dashboard-inset rounded-[16px] p-5">
          <p className="text-[14px] font-semibold" style={{ color: textMain }}>{i18nText('Timeline.card.observation.emptyTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: textMuted }}>{i18nText('Timeline.card.observation.emptySubtitle')}</p>
        </div>
      )}
    </Cd>
  );
}

/* ── Monthly Report ── */

export function MonthlyReportCard({ report }: { report: MonthlyReportSummary }) {
  const content = parseReportContent(report.content);
  if (content.reportType !== 'monthly') {
    throw new Error(`Monthly report content type mismatch: ${report.reportId}`);
  }
  const teaser = content.version === 2 ? content.teaser : content.overview?.slice(0, 2).join(' ') ?? '';
  const actionText = content.version === 2 ? content.actionItems[0]?.text : null;
  return (
    <Cd cls="col-span-4">
      <Hdr title={i18nText('Timeline.card.monthlyReport.title')} to="/reports" link={i18nText('Timeline.action.viewFullReport')} />
      <p className="text-[14px] leading-[1.8]" style={{ color: textMain }}>{teaser}</p>
      {actionText ? (
        <div className="dashboard-inset mt-4 rounded-[14px] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: textMuted }}>{i18nText('Timeline.card.monthlyReport.todoTitle')}</p>
          <p className="mt-1.5 text-[14px] font-medium" style={{ color: textMain }}>{actionText}</p>
        </div>
      ) : null}
    </Cd>
  );
}

/* ── Growth trends ── */
