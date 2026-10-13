// @vitest-environment jsdom

import { waitFor, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TestNavigation, NavigationProbe } from '../../testing/navigation.js';
import { describe, expect, it, vi } from 'vitest';
import { GettingStartedCard, GrowthSnapshotCard, MilestoneTimelineCard, ObservationDistributionCard, QuickLinksStrip, RecentChangesHeroCard, RecentLinesCard, SleepTrendCard, StageInsightCard } from './timeline-cards.js';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (value: string) => value,
}));

function renderInRouter(node: ReactNode) {
  return render(<TestNavigation>{node}<NavigationProbe /></TestNavigation>);
}

describe('timeline dashboard cards', () => {
  it('renders sleep trend content when data exists', async () => {
    renderInRouter(
      <SleepTrendCard
        summary={{
          points: [
            { date: '2026-04-14', durationMinutes: 600, bedtime: '21:00', wakeTime: '07:00' },
            { date: '2026-04-15', durationMinutes: 540, bedtime: '21:30', wakeTime: '06:30' },
          ],
          avgDurationMinutes: 570,
          latestBedtime: '21:30',
          latestWakeTime: '06:30',
          totalRecords: 2,
        }}
      />,
    );

    expect(screen.getByText('睡眠趋势')).toBeTruthy();
    expect(screen.getByText('近两周平均时长')).toBeTruthy();
    expect(screen.getByText('9h30m')).toBeTruthy();
  });

  it('renders milestone timeline with achieved and upcoming', async () => {
    renderInRouter(
      <MilestoneTimelineCard
        summary={{
          recentlyAchieved: [
            { milestoneId: 'PO-MS-GMOT-001', title: '抬头', domain: 'gross-motor', achievedAt: '2026-04-10T08:00:00.000Z', typicalAgeLabel: '2个月' },
          ],
          upcoming: [
            { milestoneId: 'PO-MS-GMOT-003', title: '独坐', domain: 'gross-motor', typicalAgeLabel: '6个月' },
          ],
        }}
      />,
    );

    expect(screen.getByText('里程碑')).toBeTruthy();
    expect(screen.getByText('最近达成')).toBeTruthy();
    expect(screen.getByText('抬头')).toBeTruthy();
    expect(screen.getByText('接下来关注')).toBeTruthy();
    expect(screen.getByText('独坐')).toBeTruthy();
  });

  it('renders observation distribution with dimension bars', async () => {
    renderInRouter(
      <ObservationDistributionCard
        summary={{
          items: [
            { dimensionId: 'PO-OBS-MOVE-001', displayName: '大运动发展', count: 3, ratio: 0.6 },
            { dimensionId: 'PO-OBS-LANG-001', displayName: '语言表达', count: 2, ratio: 0.4 },
          ],
          totalEntries: 5,
        }}
      />,
    );

    expect(screen.getByText('观察维度分布')).toBeTruthy();
    expect(screen.getByText('大运动发展')).toBeTruthy();
    expect(screen.getByText('语言表达')).toBeTruthy();
    expect(screen.getByText(/共 5 条/)).toBeTruthy();
  });

  it('renders empty states without crashing', async () => {
    renderInRouter(
      <>
        <SleepTrendCard
          summary={{
            points: [],
            avgDurationMinutes: null,
            latestBedtime: null,
            latestWakeTime: null,
            totalRecords: 0,
          }}
        />
        <MilestoneTimelineCard
          summary={{ recentlyAchieved: [], upcoming: [] }}
        />
        <ObservationDistributionCard
          summary={{ items: [], totalEntries: 0 }}
        />
      </>,
    );

    expect(screen.getByText('还没有睡眠记录')).toBeTruthy();
    expect(screen.getByText('当前阶段暂无匹配的里程碑')).toBeTruthy();
    expect(screen.getByText('还没有带维度标记的观察记录')).toBeTruthy();
  });
  it('keeps dashboard inner blocks unframed until an entry is hovered', async () => {
    const { container } = renderInRouter(
      <>
        <SleepTrendCard
          summary={{
            points: [],
            avgDurationMinutes: null,
            latestBedtime: null,
            latestWakeTime: null,
            totalRecords: 0,
          }}
        />
        <GrowthSnapshotCard
          snapshot={{
            updatedAt: null,
            updatedLabel: '暂无成长测量记录',
            metrics: [],
            trends: [],
          }}
        />
        <QuickLinksStrip ageMonths={156} />
      </>,
    );

    const plainBlocks = container.querySelectorAll('.dashboard-inset');
    expect(plainBlocks).toHaveLength(2);
    for (const block of plainBlocks) {
      expect(block.hasAttribute('data-nimi-material')).toBe(false);
      expect(block.className).not.toContain('bg-[var(--nimi-material');
      expect(block.className).not.toContain('border-[var(--nimi-material');
    }

    const quickLinks = container.querySelectorAll('.dashboard-quick-link');
    expect(quickLinks.length).toBeGreaterThan(0);
    for (const link of quickLinks) {
      expect(link.hasAttribute('data-nimi-material')).toBe(false);
      expect(link.className).not.toContain('bg-[var(--nimi-material');
      expect(link.className).not.toContain('border-[var(--nimi-material');
    }
  });

  it('routes the recent-changes empty-state CTA into manual health data capture', async () => {
    const { container } = renderInRouter(<RecentChangesHeroCard items={[]} />);

    fireEvent.click(Array.from(container.querySelectorAll('a')).find(link => link.textContent?.includes('记录'))!);
    await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('capture'));
    expect(screen.getByTestId('navigation-probe').textContent).toContain('/profile');
  });

  it('renders keepsake badges and reason tags in recent lines', async () => {
    renderInRouter(
      <RecentLinesCard
        lines={[
          {
            id: 'line-1',
            title: '读完第一本桥梁书',
            detail: '珍藏原因：取得成果',
            recordedAt: '2026-04-15T08:00:00.000Z',
            to: { id: '/journal', filter: 'keepsake' },
            badge: '珍藏',
            badgeTone: 'keepsake',
            tag: '取得成果',
          },
        ]}
      />,
    );

    expect(screen.getByText('读完第一本桥梁书')).toBeTruthy();
    expect(screen.getByText('珍藏')).toBeTruthy();
    expect(screen.getByText('取得成果')).toBeTruthy();
  });

  it('renders stage insight groups without exposing internal rule identifiers', async () => {
    renderInRouter(
      <StageInsightCard
        summary={{
          ageLabel: '10个月',
          health: [
            { ruleId: 'PO-TEST-TASK', title: '乙肝疫苗（第3剂）', description: '按程序完成接种。', domain: 'vaccine', priority: 'P0' },
          ],
          development: [
            { ruleId: 'PO-TEST-GUIDE', title: '语言互动窗口', description: '多回应孩子的发声。', domain: 'language', priority: 'P1' },
          ],
          healthOverflow: 0,
          developmentOverflow: 0,
        }}
      />,
    );

    expect(screen.getByText('10个月')).toBeTruthy();
    expect(screen.queryByText(/这个阶段/)).toBeNull();
    expect(screen.getByText('健康窗口')).toBeTruthy();
    expect(screen.getByText('发展关注')).toBeTruthy();
    expect(screen.getByText('乙肝疫苗（第3剂）')).toBeTruthy();
    expect(screen.queryByText(/PO-TEST-TASK/)).toBeNull();
    expect(screen.queryByText(/PO-TEST-GUIDE/)).toBeNull();
  });

  it('omits empty stage insight groups and links to the reminders surface', async () => {
    const { container } = renderInRouter(
      <StageInsightCard
        summary={{
          ageLabel: '10个月',
          health: [],
          development: [
            { ruleId: 'PO-TEST-GUIDE', title: '语言互动窗口', description: '多回应孩子的发声。', domain: 'language', priority: 'P1' },
          ],
          healthOverflow: 0,
          developmentOverflow: 0,
        }}
      />,
    );

    expect(screen.queryByText('健康窗口')).toBeNull();
    expect(screen.getByText('发展关注')).toBeTruthy();
    fireEvent.click(container.querySelector('a')!);
    await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('/reminders'));
  });

  it('renders the per-group overflow count as a link to the reminders surface', async () => {
    const { container } = renderInRouter(
      <StageInsightCard
        summary={{
          ageLabel: '10个月',
          health: [
            { ruleId: 'PO-TEST-T0', title: '视力定期检查', description: '每半年检查一次视力。', domain: 'vision', priority: 'P1' },
          ],
          development: [
            { ruleId: 'PO-TEST-G0', title: '语言互动窗口', description: '多回应孩子的发声。', domain: 'language', priority: 'P1' },
          ],
          healthOverflow: 6,
          developmentOverflow: 0,
        }}
      />,
    );

    const overflowLink = screen.getByText('还有 6 项 →');
    fireEvent.click(overflowLink.closest('a')!);
    await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('/reminders'));
    expect(screen.queryByText('还有 0 项 →')).toBeNull();
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.filter((link) => link.textContent?.startsWith('还有'))).toHaveLength(1);
  });

  it('keeps stage insight descriptions collapsed until a title is clicked, one at a time', async () => {
    renderInRouter(
      <StageInsightCard
        summary={{
          ageLabel: '16岁',
          health: [
            { ruleId: 'PO-TEST-T0', title: '视力定期检查', description: '每半年检查一次视力。', domain: 'vision', priority: 'P1' },
            { ruleId: 'PO-TEST-T1', title: '流感疫苗', description: '每年秋季接种。', domain: 'vaccine', priority: 'P1' },
          ],
          development: [
            { ruleId: 'PO-TEST-G0', title: '角色转型', description: '被咨询时才发言。', domain: 'social', priority: 'P1' },
          ],
          healthOverflow: 0,
          developmentOverflow: 0,
        }}
      />,
    );

    expect(screen.queryByText('每半年检查一次视力。')).toBeNull();
    expect(screen.queryByText('被咨询时才发言。')).toBeNull();

    fireEvent.click(screen.getByText('视力定期检查'));
    expect(screen.getByText('每半年检查一次视力。')).toBeTruthy();

    fireEvent.click(screen.getByText('流感疫苗'));
    expect(screen.queryByText('每半年检查一次视力。')).toBeNull();
    expect(screen.getByText('每年秋季接种。')).toBeTruthy();

    fireEvent.click(screen.getByText('角色转型'));
    expect(screen.getByText('被咨询时才发言。')).toBeTruthy();
    expect(screen.getByText('每年秋季接种。')).toBeTruthy();

    fireEvent.click(screen.getByText('角色转型'));
    expect(screen.queryByText('被咨询时才发言。')).toBeNull();
  });

  it('renders the getting-started guide with three linked steps', async () => {
    const { container } = renderInRouter(<GettingStartedCard />);

    expect(screen.getByText('先从这三件事开始，记录孩子的成长')).toBeTruthy();
    expect(screen.getByText('记录第一次成长测量')).toBeTruthy();
    expect(screen.getByText('记录一次睡眠')).toBeTruthy();
    expect(screen.getByText('写一篇成长随记')).toBeTruthy();
    const links = Array.from(container.querySelectorAll('a'));
    fireEvent.click(links[0]!); await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('growth'));
    fireEvent.click(links[1]!); await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('sleep'));
    fireEvent.click(links[2]!); await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('/journal'));
  });
});
