// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import MedicalEventsPage from './medical-events-page.js';
import { useAppStore } from '../../app-shell/app-store.js';
import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { i18n } from '../../i18n/index.js';

const { getMedicalEventsMock } = vi.hoisted(() => ({
  getMedicalEventsMock: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getMedicalEvents: getMedicalEventsMock,
  insertMedicalEvent: vi.fn().mockResolvedValue(undefined),
  updateMedicalEvent: vi.fn().mockResolvedValue(undefined),
  getAppSetting: vi.fn().mockResolvedValue(null),
  setAppSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../settings/parentos-ai-runtime.js', () => ({
  runParentosTextGenerate: vi.fn(),
}));

vi.mock('./ai-summary-card.js', () => ({
  AISummaryCard: () => <div>AI Summary</div>,
}));

function makeEvent(overrides: Partial<MedicalEventRow>): MedicalEventRow {
  return {
    eventId: 'evt',
    childId: 'child-1',
    eventType: 'visit',
    title: '',
    eventDate: '2026-05-20',
    endDate: null,
    ageMonths: 55,
    severity: null,
    result: null,
    hospital: null,
    medication: null,
    dosage: null,
    notes: null,
    photoPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const EVENTS: MedicalEventRow[] = [
  makeEvent({
    eventId: 'uri',
    title: '上呼吸道感染就诊',
    eventDate: '2026-05-20',
    endDate: '2026-05-24',
    severity: 'mild',
    hospital: '儿科门诊',
    notes: '流涕咳嗽 3 天，无发热',
  }),
  makeEvent({
    eventId: 'rhinitis-2',
    title: '过敏性鼻炎复诊',
    eventDate: '2026-04-15',
    hospital: '儿童医院耳鼻喉科',
    medication: '生理盐水喷雾',
    dosage: '每日 2 次',
  }),
  makeEvent({
    eventId: 'lab',
    eventType: 'lab-report',
    title: '检验报告',
    eventDate: '2026-03-12',
    notes: JSON.stringify({ type: 'lab-report', values: { 'vitamin-d': 31, ferritin: 29 } }),
  }),
  makeEvent({
    eventId: 'rhinitis-1',
    title: '过敏性鼻炎复诊',
    eventDate: '2025-11-03',
    medication: '生理盐水喷雾',
  }),
];

function renderPage() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <MedicalEventsPage />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe('MedicalEventsPage archive layout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T10:00:00.000Z'));
    i18n.changeLanguage('zh');
    Element.prototype.scrollIntoView = vi.fn();
    getMedicalEventsMock.mockReset();
    getMedicalEventsMock.mockResolvedValue(EVENTS);
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
          birthDate: '2021-10-12',
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
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAppStore.setState({
      bootstrapReady: false,
      familyId: null,
      activeChildId: null,
      children: [],
    });
  });

  it('summarizes records and renders a date-grouped timeline with a year divider', async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    expect(within(screen.getByText('近一年就医').parentElement!).getByText('4')).toBeTruthy();
    expect(within(screen.getByText('距上次就医').parentElement!).getByText('127')).toBeTruthy();
    expect(screen.getByText('就医概览')).toBeTruthy();
    expect(screen.getByRole('button', { name: /过敏性鼻炎复诊/ })).toBeTruthy();

    expect(screen.getByText('5月20日')).toBeTruthy();
    expect(screen.getByRole('separator', { name: '2025 年' })).toBeTruthy();
    expect(screen.getByText(/持续 5 天/)).toBeTruthy();
    expect(screen.getByText('维生素D')).toBeTruthy();
    expect(screen.getByText('不足')).toBeTruthy();
    // The old admin-style search box is gone until the search icon is used.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('filters by type tab, search and overview chips, and clears back to all records', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));

    const typeFilter = screen.getByRole('group', { name: '筛选就医事件类型' });
    fireEvent.click(within(typeFilter).getByRole('button', { name: '检验报告' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.click(within(typeFilter).getByRole('button', { name: '全部' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: /生理盐水喷雾/ }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect((screen.getByRole('textbox', { name: '搜索记录' }) as HTMLInputElement).value).toBe('生理盐水喷雾');
    expect(screen.getByText('找到 2 条匹配记录')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: '搜索记录' }), { target: { value: '不存在' } });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: '搜索记录' })).toBeTruthy();
  });

  it('shows only the empty card before any record exists', async () => {
    getMedicalEventsMock.mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(getMedicalEventsMock).toHaveBeenCalled());
    expect(await screen.findByText('还没有就医记录')).toBeTruthy();
    expect(screen.queryByText('近一年就医')).toBeNull();
    expect(screen.queryByText('历史记录')).toBeNull();
    expect(screen.getByRole('button', { name: /添加记录/ })).toBeTruthy();
  });
});
