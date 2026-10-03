// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from './reports-page.js';
import { useAppStore } from '../../app-shell/app-store.js';
import { getRollingReportPeriod } from './report-cycle.js';
import { refreshReportWithAi } from './report-ai-refresh.js';

type StoredReport = {
  reportId: string; childId: string; reportType: string; periodStart: string; periodEnd: string;
  ageMonthsStart: number; ageMonthsEnd: number; content: string; generatedAt: string; createdAt: string;
};

const reportStore: StoredReport[] = [];

const {
  getGrowthReportsMock, updateGrowthReportContentMock, hasCapabilityMock, generateNarrativeMock,
} = vi.hoisted(() => ({
  getGrowthReportsMock: vi.fn(async (childId: string) => reportStore.filter((row) => row.childId === childId).sort((l, r) => r.periodStart.localeCompare(l.periodStart))),
  updateGrowthReportContentMock: vi.fn(async (params: { reportId: string; content: string; now: string }) => {
    const row = reportStore.find((item) => item.reportId === params.reportId);
    if (row) row.content = params.content;
  }),
  hasCapabilityMock: vi.fn(async () => true),
  generateNarrativeMock: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getGrowthReports: getGrowthReportsMock,
  insertGrowthReport: vi.fn(),
  updateGrowthReportContent: updateGrowthReportContentMock,
  getMeasurements: vi.fn().mockResolvedValue([]),
  getMilestoneRecords: vi.fn().mockResolvedValue([]),
  getVaccineRecords: vi.fn().mockResolvedValue([]),
  getJournalEntries: vi.fn().mockResolvedValue([]),
  getReminderStates: vi.fn().mockResolvedValue([]),
  getSleepRecords: vi.fn().mockResolvedValue([]),
  getDentalRecords: vi.fn().mockResolvedValue([]),
  getAllergyRecords: vi.fn().mockResolvedValue([]),
  getMedicalEvents: vi.fn().mockResolvedValue([]),
  getFitnessAssessments: vi.fn().mockResolvedValue([]),
  getTannerAssessments: vi.fn().mockResolvedValue([]),
}));

vi.mock('../settings/parentos-ai-config.js', () => ({
  PARENTOS_TEXT_CAPABILITY_CONTRACT: 'text.generate',
  hasParentosAIConfigCapability: hasCapabilityMock,
}));

vi.mock('./narrative-prompt.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./narrative-prompt.js')>()),
  generateNarrativeReportForPeriod: generateNarrativeMock,
}));

function structuredContent(reportType: string) {
  return JSON.stringify({
    version: 1, format: 'structured-local', reportType,
    title: "Mimi's monthly report", subtitle: 'local', generatedAt: '2026-04-30T00:00:00.000Z',
    overview: ['Mimi monthly report', 'This window includes 0 growth measurements.'],
    metrics: [], trendSignals: [], sections: [], sources: [], safetyNote: 'Facts only.',
  });
}

function narrativeContent() {
  return {
    version: 2, format: 'narrative-ai', reportType: 'monthly',
    title: 'Mimi 的 AI 成长摘要', subtitle: '', teaser: '', opening: 'AI 重写后的开场。',
    generatedAt: '2026-04-30T00:00:00.000Z',
    narrativeSections: [{ id: 'growth', title: '生长发育', narrative: '本月继续记录。' }],
    actionItems: [], trendSignals: [], metrics: [], sources: [], safetyNote: '仅供参考。',
  };
}

