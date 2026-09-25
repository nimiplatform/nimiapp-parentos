import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../app-shell/app-store.js';
import { WelcomePage } from './welcome-page.js';
import { SENSITIVE_PERIODS } from '../../knowledge-base/index.js';
import type { ActiveReminder } from '../../engine/reminder-engine.js';
import { buildTimelineHomeViewModel, C } from './timeline-data.js';
import {
  ChildContextCard,
  GettingStartedCard,
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
  StageInsightCard,
  VisionCard,
} from './timeline-cards.js';
import { autoGenerateMonthlyReport } from '../reports/auto-report.js';
import { isValidRollingMonthlyReport } from '../reports/report-cycle.js';
import { FrequencyModal } from '../reminders/frequency-modal.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { ReminderPanel } from './timeline-page-panels.js';
import { useReminderPanelController } from './reminder-panel-controller.js';
import { i18nText } from '../../i18n/index.js';

// Summary row columns by card count, so every row fills and no card trails alone.
const SUMMARY_GRID_CLS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 lg:grid-cols-3',
  4: 'md:grid-cols-2 2xl:grid-cols-4',
};

// @nimi-authority: rule.parentos.time.r011
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

  // Lower rows are composed from the cards that are present so each row fills
  // without a lone half-width card or a short card stretched to a tall neighbour.
  // Milestones pair with stage focus; without an active sensitive period (older
  // children, where the catalog is also exhausted) they join the summary row.
  const hasStageFocus = periods.length > 0;
  const milestoneHasBothGroups = homeVm.milestoneTimeline.recentlyAchieved.length > 0
    && homeVm.milestoneTimeline.upcoming.length > 0;
  const summaryCards = [
    ...(hasStageFocus ? [] : [{ key: 'milestones', node: <MilestoneTimelineCard summary={homeVm.milestoneTimeline} /> }]),
    { key: 'outdoor', node: <OutdoorGoalCard records={d.outdoorRecords} goalMinutes={d.outdoorGoalMinutes} /> },
    { key: 'observation', node: <ObservationDistributionCard summary={homeVm.observationDistribution} /> },
    ...(latestMonthlyReport ? [{ key: 'monthly', node: <MonthlyReportCard report={latestMonthlyReport} /> }] : []),
  ];

  return (
    <div className="relative h-full min-w-0" style={{ background: 'transparent' }}>
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
      {/* Full-width scroll surface (so the wheel also works over the side gutters)
       * holding a capped, centered frame: on maximized wide windows the cards keep
       * their designed proportions and the right rail stays next to the content. */}
      <div className="hide-scrollbar relative z-[1] h-full overflow-y-auto">
        <div className="mx-auto flex min-w-0 max-w-[1600px]">
          <div className="min-w-0 flex-1 px-3 pb-8 sm:px-6" style={{ paddingTop: 28 }}>
            <div className="mb-4 flex min-w-0 flex-col gap-4 lg:mb-6 lg:flex-row lg:gap-6">
              <ChildContextCard child={child} ageMonths={ageMonths} />
              {homeVm.stageInsight ? (
                <StageInsightCard summary={homeVm.stageInsight} />
              ) : (
                <RecentChangesHeroCard items={homeVm.recentChanges} />
              )}
            </div>
            <div className="grid auto-rows-min grid-cols-8 gap-4 md:gap-6">
              <QuickLinksStrip ageMonths={ageMonths} />
              {homeVm.coldStart ? (
                <GettingStartedCard />
              ) : (
                <>
                  {/* Growth snapshot (left) + Sleep trend & Vision (right, stacked) */}
                  <div className="col-span-8 flex min-w-0 flex-col gap-4 lg:flex-row lg:gap-6">
                    <div className="min-w-0 flex-1 [&>div]:h-full">
                      <GrowthSnapshotCard snapshot={homeVm.growthSnapshot} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-6">
                      <div className="flex-1 [&>div]:h-full">
                        <SleepTrendCard summary={homeVm.sleepTrend} />
                      </div>
                      <div className="flex-1 [&>div]:h-full">
                        <VisionCard snapshot={homeVm.visionSnapshot} />
                      </div>
                    </div>
                  </div>
                  {/* Stage focus + milestones: the two "what's next" lists side by side. A
                   * milestone card holding both groups only matches the stage card's height
                   * once it can show the groups side by side, so the pair stacks until 2xl. */}
                  {hasStageFocus ? (
                    <div className={`col-span-8 grid min-w-0 gap-4 md:gap-6 ${milestoneHasBothGroups ? '2xl:grid-cols-2' : 'md:grid-cols-2'}`}>
                      <div className="min-w-0 [&>div]:h-full">
                        <StageFocusCard periods={periods} />
                      </div>
                      <div className="min-w-0 [&>div]:h-full">
                        <MilestoneTimelineCard summary={homeVm.milestoneTimeline} />
                      </div>
                    </div>
                  ) : null}
                  <RecentLinesCard lines={homeVm.recentLines} />
                  <div className={`col-span-8 grid min-w-0 gap-4 md:gap-6 ${SUMMARY_GRID_CLS[summaryCards.length]}`}>
                    {summaryCards.map((card, index) => (
                      <div
                        key={card.key}
                        className={`min-w-0 [&>div]:h-full${summaryCards.length === 3 && index === 2 ? ' md:col-span-2 lg:col-span-1' : ''}`}
                      >
                        {card.node}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right rail stays pinned beside the content while the page scrolls. */}
          <div className="hide-scrollbar sticky top-0 hidden h-screen overflow-y-auto xl:flex">
            <ReminderPanel {...panelProps} />
          </div>
        </div>
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
