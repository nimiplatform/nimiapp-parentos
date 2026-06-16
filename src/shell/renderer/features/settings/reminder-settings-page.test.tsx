// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReminderSettingsPage from './reminder-settings-page.js';
import { useAppStore } from '../../app-shell/app-store.js';
import { i18n } from '../../i18n/index.js';

const { loadAllFreqOverrides } = vi.hoisted(() => ({
  loadAllFreqOverrides: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../engine/reminder-freq-overrides.js', () => ({
  loadAllFreqOverrides,
  clearFreqOverride: vi.fn().mockResolvedValue(undefined),
}));

describe('ReminderSettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    loadAllFreqOverrides.mockClear();
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
          recorderProfiles: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh');
    useAppStore.setState({
      bootstrapReady: false,
      familyId: null,
      activeChildId: null,
      children: [],
    });
  });

  it('renders the empty reminder settings state in English', async () => {
    render(
      <MemoryRouter>
        <ReminderSettingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Reminder management')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('All reminders use default frequencies')).toBeTruthy();
    });
  });
});
