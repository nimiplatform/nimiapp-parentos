// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TannerPage from './tanner-page.js';
import { TannerCaptureContent } from './tanner-assessment-form.js';
import { HealthRecordModalShell } from './health-record-modal-shell.js';
import { tannerStageChanges } from './tanner-page-shared.js';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import { i18n } from '../../i18n/index.js';

const bridge = vi.hoisted(() => ({
  getTannerAssessments: vi.fn(),
  getMeasurements: vi.fn(),
  insertTannerAssessment: vi.fn(),
  insertMeasurement: vi.fn(),
}));
vi.mock('../../bridge/sqlite-bridge.js', () => bridge);
vi.mock('./ai-summary-card.js', () => ({
  AISummaryCard: ({ dataContext }: { dataContext: string }) => (
    <output data-testid="summary-context">{dataContext}</output>
  ),
}));

const child: ChildProfile = {
  childId: 'child-1',
  familyId: 'family-1',
  displayName: '测试孩子',
  birthDate: '2015-01-01',
  gender: 'female',
  birthWeightKg: null,
  birthHeightCm: null,
  birthHeadCircCm: null,
  avatarPath: null,
  nurtureMode: 'balanced',
  nurtureModeOverrides: null,
  allergies: null,
  medicalNotes: null,
  recorderProfiles: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
function record(overrides: Partial<TannerAssessmentRow> = {}): TannerAssessmentRow {
  return {
    assessmentId: 'record-1',
    childId: child.childId,
    assessedAt: '2026-09-01',
    ageMonths: 140,
    breastOrGenitalStage: 2,
    pubicHairStage: 1,
    menarcheStatus: null,
    menarcheDate: null,
    assessedBy: 'physician',
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}
function page() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <TannerPage />
      </MemoryRouter>
    </TooltipProvider>,
  );
}
function form(onSaved = vi.fn(), onClose = vi.fn()) {
  render(
    <TooltipProvider>
      <HealthRecordModalShell open size="XL" onClose={onClose}>
        <TannerCaptureContent child={child} onSaved={onSaved} onClose={onClose} />
      </HealthRecordModalShell>
    </TooltipProvider>,
  );
  return { onSaved, onClose };
}
function chooseStages() {
  const groups = screen.getAllByRole('group');
  const breast = groups.find(
    (node) => node.querySelector('legend')?.textContent === '乳房发育 (B期)',
  );
  const pubic = groups.find(
    (node) => node.querySelector('legend')?.textContent === '阴毛发育 (PH期)',
  );
  if (!breast || !pubic) throw new Error('Stage fields missing');
  fireEvent.click(within(breast).getByRole('radio', { name: /^B2/ }));
  fireEvent.click(within(pubic).getByRole('radio', { name: /^PH1/ }));
}
beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('zh');
  bridge.getTannerAssessments.mockResolvedValue([]);
  bridge.getMeasurements.mockResolvedValue([]);
  bridge.insertTannerAssessment.mockResolvedValue(undefined);
  bridge.insertMeasurement.mockResolvedValue(undefined);
  useAppStore.setState({ activeChildId: child.childId, children: [child] });
});
afterEach(cleanup);

