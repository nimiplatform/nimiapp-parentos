// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import ProfilePage from './profile-page.js';

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getHealthRecordEvents: vi.fn().mockResolvedValue([]),
  getHealthRecordValues: vi.fn().mockResolvedValue([]),
  getPostureAssessments: vi.fn().mockResolvedValue([]),
}));

vi.mock('./ai-summary-card.js', () => ({
  AISummaryCard: () => <div data-testid="ai-summary-card" />,
}));

vi.mock('./health-capture-modal.js', () => ({
  HealthCaptureModal: ({
    open,
    initialGroupId,
    initialMetricId,
  }: {
    open: boolean;
    initialGroupId?: string | null;
    initialMetricId?: string | null;
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label="health-capture-modal"
        data-initial-group-id={initialGroupId ?? ''}
        data-initial-metric-id={initialMetricId ?? ''}
      />
    ) : null,
}));

const child: ChildProfile = {
  childId: 'child-1',
  familyId: 'family-1',
  displayName: 'Mimi',
  birthDate: '2013-06-01',
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

describe('ProfilePage capture entry', () => {
  beforeEach(() => {
    useAppStore.setState({
      bootstrapReady: true,
      familyId: 'family-1',
      activeChildId: child.childId,
      children: [child],
    });
  });

  it('opens manual health-data capture from the profile capture query parameter', async () => {
    render(
      <MemoryRouter initialEntries={['/profile?capture=manual']}>
        <ProfilePage />
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'health-capture-modal' });
    await waitFor(() => {
      expect(dialog.getAttribute('data-initial-group-id')).toBe('');
    });
    expect(dialog.getAttribute('data-initial-metric-id')).toBe('');
  });
});
