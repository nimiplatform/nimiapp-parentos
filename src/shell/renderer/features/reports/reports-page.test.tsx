// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from './reports-page.js';
import { useAppStore } from '../../app-shell/app-store.js';
import { getRollingReportPeriod } from './report-cycle.js';

const reportStore: Array<{
  reportId: string;
  childId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  ageMonthsStart: number;
  ageMonthsEnd: number;
  content: string;
  generatedAt: string;
  createdAt: string;
}> = [];

const {
  getGrowthReportsMock,
  insertGrowthReportMock,
  getMeasurementsMock,
  getMilestoneRecordsMock,
  getVaccineRecordsMock,
  getJournalEntriesMock,
  getReminderStatesMock,
  getSleepRecordsMock,
  getDentalRecordsMock,
  getAllergyRecordsMock,
  getMedicalEventsMock,
  getFitnessAssessmentsMock,
  getTannerAssessmentsMock,
} = vi.hoisted(() => ({
  getGrowthReportsMock: vi.fn(async () => [...reportStore].sort((left, right) => right.periodStart.localeCompare(left.periodStart))),
  insertGrowthReportMock: vi.fn(async (params: {
    reportId: string;
    childId: string;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    ageMonthsStart: number;
    ageMonthsEnd: number;
    content: string;
    generatedAt: string;
    now: string;
  }) => {
    reportStore.unshift({
      reportId: params.reportId,
      childId: params.childId,
      reportType: params.reportType,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      ageMonthsStart: params.ageMonthsStart,
      ageMonthsEnd: params.ageMonthsEnd,
      content: params.content,
      generatedAt: params.generatedAt,
      createdAt: params.now,
    });
  }),
  getMeasurementsMock: vi.fn().mockResolvedValue([
    {
      measurementId: 'm-1',
      childId: 'child-1',
      typeId: 'height',
      value: 98.4,
      measuredAt: '2026-04-01T00:00:00.000Z',
      ageMonths: 26,
      percentile: null,
      source: 'manual',
      notes: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ]),
  getMilestoneRecordsMock: vi.fn().mockResolvedValue([]),
  getVaccineRecordsMock: vi.fn().mockResolvedValue([]),
  getJournalEntriesMock: vi.fn().mockResolvedValue([
    {
      entryId: 'j-1',
      childId: 'child-1',
      contentType: 'voice',
      textContent: null,
      voicePath: 'C:/voice/entry.webm',
      photoPaths: null,
      recordedAt: '2026-04-02T00:00:00.000Z',
      ageMonths: 26,
      observationMode: 'five-minute',
      dimensionId: null,
      selectedTags: null,
      guidedAnswers: null,
      observationDuration: 5,
      keepsake: 0,
      recorderId: 'mom',
      createdAt: '2026-04-02T00:00:00.000Z',
      updatedAt: '2026-04-02T00:00:00.000Z',
    },
  ]),
  getReminderStatesMock: vi.fn().mockResolvedValue([
    {
      stateId: 'r-1',
      childId: 'child-1',
      ruleId: 'PO-REM-VAC-001',
      status: 'pending',
      activatedAt: null,
      completedAt: null,
      dismissedAt: null,
      dismissReason: null,
      repeatIndex: 0,
      nextTriggerAt: null,
      snoozedUntil: null,
      scheduledDate: null,
      notApplicable: 0,
      plannedForDate: null,
      surfaceRank: null,
      lastSurfacedAt: null,
      surfaceCount: 0,
      notes: null,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ]),
  getSleepRecordsMock: vi.fn().mockResolvedValue([]),
  getDentalRecordsMock: vi.fn().mockResolvedValue([]),
  getAllergyRecordsMock: vi.fn().mockResolvedValue([]),
  getMedicalEventsMock: vi.fn().mockResolvedValue([]),
  getFitnessAssessmentsMock: vi.fn().mockResolvedValue([]),
  getTannerAssessmentsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getGrowthReports: getGrowthReportsMock,
  insertGrowthReport: insertGrowthReportMock,
  getMeasurements: getMeasurementsMock,
  getMilestoneRecords: getMilestoneRecordsMock,
  getVaccineRecords: getVaccineRecordsMock,
  getJournalEntries: getJournalEntriesMock,
  getReminderStates: getReminderStatesMock,
  getSleepRecords: getSleepRecordsMock,
  getDentalRecords: getDentalRecordsMock,
  getAllergyRecords: getAllergyRecordsMock,
  getMedicalEvents: getMedicalEventsMock,
  getFitnessAssessments: getFitnessAssessmentsMock,
  getTannerAssessments: getTannerAssessmentsMock,
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    reportStore.length = 0;
    insertGrowthReportMock.mockClear();
    getGrowthReportsMock.mockClear();
    useAppStore.setState({
      bootstrapReady: true,
      familyId: 'family-1',
      activeChildId: 'child-1',
      children: [
        {
          childId: 'child-1',
          familyId: 'family-1',
          displayName: 'Mimi',
          gender: 'female',
          birthDate: '2024-01-15',
          birthWeightKg: null,
          birthHeightCm: null,
          birthHeadCircCm: null,
          avatarPath: null,
          nurtureMode: 'balanced',
          nurtureModeOverrides: null,
          allergies: null,
          medicalNotes: null,
          recorderProfiles: [{ id: 'mom', name: 'Mom' }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  afterEach(() => {
    useAppStore.setState({
      bootstrapReady: false,
      familyId: null,
      activeChildId: null,
      children: [],
    });
  });

  const renderPage = () => render(<MemoryRouter><ReportsPage /></MemoryRouter>);

  function setClosedFirstCycle() {
    const child = useAppStore.getState().children[0];
    if (!child) throw new Error('Missing test child');
    const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    useAppStore.setState({ children: [{ ...child, createdAt, updatedAt: createdAt }] });
    return getRollingReportPeriod(createdAt, 1);
  }

  it('shows an explicit accumulation state before the first rolling month closes', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('正在积累Mimi的成长报告')).toBeTruthy();
      expect(screen.getByText('记录满一个月后，将自动生成第一份成长报告')).toBeTruthy();
    });

    expect(screen.getByRole('link', { name: /记录一个瞬间/i }).getAttribute('href')).toBe('/journal');
    expect(screen.queryByRole('button', { name: /高级选项/i })).toBeNull();
    expect(insertGrowthReportMock).not.toHaveBeenCalled();
  });

  it('automatically persists the first report after the rolling month closes', async () => {
    const firstCycle = setClosedFirstCycle();

    renderPage();

    await waitFor(() => {
      expect(insertGrowthReportMock).toHaveBeenCalledTimes(1);
    });

    const firstCall = insertGrowthReportMock.mock.calls[0]?.[0];
    expect(firstCall?.periodStart).toBe(firstCycle.periodStart);
    expect(JSON.parse(firstCall?.content ?? '{}')).toMatchObject({ format: 'structured-local', reportType: 'monthly' });
    await waitFor(() => expect(screen.queryByText('正在积累Mimi的成长报告')).toBeNull());
  });

  it('generates and persists a structured local report', async () => {
    const firstCycle = setClosedFirstCycle();
    const now = firstCycle.generationAt;
    reportStore.unshift({
      reportId: 'existing-report',
      childId: 'child-1',
      reportType: 'monthly',
      periodStart: firstCycle.periodStart,
      periodEnd: firstCycle.periodEnd,
      ageMonthsStart: 30,
      ageMonthsEnd: 30,
      content: JSON.stringify({
        version: 1,
        format: 'structured-local',
        reportType: 'monthly',
        title: 'Mimi 的首份成长报告',
        subtitle: '本地记录',
        generatedAt: now,
        overview: [],
        metrics: [],
        trendSignals: [],
        sections: [],
        sources: [],
        safetyNote: '仅供记录。',
      }),
      generatedAt: now,
      createdAt: now,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Mimi 的首份成长报告')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /高级选项/i }));
    fireEvent.click(screen.getByRole('button', { name: /生成综合报告/i }));

    await waitFor(() => {
      expect(insertGrowthReportMock).toHaveBeenCalledTimes(1);
    });

    const firstCall = insertGrowthReportMock.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    const storedPayload = JSON.parse((firstCall as { content: string }).content) as { format: string; reportType: string };
    expect(storedPayload.format).toBe('structured-local');
    expect(storedPayload.reportType).toBe('quarterly-letter');

    await waitFor(() => {
      expect(screen.queryByText(/还没有成长报告/i)).toBeNull();
    });
  });

  it('keeps parent-selected calendar months out of the automatic monthly contract', async () => {
    const firstCycle = setClosedFirstCycle();
    reportStore.unshift({
      reportId: 'existing-report',
      childId: 'child-1',
      reportType: 'monthly',
      periodStart: firstCycle.periodStart,
      periodEnd: firstCycle.periodEnd,
      ageMonthsStart: 30,
      ageMonthsEnd: 30,
      content: JSON.stringify({
        version: 1,
        format: 'structured-local',
        reportType: 'monthly',
        title: 'Mimi 的首份成长报告',
        subtitle: '本地记录',
        generatedAt: firstCycle.generationAt,
        overview: [],
        metrics: [],
        trendSignals: [],
        sections: [],
        sources: [],
        safetyNote: '仅供记录。',
      }),
      generatedAt: firstCycle.generationAt,
      createdAt: firstCycle.generationAt,
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Mimi 的首份成长报告')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /高级选项/i }));
    fireEvent.click(screen.getByRole('button', { name: '本月' }));
    fireEvent.click(screen.getByRole('button', { name: /生成综合报告/i }));

    await waitFor(() => expect(insertGrowthReportMock).toHaveBeenCalledTimes(1));
    expect(insertGrowthReportMock.mock.calls[0]?.[0]?.reportType).toBe('custom');
  });

  it('renders persisted narrative-ai reports from the unified reports store', async () => {
    const firstCycle = setClosedFirstCycle();
    reportStore.unshift({
      reportId: 'report-1',
      childId: 'child-1',
      reportType: 'monthly',
      periodStart: firstCycle.periodStart,
      periodEnd: firstCycle.periodEnd,
      ageMonthsStart: 26,
      ageMonthsEnd: 27,
      content: JSON.stringify({
        version: 2,
        format: 'narrative-ai',
        reportType: 'monthly',
        title: 'Mimi 的四月成长报告',
        subtitle: '2026-04-01 至 2026-04-30',
        teaser: '',
        opening: '这个月继续稳步成长。',
        generatedAt: '2026-04-30T23:59:59.999Z',
        narrativeSections: [
          { id: 'growth', title: '生长发育', narrative: '本月继续稳步成长。' },
        ],
        actionItems: [],
        trendSignals: [],
        metrics: [],
        sources: ['local measurements'],
        safetyNote: '如需详细解读，建议咨询专业人士。',
      }),
      generatedAt: firstCycle.generationAt,
      createdAt: firstCycle.generationAt,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mimi 的四月成长报告')).toBeTruthy();
      expect(screen.getByText('AI 撰写')).toBeTruthy();
      expect(screen.getByText('本月继续稳步成长。')).toBeTruthy();
    });
  });

  it('fails closed instead of adapting a persisted monthly row outside the rolling contract', async () => {
    const child = useAppStore.getState().children[0];
    if (!child) throw new Error('Missing test child');
    reportStore.unshift({
      reportId: 'invalid-half-month',
      childId: child.childId,
      reportType: 'monthly',
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: child.createdAt,
      ageMonthsStart: 30,
      ageMonthsEnd: 30,
      content: JSON.stringify({
        version: 2,
        format: 'narrative-ai',
        reportType: 'monthly',
        title: '不应展示的半月报告',
        subtitle: '',
        teaser: '',
        generatedAt: child.createdAt,
        narrativeSections: [],
        actionItems: [],
        trendSignals: [],
        metrics: [],
        sources: [],
        safetyNote: '',
      }),
      generatedAt: child.createdAt,
      createdAt: child.createdAt,
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('本地数据不符合当前报告合同，成长报告未加载。')).toBeTruthy();
    expect(screen.queryByText('不应展示的半月报告')).toBeNull();
    expect(insertGrowthReportMock).not.toHaveBeenCalled();
  });

  it('fails closed when persisted report content is malformed', async () => {
    const firstCycle = setClosedFirstCycle();
    reportStore.unshift({
      reportId: 'malformed-report',
      childId: 'child-1',
      reportType: 'monthly',
      periodStart: firstCycle.periodStart,
      periodEnd: firstCycle.periodEnd,
      ageMonthsStart: 30,
      ageMonthsEnd: 30,
      content: '{}',
      generatedAt: firstCycle.generationAt,
      createdAt: firstCycle.generationAt,
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('本地数据不符合当前报告合同，成长报告未加载。')).toBeTruthy();
    expect(insertGrowthReportMock).not.toHaveBeenCalled();
  });
});
