// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HealthCaptureModal } from './health-capture-modal.js';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, 'hasPointerCapture', {
  configurable: true,
  value: vi.fn(() => false),
});
Object.defineProperty(Element.prototype, 'setPointerCapture', {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, 'releasePointerCapture', {
  configurable: true,
  value: vi.fn(),
});

vi.mock('../../bridge/sqlite-bridge.js', async () => ({
  saveHealthRecordCapture: vi.fn(),
  insertOutdoorRecord: vi.fn(),
  insertMeasurement: vi.fn(),
  insertTannerAssessment: vi.fn(),
  insertFitnessAssessment: vi.fn(),
  insertPostureAssessment: vi.fn(),
  saveAttachment: vi.fn(),
}));

beforeAll(() => {
  const child: ChildProfile = {
    childId: 'child-1',
    familyId: 'family-1',
    displayName: 'Test',
    birthDate: '2020-12-17',
    gender: 'male',
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
  useAppStore.setState({ activeChildId: 'child-1', children: [child] });
});

describe('HealthCaptureModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('opens to the requested sidebar group when initialGroupId is provided', () => {
    render(
      <HealthCaptureModal
        open
        childId="child-1"
        childBirthDate="2020-12-17"
        initialGroupId="outdoor"
        onClose={() => undefined}
      />,
    );

    // OutdoorCaptureContent renders the "记录户外活动" header for the outdoor group.
    expect(screen.getByText('记录户外活动')).toBeTruthy();
  });

  it('falls back to the first sidebar group when no initialGroupId is provided', () => {
    render(
      <HealthCaptureModal
        open
        childId="child-1"
        childBirthDate="2020-12-17"
        onClose={() => undefined}
      />,
    );

    // Default order opens growth first.
    expect(screen.getByText('添加生长记录')).toBeTruthy();
  });

  it('sizes the posture capture dialog on the overlay panel instead of overflowing a default dialog width', () => {
    render(
      <HealthCaptureModal
        open
        childId="child-1"
        childBirthDate="2020-12-17"
        initialGroupId="posture"
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'health-capture-modal' });
    expect(dialog.style.width).toBe('920px');
    expect(dialog.style.maxWidth).toBe('calc(100vw - 32px)');
  });

  it('opens the fitness source options above the capture dialog', async () => {
    render(
      <HealthCaptureModal
        open
        childId="child-1"
        childBirthDate="2020-12-17"
        initialGroupId="fitness"
        onClose={() => undefined}
      />,
    );

    const sourceTrigger = screen.getAllByRole('combobox').find((trigger) => trigger.textContent === '自测');
    expect(sourceTrigger).toBeTruthy();
    fireEvent.pointerDown(sourceTrigger!, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });

    await waitFor(() => {
      const panel = document.body.querySelector<HTMLElement>('[data-nimi-select-layer="dialog"]');
      expect(panel).toBeTruthy();
      expect(panel!.className).toContain('z-[calc(var(--nimi-z-dialog)+1)]');
      expect(within(panel!).getByText('学校体育')).toBeTruthy();
    });
  });

  it('shows the auto tier and unrecorded foot-arch choices instead of blank fitness selects', () => {
    render(
      <HealthCaptureModal
        open
        childId="child-1"
        childBirthDate="2020-12-17"
        initialGroupId="fitness"
        onClose={() => undefined}
      />,
    );

    const triggerTexts = () => screen.getAllByRole('combobox').map((trigger) => trigger.textContent ?? '');
    expect(triggerTexts().some((text) => text.startsWith('自动（按年龄）'))).toBe(true);

    fireEvent.click(screen.getByText('📋 体测'));
    expect(triggerTexts()).toContain('未记录');
  });
});
