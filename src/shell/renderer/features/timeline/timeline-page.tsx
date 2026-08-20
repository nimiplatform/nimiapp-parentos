import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../app-shell/app-store.js';
import { WelcomePage } from './welcome-page.js';
import { SENSITIVE_PERIODS } from '../../knowledge-base/index.js';
import type { ActiveReminder } from '../../engine/reminder-engine.js';
import { buildTimelineHomeViewModel, C } from './timeline-data.js';
import {
  ChildContextCard,
  GrowthSnapshotCard,
  MilestoneTimelineCard,
  MonthlyReportCard,
  ObservationDistributionCard,
  OutdoorGoalCard,
  QuickLinksStrip,
  RecentChangesHeroCard,
  RecentLinesCard,
  SleepTrendCard,
  StageFocusCard,
  VisionCard,
} from './timeline-cards.js';
import { autoGenerateMonthlyReport } from '../reports/auto-report.js';
import { isValidRollingMonthlyReport } from '../reports/report-cycle.js';
import { FrequencyModal } from '../reminders/frequency-modal.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { ReminderPanel } from './timeline-page-panels.js';
import { useReminderPanelController } from './reminder-panel-controller.js';
import { i18nText } from '../../i18n/index.js';


export default function TimelinePage() {
  const { activeChildId, children: childList } = useAppStore();
  const child = childList.find((item) => item.childId === activeChildId);

  // Shared task controller — owns the reminder agenda, capture handlers, and
  // the right-rail panel props. The profile task drawer consumes the same
  // hook so both surfaces render identical content.
  const { d, loading, reload, ageMonths, agendaResult, agenda, panelProps, modalsNode } =
    useReminderPanelController(child);

  const [freqModalReminder, setFreqModalReminder] = useState<ActiveReminder | null>(null);
  const latestMonthlyReport = d.latestMonthlyReport;
  if (child && latestMonthlyReport && !isValidRollingMonthlyReport(child.createdAt, {
    reportType: 'monthly',
    periodStart: latestMonthlyReport.periodStart,
    periodEnd: latestMonthlyReport.periodEnd,
    generatedAt: latestMonthlyReport.generatedAt,
  })) {
    throw new Error(`Invalid rolling monthly report window: ${latestMonthlyReport.periodStart}`);
  }

  const periods = useMemo(
    () => SENSITIVE_PERIODS.filter((period) => ageMonths >= period.ageRange.startMonths && ageMonths <= period.ageRange.endMonths),
    [ageMonths],
  );

  const homeVm = useMemo(
    () => child && agenda ? buildTimelineHomeViewModel({ child, d, ageMonths, agenda }) : null,
    [child, d, ageMonths, agenda],
  );

  useEffect(() => {
    if (!child || loading) return;
    autoGenerateMonthlyReport(child)
      .then((id) => {
        if (id) void reload();
      })
      .catch(catchLog('timeline', 'action:auto-generate-monthly-report-failed', 'warn'));
  }, [child, loading, reload]);

  if (!child) {
    return <WelcomePage />;
  }

  if (agendaResult.kind === 'unknown-rule') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center" style={{ color: '#b91c1c' }}>
        <p className="text-base font-medium">{i18nText('Timeline.error.unknownRuleTitle')}</p>
        <p className="text-[14px]" style={{ color: C.sub }}>
          {i18nText('Timeline.error.unknownRuleIds', { ruleIds: agendaResult.ruleIds.join(', ') })}
        </p>
        <p className="text-[14px]" style={{ color: C.sub }}>
          {i18nText('Timeline.error.unknownRuleBody')}
        </p>
      </div>
    );
  }

  if (loading || !agenda || !homeVm) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'transparent' }}>
        <p className="text-sm" style={{ color: C.sub }}>{i18nText('Timeline.loading')}</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full" style={{ background: 'transparent' }}>
      {/* Ambient gradient — diffuse pink + blue cloud that warms the whole dashboard.
       * Placed once at the page shell so inner cards stay neutral and don't stack blurs. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{
          backgroundImage: [
            'radial-gradient(at 18% 12%, rgba(186,230,253,0.35) 0px, transparent 52%)',
            'radial-gradient(at 82% 18%, rgba(255,207,226,0.28) 0px, transparent 52%)',
            'radial-gradient(at 48% 96%, rgba(221,214,254,0.26) 0px, transparent 55%)',
          ].join(', '),
          filter: 'blur(28px)',
        }}
      />
      <div className="hide-scrollbar relative z-[1] min-w-0 flex-1 overflow-y-auto px-6 pb-8" style={{ paddingTop: 28 }}>
        <div className="mb-6 flex gap-6">
          <ChildContextCard child={child} ageMonths={ageMonths} />
          <RecentChangesHeroCard items={homeVm.recentChanges} />
        </div>
        <div className="grid auto-rows-min grid-cols-8 gap-6">
          <QuickLinksStrip ageMonths={ageMonths} />
          {/* Growth snapshot (left) + Sleep trend & Vision (right, stacked) */}
          <div className="col-span-8 flex gap-6">
            <div className="min-w-0 flex-1 [&>div]:h-full">
              <GrowthSnapshotCard snapshot={homeVm.growthSnapshot} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <div className="flex-1 [&>div]:h-full">
                <SleepTrendCard summary={homeVm.sleepTrend} />
              </div>
              <div className="flex-1 [&>div]:h-full">
                <VisionCard snapshot={homeVm.visionSnapshot} />
              </div>
            </div>
          </div>
          <OutdoorGoalCard records={d.outdoorRecords} goalMinutes={d.outdoorGoalMinutes} />
          {periods.length > 0 ? <StageFocusCard periods={periods} /> : null}
          <MilestoneTimelineCard summary={homeVm.milestoneTimeline} />
          <RecentLinesCard lines={homeVm.recentLines} />
          <ObservationDistributionCard summary={homeVm.observationDistribution} />
          {latestMonthlyReport ? <MonthlyReportCard report={latestMonthlyReport} /> : null}
        </div>
      </div>

      <div className="relative z-[1]">
        <ReminderPanel {...panelProps} />
      </div>

      {modalsNode}

      {freqModalReminder && freqModalReminder.rule.repeatRule?.cadenceUnit === 'month' && (
        <FrequencyModal
          childId={child.childId}
          ruleId={freqModalReminder.rule.ruleId}
          ruleTitle={freqModalReminder.rule.title}
          currentIntervalMonths={freqModalReminder.rule.repeatRule.interval}
          existingOverride={null}
          canDisable={freqModalReminder.rule.priority !== 'P0'}
          onSaved={() => {
            void reload();
          }}
          onClose={() => setFreqModalReminder(null)}
        />
      )}
    </div>
  );
}
