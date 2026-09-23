import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveReminder, ReminderAgenda, ReminderState } from './reminder-engine.js';
import { REMINDER_RULES } from '../knowledge-base/index.js';

const { bridge } = vi.hoisted(() => ({
  bridge: {
    rows: [] as unknown[],
    writes: [] as Array<Record<string, unknown>>,
    getReminderStates: vi.fn(),
    upsertReminderState: vi.fn(),
  },
}));

vi.mock('../bridge/sqlite-bridge.js', () => ({
  getReminderStates: bridge.getReminderStates,
  upsertReminderState: bridge.upsertReminderState,
}));
vi.mock('../features/reminders/growth-reminder-activity.js', () => ({ requestGrowthReminderSync: vi.fn() }));

import { persistAgendaPlan } from './reminder-actions.js';

const CHILD = 'child-toddler';
const GRO_002 = REMINDER_RULES.find((rule) => rule.ruleId === 'PO-REM-GRO-002')!;
const TODAY = '2026-09-23';

function state(overrides: Partial<ReminderState>): ReminderState {
  return {
    stateId: 'state-gro-2', childId: CHILD, ruleId: 'PO-REM-GRO-002', status: 'active', activatedAt: null, completedAt: null,
    dismissedAt: null, dismissReason: null, repeatIndex: 2, nextTriggerAt: null, snoozedUntil: null, scheduledDate: null,
    notApplicable: 0, plannedForDate: null, surfaceRank: null, lastSurfacedAt: null, surfaceCount: 0, notes: null,
    acknowledgedAt: null, reflectedAt: null, practiceStartedAt: null, practiceLastAt: null, practiceCount: 0,
    practiceHabituatedAt: null, consultedAt: null, consultationConversationId: null, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

function agenda(todayFocus: ActiveReminder[]): ReminderAgenda {
  return { localToday: TODAY, todayFocus } as unknown as ReminderAgenda;
}

const dueRound = {
  rule: GRO_002, visibility: 'push', repeatIndex: 2, effectiveAgeMonths: 18, effectiveStartDate: '2026-08-28',
  effectiveEndDate: '2026-11-27', kind: 'task', lifecycle: 'due', status: 'active', overdueDays: 0, daysUntilStart: 0,
  daysUntilEnd: 60, deliveryDisposition: 'normal', state: null,
} as unknown as ActiveReminder;

const completed = state({ status: 'completed', completedAt: '2026-09-23T08:54:06.349Z' });

beforeEach(() => {
  vi.clearAllMocks();
  bridge.rows = [];
  bridge.writes = [];
  bridge.getReminderStates.mockImplementation(async () => bridge.rows);
  bridge.upsertReminderState.mockImplementation(async (row: Record<string, unknown>) => { bridge.writes.push(row); });
});

describe('agenda plan persistence', () => {
  it('keeps a completion saved after the agenda was loaded', async () => {
    // The page still holds the agenda and rows from before the round was completed.
    bridge.rows = [completed];
    await expect(persistAgendaPlan(CHILD, agenda([dueRound]), [state({})], '2026-09-23T08:54:35.000Z')).resolves.toBe(true);
    expect(bridge.writes).toHaveLength(1);
    expect(bridge.writes[0]).toMatchObject({ stateId: 'state-gro-2', childId: CHILD, status: 'completed', completedAt: '2026-09-23T08:54:06.349Z', plannedForDate: TODAY });
  });

  it('clears a stale plan from the current rows without touching their progression', async () => {
    bridge.rows = [state({ status: 'completed', completedAt: '2026-09-23T08:54:06.349Z', plannedForDate: TODAY, surfaceRank: 1 })];
    await expect(persistAgendaPlan(CHILD, agenda([]), [state({ plannedForDate: TODAY, surfaceRank: 1 })])).resolves.toBe(true);
    expect(bridge.writes[0]).toMatchObject({ status: 'completed', completedAt: '2026-09-23T08:54:06.349Z', plannedForDate: null, surfaceRank: null });
  });

  it('never writes a snapshot that belongs to another child', async () => {
    bridge.rows = [completed];
    await expect(persistAgendaPlan(CHILD, agenda([dueRound]), [state({ childId: 'child-teen', stateId: 'state-teen' })])).resolves.toBe(false);
    expect(bridge.writes).toHaveLength(0);
    expect(bridge.getReminderStates).not.toHaveBeenCalled();
  });
});