describe('Tanner records page', () => {
  it('shows the most recently saved record first when assessment dates match', async () => {
    bridge.getTannerAssessments.mockResolvedValue([
      record({ notes: 'earlier entry', createdAt: '2026-09-01T08:00:00.000Z' }),
      record({
        assessmentId: 'second',
        notes: 'later entry',
        createdAt: '2026-09-01T09:00:00.000Z',
      }),
    ]);
    page();
    const latest = await screen.findByRole('region', { name: '最近一次记录' });
    expect(within(latest).getByText(/later entry/)).toBeTruthy();
    expect(within(latest).queryByText(/earlier entry/)).toBeNull();
  });
  it('rejects an invalid stored stage instead of displaying it as missing', async () => {
    bridge.getTannerAssessments.mockResolvedValue([record({ breastOrGenitalStage: 6 })]);
    page();
    await screen.findByRole('alert');
    expect(screen.queryByText('未记录')).toBeNull();
  });
  it('offers a first record without an inferred stage or personalized advice', async () => {
    page();
    await screen.findByRole('button', { name: '添加首次记录' });
    expect(screen.queryByText('按年龄推荐')).toBeNull();
    expect(screen.queryByText('下一阶段预告')).toBeNull();
    expect(screen.queryByText('B1 · 青春前期')).toBeNull();
    expect(screen.getByText(/测试孩子/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '添加首次记录' }));
    expect(screen.getAllByRole('radio').every((node) => !(node as HTMLInputElement).checked)).toBe(
      true,
    );
  });
  it('shows a retryable read failure rather than an empty state', async () => {
    bridge.getTannerAssessments.mockRejectedValueOnce(new Error('read failed'));
    page();
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: '添加首次记录' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByRole('button', { name: '添加首次记录' });
  });
  it('separates dated axes and puts records before supporting measurements', async () => {
    bridge.getTannerAssessments.mockResolvedValue([
      record({ breastOrGenitalStage: null, pubicHairStage: 3, notes: '本次备注' }),
    ]);
    page();
    await screen.findByRole('heading', { name: '最近一次记录' });
    expect(screen.getByText('未记录')).toBeTruthy();
    expect(screen.getByText('医生评估')).toBeTruthy();
    expect(screen.getByText(/本次备注/)).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: '最近一次记录' })).queryByText('B3 · 发育中期'),
    ).toBeNull();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings.indexOf('最近一次记录')).toBeLessThan(headings.indexOf('相关生长数据'));
    fireEvent.click(screen.getByRole('button', { name: '请 AI 整理记录' }));
    expect(
      JSON.parse(screen.getByTestId('summary-context').textContent ?? '').latestFiveRecords[0],
    ).toMatchObject({ breastOrGenitalStage: null, pubicHairStage: 3, assessedAt: '2026-09-01' });
  });
  it('lists earlier records on the dated timeline with their assessor and unrecorded axes', async () => {
    bridge.getTannerAssessments.mockResolvedValue([
      record({ assessmentId: 'latest', assessedAt: '2026-08-16', breastOrGenitalStage: 4 }),
      record({ assessmentId: 'spring', assessedAt: '2026-03-28', breastOrGenitalStage: 3 }),
      record({
        assessmentId: 'autumn',
        assessedAt: '2025-09-21',
        breastOrGenitalStage: 3,
        pubicHairStage: null,
        assessedBy: '青少年保健门诊',
        notes: '上一年的门诊记录',
      }),
    ]);
    page();
    const history = await screen.findByRole('region', { name: '历史记录' });
    expect(within(history).getByRole('separator', { name: '2025 年' })).toBeTruthy();
    expect(within(history).getByText('青少年保健门诊')).toBeTruthy();
    expect(within(history).getByText('未记录')).toBeTruthy();
    expect(within(history).getByText('上一年的门诊记录')).toBeTruthy();
    expect(within(history).getAllByRole('article')).toHaveLength(2);
  });
  it('ignores an old child request after switching children', async () => {
    let resolveOld!: (value: TannerAssessmentRow[]) => void;
    bridge.getTannerAssessments.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    page();
    expect(screen.getByText('正在读取发育记录…')).toBeTruthy();
    expect(screen.queryByText('还没有青春期发育记录')).toBeNull();
    act(() =>
      useAppStore.setState({
        activeChildId: 'child-2',
        children: [child, { ...child, childId: 'child-2', displayName: '第二位孩子' }],
      }),
    );
    await screen.findByRole('button', { name: '添加首次记录' });
    await act(async () => resolveOld([record({ notes: '旧孩子的备注' })]));
    expect(screen.queryByText(/旧孩子的备注/)).toBeNull();
  });
  it('keeps threshold notices visible outside collapsed knowledge', async () => {
    bridge.getTannerAssessments.mockResolvedValue([
      record({ breastOrGenitalStage: 4 }),
      record({ assessmentId: 'old', assessedAt: '2026-01-01', breastOrGenitalStage: 2 }),
    ]);
    page();
    await screen.findByRole('heading', { name: '记录中观察到的变化' });
    expect(screen.getByText(/建议携带记录咨询专业人士/).closest('details')).toBeNull();
  });
});

describe('Tanner capture', () => {
  it('requires explicit choices and preserves an unspecified menarche status', async () => {
    const { onSaved } = form();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(bridge.insertTannerAssessment).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('分别选择');
    chooseStages();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(bridge.insertTannerAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        breastOrGenitalStage: 2,
        pubicHairStage: 1,
        menarcheStatus: null,
        menarcheDate: null,
      }),
    );
  });
  it('retains entries after a failed write and allows retry', async () => {
    bridge.insertTannerAssessment.mockRejectedValueOnce(new Error('write failed'));
    const { onSaved } = form();
    chooseStages();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('alert');
    expect(onSaved).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole('radio').filter((node) => (node as HTMLInputElement).checked),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });
  it('does not repeat a successful assessment when a supplementary measurement fails', async () => {
    bridge.insertMeasurement.mockRejectedValueOnce(new Error('measurement failed'));
    const { onSaved } = form();
    chooseStages();
    fireEvent.change(screen.getByPlaceholderText('如：11.5'), { target: { value: '11.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('alert');
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(bridge.insertTannerAssessment).toHaveBeenCalledOnce();
    expect(bridge.insertMeasurement).toHaveBeenCalledTimes(2);
  });
});

describe('Tanner recorded changes', () => {
  it('compares each axis independently within the admitted window', () => {
    expect(
      tannerStageChanges([
        record({ pubicHairStage: 4 }),
        record({
          assessmentId: 'old',
          assessedAt: '2026-01-01',
          breastOrGenitalStage: 1,
          pubicHairStage: 1,
        }),
      ]),
    ).toEqual([expect.objectContaining({ axis: 'pubicHairStage', previous: 1, latest: 4 })]);
    expect(
      tannerStageChanges([
        record({ breastOrGenitalStage: 4 }),
        record({ assessmentId: 'old', assessedAt: '2024-01-01', breastOrGenitalStage: 1 }),
      ]),
    ).toEqual([]);
  });
});
