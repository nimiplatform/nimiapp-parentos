// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { i18n, i18nText } from '../../i18n/index.js';
import { formatWeekRange } from './outdoor-helpers.js';
import { OutdoorPage } from './outdoor-page.js';

const bridge = vi.hoisted(() => ({
  getOutdoorRecords: vi.fn(),
  getOutdoorGoal: vi.fn(),
  setOutdoorGoal: vi.fn(),
  insertOutdoorRecord: vi.fn(),
  updateOutdoorRecord: vi.fn(),
  deleteOutdoorRecord: vi.fn(),
  getMeasurements: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => bridge);

async function renderPage() {
  const view = render(
    <MemoryRouter>
      <OutdoorPage />
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}

const art = () => document.querySelector('img.parentos-outdoor-hero__art');
const goalField = () => screen.getByRole('spinbutton', { name: i18nText('Outdoor.page.goalSetup.inputAria') }) as HTMLInputElement;
const button = (key: string) => screen.getByRole('button', { name: i18nText(key) });
// The tracker's goal line reads "每周目标 N 分钟 · 调整" and opens the goal picker.
const goalButton = (minutes: number) => screen.getByRole('button', {
  name: (name) => name.startsWith(i18nText('Outdoor.page.tracker.weeklyGoal', { minutes })),
});
const trendCard = () => screen.getByRole('region', {
  name: i18nText('Outdoor.page.tracker.trend.title', { weeks: 12 }),
});

describe('OutdoorPage goal flow', () => {
  beforeEach(() => {
    void i18n.changeLanguage('zh');
    bridge.getOutdoorRecords.mockResolvedValue([]);
    bridge.getOutdoorGoal.mockResolvedValue(null);
    bridge.setOutdoorGoal.mockResolvedValue(undefined);
    bridge.getMeasurements.mockResolvedValue([]);
    useAppStore.setState({
      activeChildId: 'child-1',
      children: [{
        childId: 'child-1',
        familyId: 'family-1',
        displayName: 'Mimi',
        gender: 'female',
        birthDate: '2019-05-01',
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
      }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ activeChildId: null, children: [] });
  });

  it('moves from the guide to the goal picker inside the same illustration, then saves', async () => {
    await renderPage();
    const guideArt = art();
    expect(guideArt?.getAttribute('src')).toContain('outdoor-goal-hero-girl');

    fireEvent.click(button('Outdoor.page.goalOnboarding.setGoal'));

    expect(art()).toBe(guideArt);
    expect(goalField().value).toBe('630');
    expect(screen.queryByRole('button', { name: i18nText('Outdoor.page.goalSetup.cancel') })).toBeNull();

    fireEvent.click(button('Outdoor.page.goalSetup.increase'));
    await act(async () => { fireEvent.click(button('Outdoor.page.goalSetup.confirm')); });

    expect(bridge.setOutdoorGoal).toHaveBeenCalledWith('child-1', 700, expect.any(String));
    expect(art()).toBeNull();
    expect(goalButton(700)).toBeTruthy();
  });

  it('changes an existing goal from the tracker and can back out without saving', async () => {
    bridge.getOutdoorGoal.mockResolvedValue(840);
    await renderPage();

    fireEvent.click(goalButton(840));
    expect(goalField().value).toBe('840');

    fireEvent.click(button('Outdoor.page.goalSetup.cancel'));
    expect(bridge.setOutdoorGoal).not.toHaveBeenCalled();
    expect(goalButton(840)).toBeTruthy();
  });
});

describe('OutdoorPage weekly tracker', () => {
  beforeEach(() => {
    void i18n.changeLanguage('zh');
    // A Wednesday, so the week has earlier days to fill in.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T10:00:00'));
    bridge.getOutdoorGoal.mockResolvedValue(630);
    bridge.getMeasurements.mockResolvedValue([]);
    bridge.insertOutdoorRecord.mockResolvedValue(undefined);
    useAppStore.setState({
      activeChildId: 'child-1',
      children: [{ childId: 'child-1', displayName: 'Mimi', gender: 'female', birthDate: '2019-05-01' } as never],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    useAppStore.setState({ activeChildId: null, children: [] });
  });

  it('shows the trend card before any history, with nothing met yet', async () => {
    bridge.getOutdoorRecords.mockResolvedValue([]);
    await renderPage();

    const card = trendCard();
    expect(within(card).getByText(i18nText('Outdoor.page.tracker.trend.summary', { count: 0 }))).toBeTruthy();
    expect(within(card).getAllByRole('button', { pressed: false })).toHaveLength(11);
    expect(within(card).getByRole('button', { pressed: true }).getAttribute('aria-label'))
      .toBe(i18nText('Outdoor.page.tracker.trend.bar', { range: formatWeekRange('2026-09-28'), minutes: 0 }));
  });

  it('explains a failed load in words and can retry', async () => {
    bridge.getOutdoorRecords.mockRejectedValueOnce(new Error('disk busy')).mockResolvedValue([]);
    await renderPage();

    // A missing locale key would render as the key itself.
    const title = screen.getByRole('heading', { name: i18nText('Outdoor.page.loadError.title') });
    expect(title.textContent).not.toMatch(/^Outdoor\./);
    expect(screen.getByText('disk busy')).toBeTruthy();

    await act(async () => { fireEvent.click(button('Outdoor.page.loadError.retry')); });
    expect(trendCard()).toBeTruthy();
  });

  it('backfills the latest empty day of the week from the trend card', async () => {
    bridge.getOutdoorRecords.mockResolvedValue([{
      recordId: 'r1',
      childId: 'child-1',
      activityDate: '2026-09-28',
      durationMinutes: 30,
      note: '骑车',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-28T10:00:00.000Z',
    }]);
    await renderPage();

    fireEvent.click(within(trendCard()).getByRole('button', { name: i18nText('Outdoor.page.tracker.trend.add') }));
    await act(async () => { fireEvent.click(button('Outdoor.page.recordModal.save')); });

    expect(bridge.insertOutdoorRecord).toHaveBeenCalledWith(expect.objectContaining({
      childId: 'child-1',
      activityDate: '2026-09-29',
      durationMinutes: 60,
    }));
  });
});
