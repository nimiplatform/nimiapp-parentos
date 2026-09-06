// @vitest-environment jsdom

// Regression: /reminders used to white-screen for a cold-start child because
// kit Button asChild crashed inside Radix Slot (multiple wrapper children).
// This renders the page through the real reminder engine + knowledge base.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { nimiToast } from '@nimiplatform/kit/ui';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import { applyReminderAction } from '../../engine/reminder-actions.js';
import RemindersPage from './reminders-page.js';

// The 更多 overflow menu (Radix popover + kit motion) needs browser APIs that
// jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!globalThis.ResizeObserver) {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
}
if (!window.matchMedia) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getReminderStates: vi.fn().mockResolvedValue([]),
  getCustomTodos: vi.fn().mockResolvedValue([]),
  deleteCustomTodo: vi.fn().mockResolvedValue(undefined),
  uncompleteCustomTodo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../engine/reminder-freq-overrides.js', () => ({
  loadAllFreqOverrides: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../engine/reminder-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engine/reminder-actions.js')>();
  return {
    ...actual,
    applyReminderAction: vi.fn().mockResolvedValue(undefined),
    persistAgendaPlan: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('../profile/health-capture-modal.js', () => ({
  HealthCaptureModal: () => null,
}));

// Toast feedback is asserted via spies; the real NimiToaster is mounted by the
// app shell, not by this page, so toast DOM never appears here.
vi.mock('@nimiplatform/kit/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nimiplatform/kit/ui')>();
  return {
    ...actual,
    nimiToast: {
      show: vi.fn(() => 'toast-id'),
      success: vi.fn(() => 'toast-id'),
      info: vi.fn(() => 'toast-id'),
      warning: vi.fn(() => 'toast-id'),
      danger: vi.fn(() => 'toast-id'),
      neutral: vi.fn(() => 'toast-id'),
      dismiss: vi.fn(),
      clear: vi.fn(),
    },
  };
});

function makeColdStartChild(): ChildProfile {
  const createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const birth = new Date();
  birth.setMonth(birth.getMonth() - 117); // 9岁9个月
  return {
    childId: 'child-cold-1',
    familyId: 'family-1',
    displayName: '王小爬',
    gender: 'male',
    birthDate: birth.toISOString().slice(0, 10),
    birthWeightKg: null,
    birthHeightCm: null,
    birthHeadCircCm: null,
    avatarPath: null,
    nurtureMode: 'balanced',
    nurtureModeOverrides: null,
    allergies: null,
    medicalNotes: null,
    recorderProfiles: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('RemindersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const child = makeColdStartChild();
    useAppStore.setState({
      bootstrapReady: true,
      familyId: child.familyId,
      activeChildId: child.childId,
      children: [child],
    });
  });

  it('renders the reminders surface for a cold-start 9y9m child', async () => {
    render(
      <MemoryRouter initialEntries={['/reminders']}>
        <RemindersPage />
      </MemoryRouter>,
    );

    // The page first paints a loading state, then the agenda content; wait for
    // the real header so an async render crash fails the test instead of
    // passing against the loading frame.
    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒中心');
    });
    expect(document.body.textContent).toContain('近期');
    expect(document.body.textContent).toContain('历史记录');
    // The old hero grid stacked summary tiles duplicating the section counts.
    expect(document.body.textContent).not.toContain('逾期汇总');
  });

  it('keeps low-frequency actions behind the more menu instead of a flat button row', async () => {
    render(
      <MemoryRouter initialEntries={['/reminders']}>
        <RemindersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒中心');
    });
    const moreButtons = await screen.findAllByRole('button', { name: '更多' });
    expect(moreButtons.length).toBeGreaterThan(0);
    // Snooze / not-applicable no longer render as inline buttons.
    expect(screen.queryAllByRole('button', { name: '推迟' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: '不适用' })).toHaveLength(0);

    fireEvent.click(moreButtons[0] as HTMLElement);
    // 安排 (explicit date) is the single postpone concept; the old one-click
    // 推迟 entry is gone from the menu.
    await screen.findByRole('menuitem', { name: '安排' });
    expect(screen.queryByRole('menuitem', { name: '推迟' })).toBeNull();
    // Details are reached by clicking the card body, so the menu has no
    // 查看详情 item.
    expect(screen.queryByRole('menuitem', { name: '查看详情' })).toBeNull();
  });

  it('schedules from the more menu via the schedule modal', async () => {
    render(
      <MemoryRouter initialEntries={['/reminders']}>
        <RemindersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒中心');
    });
    const hpvCard = screen.getByText('HPV 疫苗（推荐）').closest('div.rounded-2xl') as HTMLElement;
    fireEvent.click(within(hpvCard).getByRole('button', { name: '更多' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '安排' }));
    // The old window.prompt flow is gone; a real modal owns the date entry.
    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    });
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('安排日期'), { target: { value: futureDate } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => {
      expect(vi.mocked(applyReminderAction)).toHaveBeenCalledWith(expect.objectContaining({
        action: 'schedule',
        scheduledDate: futureDate,
      }));
    });
    await waitFor(() => {
      expect(vi.mocked(nimiToast.success)).toHaveBeenCalledWith(expect.stringContaining('已安排'));
    });
  });

  it('exposes the explain drawer through a focusable title button', async () => {
    render(
      <MemoryRouter initialEntries={['/reminders']}>
        <RemindersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒中心');
    });
    const moreButtons = await screen.findAllByRole('button', { name: '更多' });
    const firstMore = moreButtons[0] as HTMLElement;
    const card = firstMore.closest('div.rounded-2xl');
    expect(card).toBeTruthy();
    fireEvent.click(within(card as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    await screen.findByRole('dialog');
  });
});