describe('report AI refresh', () => {
  let firstCycle: ReturnType<typeof getRollingReportPeriod>;

  beforeEach(() => {
    reportStore.length = 0;
    updateGrowthReportContentMock.mockClear();
    generateNarrativeMock.mockReset();
    hasCapabilityMock.mockResolvedValue(true);
    const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    firstCycle = getRollingReportPeriod(createdAt, 1);
    useAppStore.setState({
      bootstrapReady: true,
      familyId: 'family-1',
      activeChildId: 'child-1',
      children: [{
        childId: 'child-1', familyId: 'family-1', displayName: 'Mimi', gender: 'female', birthDate: '2024-01-15',
        birthWeightKg: null, birthHeightCm: null, birthHeadCircCm: null, avatarPath: null,
        nurtureMode: 'balanced', nurtureModeOverrides: null, allergies: null, medicalNotes: null,
        recorderProfiles: [{ id: 'mom', name: 'Mom' }], createdAt, updatedAt: createdAt,
      }],
    });
    reportStore.push({
      reportId: 'report-1', childId: 'child-1', reportType: 'monthly',
      periodStart: firstCycle.periodStart, periodEnd: firstCycle.periodEnd,
      ageMonthsStart: 26, ageMonthsEnd: 27, content: structuredContent('monthly'),
      generatedAt: firstCycle.generationAt, createdAt: firstCycle.generationAt,
    });
  });

  afterEach(() => {
    useAppStore.setState({ bootstrapReady: false, familyId: null, activeChildId: null, children: [] });
  });

  const renderPage = () => render(<MemoryRouter><ReportsPage /></MemoryRouter>);

  it('rewrites a local monthly report in place once AI is connected', async () => {
    generateNarrativeMock.mockImplementation(async ({ period }: { period: { start: string; end: string } }) => ({
      reportType: 'monthly', periodStart: period.start, periodEnd: period.end,
      ageMonthsStart: 26, ageMonthsEnd: 27, content: narrativeContent(),
    }));
    renderPage();

    const button = await screen.findByRole('button', { name: '用 AI 重写本期报告' });
    expect(screen.getByText('AI 已连接，本期报告可以重写')).toBeTruthy();
    fireEvent.click(button);

    await waitFor(() => expect(updateGrowthReportContentMock).toHaveBeenCalledTimes(1));
    expect(generateNarrativeMock.mock.calls[0]?.[0]).toMatchObject({
      period: { start: firstCycle.periodStart, end: firstCycle.periodEnd },
      reportType: 'monthly',
    });
    const call = updateGrowthReportContentMock.mock.calls[0]?.[0];
    expect(call?.reportId).toBe('report-1');
    expect(JSON.parse(call?.content ?? '{}')).toMatchObject({ version: 2, format: 'narrative-ai', reportType: 'monthly' });
    await waitFor(() => expect(screen.queryByText('AI 已连接，本期报告可以重写')).toBeNull());
  });

  it('keeps the local report and points to AI settings while AI is unavailable', async () => {
    hasCapabilityMock.mockResolvedValue(false);
    renderPage();

    await waitFor(() => expect(screen.getByText('AI 未连接')).toBeTruthy());
    expect(screen.getByRole('link', { name: '去连接 AI' }).getAttribute('href')).toBe('/settings/ai');
    expect(screen.queryByRole('button', { name: '用 AI 重写本期报告' })).toBeNull();
    expect(updateGrowthReportContentMock).not.toHaveBeenCalled();
  });

  it('leaves the persisted report unchanged when AI narration fails', async () => {
    generateNarrativeMock.mockRejectedValue(new Error('runtime timeout'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '用 AI 重写本期报告' }));

    await waitFor(() => expect(generateNarrativeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: '用 AI 重写本期报告' })).toBeTruthy());
    expect(updateGrowthReportContentMock).not.toHaveBeenCalled();
    expect(JSON.parse(reportStore[0]!.content)).toMatchObject({ version: 1 });
    expect(screen.getByRole('alert').textContent).toContain('runtime timeout');
  });

  it('never rewrites version 2 content', async () => {
    const child = useAppStore.getState().children[0]!;
    const row = { ...reportStore[0]!, content: JSON.stringify(narrativeContent()) };
    await expect(refreshReportWithAi(child, row)).rejects.toThrow(/not a local structured report/);
    expect(generateNarrativeMock).not.toHaveBeenCalled();
  });

  it('does not show the old child report when its AI rewrite finishes after a child switch', async () => {
    let finish!: (value: { content: ReturnType<typeof narrativeContent> }) => void;
    generateNarrativeMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '用 AI 重写本期报告' }));
    await waitFor(() => expect(generateNarrativeMock).toHaveBeenCalledTimes(1));
    const first = useAppStore.getState().children[0]!;
    act(() => useAppStore.setState({
      activeChildId: 'child-2',
      children: [first, { ...first, childId: 'child-2', displayName: 'Nana', createdAt: new Date().toISOString() }],
    }));
    await act(async () => { finish({ content: narrativeContent() }); });
    await waitFor(() => expect(updateGrowthReportContentMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('AI 重写后的开场。')).toBeNull();
    expect(screen.queryByText('Mimi 的 AI 成长摘要')).toBeNull();
  });

  it('offers a batch rewrite for older local reports in history', async () => {
    const secondCycle = getRollingReportPeriod(useAppStore.getState().children[0]!.createdAt, 2);
    reportStore.push({
      reportId: 'report-custom', childId: 'child-1', reportType: 'custom',
      periodStart: firstCycle.periodStart, periodEnd: secondCycle.periodEnd,
      ageMonthsStart: 26, ageMonthsEnd: 27, content: structuredContent('custom'),
      generatedAt: firstCycle.generationAt, createdAt: firstCycle.generationAt,
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: '全部用 AI 重写（2）' })).toBeTruthy());
    // v1 history titles are re-localized instead of showing the frozen English title.
    expect(screen.getByText('Mimi的综合成长报告')).toBeTruthy();
    expect(screen.getByText('本地整理')).toBeTruthy();
  });
});
