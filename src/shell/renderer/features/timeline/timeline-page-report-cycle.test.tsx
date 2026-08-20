// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import { getRollingReportPeriod } from '../reports/report-cycle.js';
import TimelinePage from './timeline-page.js';

const { autoGenerateMonthlyReportMock, controllerState } = vi.hoisted(() => ({
  autoGenerateMonthlyReportMock: vi.fn().mockResolvedValue(null),
  controllerState: {
    value: null as null | Record<string, unknown>,
  },
}));

vi.mock('../reports/auto-report.js', () => ({
  autoGenerateMonthlyReport: autoGenerateMonthlyReportMock,
}));

vi.mock('./reminder-panel-controller.js', () => ({
  useReminderPanelController: () => controllerState.value,
}));

vi.mock('../../knowledge-base/index.js', () => ({ SENSITIVE_PERIODS: [] }));
vi.mock('./timeline-data.js', () => ({
  C: { sub: '#666' },
  buildTimelineHomeViewModel: () => ({
    recentChanges: [],
    growthSnapshot: {},
    sleepTrend: {},
    visionSnapshot: {},
    milestoneTimeline: {},
    recentLines: [],
    observationDistribution: {},
  }),
}));
vi.mock('./timeline-cards.js', () => ({
  ChildContextCard: () => null,
  GrowthSnapshotCard: () => null,
  MilestoneTimelineCard: () => null,
  MonthlyReportCard: () => null,
  ObservationDistributionCard: () => null,
  OutdoorGoalCard: () => null,
  QuickLinksStrip: () => null,
  RecentChangesHeroCard: () => null,
  RecentLinesCard: () => null,
  SleepTrendCard: () => null,
  StageFocusCard: () => null,
  VisionCard: () => null,
}));
vi.mock('./timeline-page-panels.js', () => ({ ReminderPanel: () => null }));
vi.mock('../reminders/frequency-modal.js', () => ({ FrequencyModal: () => null }));

function makeChild(): ChildProfile {
  const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  return {
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
    createdAt,
    updatedAt: createdAt,
  };
}

describe('TimelinePage rolling report evaluation', () => {
  beforeEach(() => {
    autoGenerateMonthlyReportMock.mockClear();
    const child = makeChild();
    const first = getRollingReportPeriod(child.createdAt, 1);
    controllerState.value = {
      d: {
        reminderStates: [],
        measurements: [],
        vaccineRecords: [],
        vaccineCount: 0,
        milestoneRecords: [],
        journalEntries: [],
        sleepRecords: [],
        allergyRecords: [],
        customTodos: [],
        latestMonthlyReport: {
          reportId: 'report-1',
          content: '{}',
          periodStart: first.periodStart,
          periodEnd: first.periodEnd,
          generatedAt: first.generationAt,
        },
        outdoorRecords: [],
        outdoorGoalMinutes: null,
        orthoCycle: null,
      },
      loading: false,
      reload: vi.fn().mockResolvedValue(undefined),
      ageMonths: 31,
      agendaResult: { kind: 'ok', agenda: {} },
      agenda: {},
      panelProps: {},
      modalsNode: null,
    };
    useAppStore.setState({
      bootstrapReady: true,
      familyId: child.familyId,
      activeChildId: child.childId,
      children: [child],
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

  it('evaluates the next cycle even when a prior monthly report exists', async () => {
    render(<MemoryRouter><TimelinePage /></MemoryRouter>);

    await waitFor(() => expect(autoGenerateMonthlyReportMock).toHaveBeenCalledTimes(1));
    expect(autoGenerateMonthlyReportMock).toHaveBeenCalledWith(useAppStore.getState().children[0]);
  });
});
