import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bridge, sync } = vi.hoisted(() => ({
  bridge: {
    rows: [] as Array<Record<string, unknown>>,
    events: [] as string[],
    getReminderStates: vi.fn(),
    upsertReminderState: vi.fn(),
    saveHealthRecordCapture: vi.fn(),
  },
  sync: { requestGrowthReminderSync: vi.fn() },
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getReminderStates: bridge.getReminderStates,
  upsertReminderState: bridge.upsertReminderState,
  saveHealthRecordCapture: bridge.saveHealthRecordCapture,
}));
vi.mock('./growth-reminder-activity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./growth-reminder-activity.js')>()),
  requestGrowthReminderSync: sync.requestGrowthReminderSync,
}));

import { completeRecordDataReminderWithProof } from '../../engine/reminder-actions.js';
import { HEALTH_REMINDER_CAPTURE_TARGETS } from '../../knowledge-base/index.js';
import {
  growthCaptureCoversTarget,
  growthEventSatisfiesTarget,
  growthReminderCaptureTarget,
  saveGrowthReminderCapture,
} from './growth-reminder-capture.js';

const CHILD_ID = '01K0CHILD00000000000000000';
const GRO_002 = HEALTH_REMINDER_CAPTURE_TARGETS.find((target) => target.ruleId === 'PO-REM-GRO-002')!;

let counter = 0;
const makeId = () => `01K0ID${String(++counter).padStart(20, '0')}`;

function baseInput(values: Record<string, number | null>) {
  return {
    childId: CHILD_ID,
    birthDate: '2025-01-15',
    linkedReminder: { ruleId: 'PO-REM-GRO-002', repeatIndex: 2, stateId: null, scheduledFor: '2026-09-01', dueDate: '2026-11-30' },
    effectiveDate: '2026-09-20',
    notes: null,
    values: values as never,
    now: '2026-09-23T06:00:00.000Z',
    makeId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.rows = [];
  bridge.events = [];
  bridge.getReminderStates.mockImplementation(async () => bridge.rows);
  bridge.upsertReminderState.mockImplementation(async (row: Record<string, unknown>) => {
    bridge.events.push(row.completedAt ? 'complete' : 'row');
    const existing = bridge.rows.find((candidate) => candidate.ruleId === row.ruleId && candidate.repeatIndex === row.repeatIndex);
    if (existing) Object.assign(existing, { ...row, stateId: existing.stateId });
    else bridge.rows.push({ ...row });
  });
  bridge.saveHealthRecordCapture.mockImplementation(async (event: { eventId: string; values: unknown[] }) => {
    bridge.events.push('save');
    return { eventId: event.eventId, valueIds: [], persistedValueCount: event.values.length };
  });
});

describe('growth reminder capture proof', () => {
  it('binds only growth record reminders and requires every target metric', () => {
    expect(growthReminderCaptureTarget('PO-REM-GRO-002')).toBe(GRO_002);
    expect(growthReminderCaptureTarget('PO-REM-VAC-001')).toBeNull();
    expect(growthCaptureCoversTarget(GRO_002, { 'growth.height': 88, 'growth.weight': 12.5 })).toBe(true);
    expect(growthCaptureCoversTarget(GRO_002, { 'growth.height': 88, 'growth.weight': null })).toBe(false);
  });

  it('proves the target only from one event of the target child linked to the rule', () => {
    const values = [
      { metricId: 'growth.height', recordKind: 'measured' as const, valueNumber: 88 },
      { metricId: 'growth.weight', recordKind: 'measured' as const, valueNumber: 12.5 },
    ];
    const event = { childId: CHILD_ID, linkedReminderRuleId: 'PO-REM-GRO-002', values } as never;
    expect(growthEventSatisfiesTarget(GRO_002, CHILD_ID, event)).toBe(true);
    expect(growthEventSatisfiesTarget(GRO_002, 'other-child', event)).toBe(false);
    expect(growthEventSatisfiesTarget(GRO_002, CHILD_ID, { ...(event as object), values: values.slice(0, 1) } as never)).toBe(false);
    expect(growthEventSatisfiesTarget(GRO_002, CHILD_ID, { ...(event as object), linkedReminderRuleId: 'PO-REM-GRO-003' } as never)).toBe(false);
  });

  it('saves one validated event, then completes the round and requests the projection update', async () => {
    const result = await saveGrowthReminderCapture(baseInput({ 'growth.height': 88, 'growth.weight': 12.5 }));
    expect(bridge.events).toEqual(['row', 'save', 'complete']);
    const saved = bridge.saveHealthRecordCapture.mock.calls[0]![0] as { eventId: string; protocolId: string; recordKind: string; linkedReminderStateId: string; values: Array<{ metricId: string }> };
    expect(saved.eventId).toBe(result.eventId);
    expect(saved.protocolId).toBe(GRO_002.captureProtocolId);
    expect(saved.recordKind).toBe('reminder_linked');
    expect(saved.linkedReminderStateId).toBe(bridge.rows[0]!.stateId);
    expect(saved.values.map((value) => value.metricId).sort()).toEqual(['growth.bmi', 'growth.height', 'growth.weight']);
    expect(bridge.rows[0]).toMatchObject({ status: 'completed', completedAt: '2026-09-23T06:00:00.000Z' });
    expect(sync.requestGrowthReminderSync).toHaveBeenCalledWith(CHILD_ID);
  });

  it('keeps the round open when the save fails or does not persist every value', async () => {
    bridge.saveHealthRecordCapture.mockRejectedValueOnce(new Error('sidecar unavailable'));
    await expect(saveGrowthReminderCapture(baseInput({ 'growth.height': 88, 'growth.weight': 12.5 }))).rejects.toThrow('sidecar unavailable');
    expect(bridge.events).not.toContain('complete');
    bridge.saveHealthRecordCapture.mockImplementationOnce(async (event: { eventId: string }) => ({ eventId: event.eventId, valueIds: [], persistedValueCount: 1 }));
    await expect(saveGrowthReminderCapture(baseInput({ 'growth.height': 88, 'growth.weight': 12.5 }))).rejects.toThrow(/capture target/u);
    expect(bridge.events).not.toContain('complete');
    await expect(saveGrowthReminderCapture(baseInput({ 'growth.height': 88, 'growth.weight': null }))).rejects.toThrow(/growth\.weight/u);
    expect(bridge.rows.every((row) => !row.completedAt)).toBe(true);
    expect(sync.requestGrowthReminderSync).not.toHaveBeenCalled();
  });

  it('refuses a completion without capture proof', async () => {
    await expect(completeRecordDataReminderWithProof({
      childId: CHILD_ID, ruleId: 'PO-REM-GRO-002', repeatIndex: 2, state: { stateId: 's' } as never,
      proof: { eventId: 'e1', satisfiesTarget: false },
    })).rejects.toThrow();
    expect(bridge.upsertReminderState).not.toHaveBeenCalled();
  });
});
