// @vitest-environment jsdom

// Regression: /reminders used to white-screen for a cold-start child because
// kit Button asChild crashed inside Radix Slot (multiple wrapper children).
// This renders the page through the real reminder engine + knowledge base.

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import RemindersPage from './reminders-page.js';

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
    expect(document.body.textContent).toMatch(/今天 \d+ 项，近期 \d+ 项，历史 \d+ 项/);
  });
});
