import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProfile } from '../../app-shell/app-store.js';
import type { ActiveReminder, ReminderState } from '../../engine/reminder-engine.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';

type HeldRecord = Record<string, unknown> & {
  key: string;
  revision: number;
  todoState: string | null;
  source: { kind: 'app'; sourceRef: string; appId: string; displayName: string; available: boolean };
};

// Runtime's App activity rules for one account: records are partitioned by
// publisher; a lower revision, or the same revision with other content, is a
// conflict; the same content at the same revision is an idempotent retry.
const runtime = vi.hoisted(() => {
  const records = new Map<string, HeldRecord>();
  const content = (input: Record<string, unknown>) => JSON.stringify([
    input.kind, input.todoState ?? null, input.attention, input.title, input.summary ?? null,
    input.objectRef ?? null, input.type, input.data ?? null, input.occurredAt,
  ]);
  const state = {
    records,
    selfSourceRef: 'src_this_registration',
    failPuts: false,
    failLists: false,
    putCalls: [] as Array<Record<string, unknown>>,
    heldContent: new Map<string, string>(),
    seed(record: Partial<HeldRecord> & { key: string; revision: number; sourceRef: string; available?: boolean }) {
      const { sourceRef, available, ...rest } = record;
      const held = {
        activityId: `act_${records.size + 1}`, kind: 'todo', todoState: 'open', attention: true, title: 'Seed',
        summary: null, objectRef: null, type: 'nimi.parentos.growth-record-reminder.v1', data: null,
        occurredAt: '2026-09-01T00:00:00.000Z',
        ...rest,
        source: { kind: 'app', sourceRef, appId: 'nimi.parentos', displayName: 'ParentOS', available: available ?? true },
      } as HeldRecord;
      records.set(`${sourceRef}|${record.key}`, held);
      state.heldContent.set(`${sourceRef}|${record.key}`, content(held));
    },
    put: async (input: Record<string, unknown>) => {
      state.putCalls.push(input);
      if (state.failPuts) throw Object.assign(new Error('runtime down'), { reasonCode: 'RUNTIME_UNAVAILABLE' });
      const id = `${state.selfSourceRef}|${String(input.key)}`;
      const previous = records.get(id);
      const revision = Number(input.revision);
      if (previous) {
        const same = state.heldContent.get(id) === content(input);
        if (revision < previous.revision || (revision === previous.revision && !same)) {
          throw Object.assign(new Error('revision conflict'), { reasonCode: 'APP_ACTIVITY_REVISION_CONFLICT' });
        }
        if (revision === previous.revision) return { record: previous, changed: false };
      }
      const record = {
        activityId: (previous?.activityId as string | undefined) ?? `act_${records.size + 1}`,
        key: String(input.key), revision, kind: input.kind, todoState: (input.todoState as string | undefined) ?? null,
        attention: input.attention, title: input.title, summary: input.summary ?? null, objectRef: input.objectRef ?? null,
        type: input.type, data: input.data ?? null, occurredAt: input.occurredAt,
        source: { kind: 'app', sourceRef: state.selfSourceRef, appId: 'nimi.parentos', displayName: 'ParentOS', available: true },
      } as HeldRecord;
      records.set(id, record);
      state.heldContent.set(id, content(input));
      return { record, changed: true };
    },
    list: async (input?: unknown) => {
      if (state.failLists) throw Object.assign(new Error('list unavailable'), { reasonCode: 'RUNTIME_UNAVAILABLE' });
      const filter = (input as { filter?: { kind?: string; sourceRef?: string; todoStates?: string[] } } | undefined)?.filter ?? {};
      const out = [...records.values()].filter((record) => (
        (!filter.kind || record.kind === filter.kind)
        && (!filter.sourceRef || record.source.sourceRef === filter.sourceRef)
        && (!filter.todoStates || filter.todoStates.includes(String(record.todoState)))
      ));
      return { records: out, nextPageToken: null, baselineChangeSeq: '0' };
    },
    held(key: string, sourceRef?: string) {
      return records.get(`${sourceRef ?? state.selfSourceRef}|${key}`);
    },
    reset() {
      records.clear();
      state.heldContent.clear();
      state.putCalls = [];
      state.failPuts = false;
      state.failLists = false;
    },
  };
  return state;
});

const { bridge, nimi } = vi.hoisted(() => ({
  bridge: { getReminderStates: vi.fn(async () => [] as unknown[]) },
  nimi: {
    client: {
      activity: {
        put: vi.fn(async (_input: Record<string, unknown>) => ({}) as unknown),
        list: vi.fn(async (_input?: unknown) => ({}) as unknown),
        onOpenRequest: vi.fn(),
      },
    },
    handler: undefined as undefined | ((request: { activityId: string; objectRef: string; type: string }) => Promise<string>),
  },
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({ getReminderStates: bridge.getReminderStates }));
vi.mock('../../engine/reminder-freq-overrides.js', () => ({ loadAllFreqOverrides: vi.fn(async () => new Map()) }));
vi.mock('../../infra/parentos-nimi-client.js', () => ({
  hasParentOSNimiClient: () => true,
  getParentOSNimiClient: () => nimi.client,
}));

import {
  beginReminderActivitySession,
  endReminderActivitySession,
  GROWTH_REMINDER_ACTIVITY_TYPE,
  CARE_REMINDER_ACTIVITY_TYPE,
  reminderActivityGroupRef,
  isPublishedReminderRule,
  reminderActivityObjectRef,
  reminderActivityPublication,
  parseReminderActivityObjectRef,
  registerReminderOpenHandler,
  retryReminderActivity,
  subscribeReminderActivitySync,
  syncReminderActivity,
} from './reminder-activity.js';

const GRO_002 = REMINDER_RULES.find((rule) => rule.ruleId === 'PO-REM-GRO-002')!;
const CHILD_ID = '01K0CHILD00000000000000000';
const ROUND_1 = `growth-record:${CHILD_ID}:PO-REM-GRO-002:1`;
const ROUND_2 = `growth-record:${CHILD_ID}:PO-REM-GRO-002:2`;

// On 2026-09-23 this child is in the third GRO-002 round (2026-09-01 to 2026-11-30).
const TODAY = new Date('2026-09-23T04:00:00.000Z');
const child: ChildProfile = {
  childId: CHILD_ID, familyId: 'family-1', displayName: 'Mia', gender: 'female', birthDate: '2025-03-01',
  birthWeightKg: null, birthHeightCm: null, birthHeadCircCm: null, avatarPath: null,
  nurtureMode: 'balanced', nurtureModeOverrides: null, allergies: null, medicalNotes: null, recorderProfiles: null,
  createdAt: '2025-04-01T00:00:00.000Z', updatedAt: '2025-04-01T00:00:00.000Z',
};

function reminder(overrides: Partial<ActiveReminder>): ActiveReminder {
  return {
    rule: GRO_002, visibility: 'push', repeatIndex: 2, effectiveAgeMonths: 18,
    effectiveStartDate: '2026-09-01', effectiveEndDate: '2026-11-30', kind: 'task', lifecycle: 'due', status: 'active',
    overdueDays: 0, daysUntilStart: 0, daysUntilEnd: 60, deliveryDisposition: 'normal', state: null,
    ...overrides,
  };
}

function state(overrides: Partial<ReminderState>): ReminderState {
  return {
    stateId: 'state-1', childId: CHILD_ID, ruleId: 'PO-REM-GRO-002', status: 'active', activatedAt: null, completedAt: null,
    dismissedAt: null, dismissReason: null, repeatIndex: 2, nextTriggerAt: null, snoozedUntil: null, scheduledDate: null,
    notApplicable: 0, plannedForDate: null, surfaceRank: null, lastSurfacedAt: null, surfaceCount: 0, notes: null,
    acknowledgedAt: null, reflectedAt: null, practiceStartedAt: null, practiceLastAt: null, practiceCount: 0,
    practiceHabituatedAt: null, consultedAt: null, consultationConversationId: null, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

describe('growth record reminder projection', () => {
  it('projects a due round as one open todo whose identity is the child, rule, and round', () => {
    const publication = reminderActivityPublication(CHILD_ID, reminder({}))!;
    expect(publication).toMatchObject({
      key: ROUND_2, kind: 'todo', todoState: 'open', attention: true,
      objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-002:2`, type: GROWTH_REMINDER_ACTIVITY_TYPE, title: GRO_002.title,
      data: { ruleId: 'PO-REM-GRO-002', repeatIndex: 2, windowStart: '2026-09-01', windowEnd: '2026-11-30' },
    });
    expect(publication).not.toHaveProperty('revision');
    expect(reminderActivityPublication(CHILD_ID, reminder({}))).toEqual(publication);
    expect(reminderActivityPublication(CHILD_ID, reminder({ repeatIndex: 3 }))!.key).not.toBe(publication.key);
    expect(JSON.stringify(publication)).not.toContain('Mia');
  });

  it('completes, cancels, or keeps private according to the source lifecycle', () => {
    expect(reminderActivityPublication(CHILD_ID, reminder({ lifecycle: 'completed', state: state({ completedAt: '2026-09-23T06:00:00.000Z' }) })))
      .toMatchObject({ todoState: 'completed', attention: false, occurredAt: '2026-09-23T06:00:00.000Z' });
    expect(reminderActivityPublication(CHILD_ID, reminder({ lifecycle: 'not_applicable', state: state({ notApplicable: 1 }) })))
      .toMatchObject({ todoState: 'cancelled' });
    for (const lifecycle of ['upcoming', 'scheduled', 'snoozed'] as const) {
      expect(reminderActivityPublication(CHILD_ID, reminder({ lifecycle }))).toBeNull();
    }
    expect(reminderActivityPublication(CHILD_ID, reminder({ visibility: 'silent' }))).toBeNull();
    expect(reminderActivityPublication(CHILD_ID, reminder({ deliveryDisposition: 'cold_start' }))).toBeNull();
    const vaccine = REMINDER_RULES.find((rule) => rule.domain !== 'growth')!;
    expect(reminderActivityPublication(CHILD_ID, reminder({ rule: vaccine }))).toMatchObject({ type: CARE_REMINDER_ACTIVITY_TYPE, todoState: 'open' });
    expect(isPublishedReminderRule({ ...vaccine, category: 'personalized' })).toBe(false);
    expect(isPublishedReminderRule({ ...vaccine, kind: 'guide' })).toBe(false);
  });

  it('accepts only exact admitted reminder object references', () => {
    expect(parseReminderActivityObjectRef(reminderActivityObjectRef(CHILD_ID, 'PO-REM-GRO-002', 2))).toEqual({ childId: CHILD_ID, ruleId: 'PO-REM-GRO-002', repeatIndex: 2 });
    expect(parseReminderActivityObjectRef(`reminder:${CHILD_ID}:PO-REM-VAC-001:0`)).toEqual({ childId: CHILD_ID, ruleId: 'PO-REM-VAC-001', repeatIndex: 0 });
    expect(parseReminderActivityObjectRef(`reminder:${CHILD_ID}:PO-REM-GRO-002:01`)).toBeNull();
    expect(parseReminderActivityObjectRef('/etc/passwd')).toBeNull();
  });
});

it.each(['vaccine', 'checkup', 'vision', 'dental'])('publishes the existing %s task without child or measurement detail', domain => {
  const rule = REMINDER_RULES.find(r => r.domain === domain && isPublishedReminderRule(r))!;
  const result = reminderActivityPublication(CHILD_ID, reminder({ rule }))!;
  expect(result).toMatchObject({ type: CARE_REMINDER_ACTIVITY_TYPE, kind: 'todo', todoState: 'open', title: rule.title });
  expect(result.data).toEqual({ ruleId: rule.ruleId, repeatIndex: 2, windowStart: '2026-09-01', windowEnd: '2026-11-30' });
  expect(JSON.stringify(result)).not.toContain('Mia');
  expect(parseReminderActivityObjectRef(result.objectRef!)).toEqual({ childId: CHILD_ID, ruleId: rule.ruleId, repeatIndex: 2 });
});

describe('admitted reminder publication', () => {
  // The second round was completed with capture proof; the third round is due.
  const completedRound = state({ stateId: 'state-r1', repeatIndex: 1, status: 'completed', completedAt: '2026-06-10T02:00:00.000Z' });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
    vi.clearAllMocks();
    runtime.reset();
    bridge.getReminderStates.mockResolvedValue([completedRound]);
    nimi.client.activity.put.mockImplementation(runtime.put);
    nimi.client.activity.list.mockImplementation(runtime.list);
    nimi.client.activity.onOpenRequest.mockImplementation((handler) => {
      nimi.handler = handler;
      return { stop: async () => undefined };
    });
    beginReminderActivitySession((childId) => (childId === CHILD_ID ? child : undefined));
  });

  afterEach(() => {
    endReminderActivitySession();
    vi.useRealTimers();
  });

  const putKeys = () => runtime.putCalls.map((input) => input.key);

  it('publishes the evaluated rounds once and leaves an unchanged projection alone', async () => {
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.held(ROUND_1)).toMatchObject({ todoState: 'completed' });
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open', attention: true });
    expect(runtime.held(ROUND_2)!.revision).toBeGreaterThanOrEqual(TODAY.getTime());
    expect(runtime.putCalls).toHaveLength(9);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.putCalls).toHaveLength(9);
  });

  it('returns a cancelled or completed round to open when the user restores it', async () => {
    await syncReminderActivity(CHILD_ID);
    const openRevision = runtime.held(ROUND_2)!.revision;
    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'dismissed', notApplicable: 1, updatedAt: TODAY.toISOString() })]);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'cancelled' });
    const cancelledRevision = runtime.held(ROUND_2)!.revision;
    expect(cancelledRevision).toBeGreaterThan(openRevision);

    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'pending', updatedAt: '2026-09-23T04:01:00.000Z' })]);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open', attention: true });
    expect(runtime.held(ROUND_2)!.revision).toBeGreaterThan(cancelledRevision);

    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'completed', completedAt: '2026-09-23T05:00:00.000Z' })]);
    await syncReminderActivity(CHILD_ID);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'completed' });
    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'pending' })]);
    await syncReminderActivity(CHILD_ID);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
  });

  it('keeps a snoozed round open without a new publication', async () => {
    await syncReminderActivity(CHILD_ID);
    bridge.getReminderStates.mockResolvedValue([completedRound, state({ snoozedUntil: '2026-09-30', updatedAt: TODAY.toISOString() })]);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
    expect(runtime.putCalls).toHaveLength(9);
  });

  it('reports failed publications until an explicit retry sends the same revisions', async () => {
    const reports: number[] = [];
    const unsubscribe = subscribeReminderActivitySync((count) => reports.push(count));
    runtime.failPuts = true;
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(9);
    expect(reports.at(-1)).toBe(9);
    const firstRevisions = runtime.putCalls.map((input) => [input.key, input.revision]);
    runtime.failPuts = false;
    runtime.putCalls = [];
    vi.setSystemTime(new Date(TODAY.getTime() + 60_000));
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(reports.at(-1)).toBe(0);
    expect(runtime.putCalls.map((input) => [input.key, input.revision])).toEqual(firstRevisions);
    unsubscribe();
  });

  it('never treats a revision conflict as synced and publishes above the held record on retry', async () => {
    // A record of this registration from an earlier session is held at a
    // revision ahead of this device's clock, with other content.
    runtime.seed({ key: ROUND_2, revision: TODAY.getTime() + 5_000, sourceRef: runtime.selfSourceRef, todoState: 'cancelled', attention: false, objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-002:2` });
    // A stale listing baseline does not reveal the newer held revision. Both
    // the first projection and its source-confirmation pass must report the
    // actual put conflict until a later listing observes the held record.
    const staleListing = { records: [], nextPageToken: null, baselineChangeSeq: '0' };
    nimi.client.activity.list.mockResolvedValueOnce(staleListing).mockResolvedValueOnce(staleListing);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(1);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'cancelled' });
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open', revision: TODAY.getTime() + 5_001 });
  });

  it('closes a superseded round of this registration and never touches another registration', async () => {
    const roundZero = `growth-record:${CHILD_ID}:PO-REM-GRO-002:0`;
    const otherRound = `growth-record:${CHILD_ID}:PO-REM-GRO-001:5`;
    runtime.seed({ key: roundZero, revision: 7, sourceRef: runtime.selfSourceRef, objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-002:0`, title: 'Round 1' });
    runtime.seed({ key: otherRound, revision: 3, sourceRef: 'src_other_active_registration', objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-001:5`, title: 'Other' });
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.held(roundZero)).toMatchObject({ todoState: 'cancelled', attention: false, title: 'Round 1' });
    expect(runtime.held(roundZero)!.revision).toBeGreaterThan(7);
    expect(runtime.held(otherRound, 'src_other_active_registration')).toMatchObject({ todoState: 'open', revision: 3 });
    expect(runtime.held(otherRound)).toBeUndefined();
    expect(putKeys()).not.toContain(otherRound);
  });

  it('does not close rounds before a successful publication confirms this session source', async () => {
    const roundZero = `growth-record:${CHILD_ID}:PO-REM-GRO-002:0`;
    // Growth is snoozed; seven currently due care tasks cannot confirm owner
    // identity while every publication fails before Runtime accepts it.
    bridge.getReminderStates.mockResolvedValue([state({ snoozedUntil: '2026-09-30' })]);
    runtime.seed({ key: roundZero, revision: 7, sourceRef: runtime.selfSourceRef, objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-002:0` });
    const foreignKey = `growth-record:${CHILD_ID}:PO-REM-GRO-002:1`;
    runtime.seed({ key: foreignKey, revision: 2, sourceRef: 'src_other_active_registration', objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-002:1` });
    runtime.failPuts = true;
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(7);
    expect(runtime.putCalls.every(input => input.type === CARE_REMINDER_ACTIVITY_TYPE)).toBe(true);
    expect(runtime.held(roundZero)).toMatchObject({ todoState: 'open', revision: 7 });
    runtime.failPuts = false;
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(runtime.held(roundZero)).toMatchObject({ todoState: 'cancelled' });
    expect(runtime.held(foreignKey, 'src_other_active_registration')).toMatchObject({ todoState: 'open', revision: 2 });
  });

  it.each([true, false])('publishes its own records when same-content records belong to another registration (available=%s)', async (available) => {
    // A former registration published the same rounds; this registration has none yet.
    await syncReminderActivity(CHILD_ID);
    for (const record of [...runtime.records.values()]) {
      runtime.seed({ ...record, sourceRef: 'src_former_registration', available });
    }
    for (const key of [...runtime.records.keys()]) {
      if (key.startsWith(`${runtime.selfSourceRef}|`)) runtime.records.delete(key);
    }
    runtime.heldContent.forEach((_value, key) => { if (key.startsWith(`${runtime.selfSourceRef}|`)) runtime.heldContent.delete(key); });
    endReminderActivitySession();
    runtime.putCalls = [];
    beginReminderActivitySession((childId) => (childId === CHILD_ID ? child : undefined));

    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect(runtime.held(ROUND_1)).toMatchObject({ todoState: 'completed' });
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
    expect(runtime.held(ROUND_2, 'src_former_registration')).toMatchObject({ todoState: 'open' });
    expect(runtime.putCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('confirms its own records on reopen without publishing the same state at a new revision', async () => {
    await syncReminderActivity(CHILD_ID);
    const revisions = [runtime.held(ROUND_1)!.revision, runtime.held(ROUND_2)!.revision];
    const roundZero = `growth-record:${CHILD_ID}:PO-REM-GRO-002:0`;
    runtime.seed({ key: roundZero, revision: 7, sourceRef: runtime.selfSourceRef, objectRef: `reminder:${CHILD_ID}:PO-REM-GRO-002:0`, title: 'Round 1' });
    endReminderActivitySession();
    vi.setSystemTime(new Date(TODAY.getTime() + 3_600_000));
    beginReminderActivitySession((childId) => (childId === CHILD_ID ? child : undefined));
    const reopenPuts = runtime.putCalls.length;

    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect([runtime.held(ROUND_1)!.revision, runtime.held(ROUND_2)!.revision]).toEqual(revisions);
    // The unchanged publication confirmed this registration, so the superseded round closes in the same pass.
    expect(runtime.held(roundZero)).toMatchObject({ todoState: 'cancelled' });
    const republished = runtime.putCalls.slice(reopenPuts).filter((input) => input.key === ROUND_1 || input.key === ROUND_2);
    expect(republished.every((input) => revisions.includes(Number(input.revision)))).toBe(true);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    expect([runtime.held(ROUND_1)!.revision, runtime.held(ROUND_2)!.revision]).toEqual(revisions);
  });

  it('keeps a failed listing visible and retries the whole projection', async () => {
    const reports: number[] = [];
    const unsubscribe = subscribeReminderActivitySync((count) => reports.push(count));
    runtime.failLists = true;
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(1);
    expect(runtime.putCalls).toHaveLength(0);
    expect(reports.at(-1)).toBe(1);
    runtime.failLists = false;
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(reports.at(-1)).toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
    unsubscribe();
  });

  it('keeps a failed persisted-state read visible and retries it without queued publications', async () => {
    const reports: number[] = [];
    const unsubscribe = subscribeReminderActivitySync((count) => reports.push(count));
    bridge.getReminderStates.mockRejectedValueOnce(new Error('sqlite temporarily unavailable'));
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(1);
    expect(reports.at(-1)).toBe(1);
    expect(runtime.putCalls).toHaveLength(0);
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(reports.at(-1)).toBe(0);
    expect(runtime.putCalls).toHaveLength(9);
    unsubscribe();
  });

  it.each(['scheduled', 'snoozed'] as const)('discards a failed completion after the persisted round was restored and %s', async (lifecycle) => {
    await syncReminderActivity(CHILD_ID);
    runtime.failPuts = true;
    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'completed', completedAt: TODAY.toISOString() })]);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(1);
    bridge.getReminderStates.mockResolvedValue([completedRound, state({
      status: 'active', completedAt: null,
      ...(lifecycle === 'scheduled' ? { scheduledDate: '2026-10-01' } : { snoozedUntil: '2026-10-01' }),
    })]);
    runtime.failPuts = false;
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
  });

  it('reopens a restored, scheduled round when the completion reached Runtime before its response was lost', async () => {
    await syncReminderActivity(CHILD_ID);
    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'completed', completedAt: TODAY.toISOString() })]);
    nimi.client.activity.put.mockImplementationOnce(async (input: Record<string, unknown>) => {
      await runtime.put(input);
      throw new Error('response lost');
    });
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(1);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'completed' });
    bridge.getReminderStates.mockResolvedValue([completedRound, state({ status: 'active', completedAt: null, scheduledDate: '2026-10-01' })]);
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
  });

  it('discards a failed historical completion after its persisted state was restored', async () => {
    runtime.failPuts = true;
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(9);
    bridge.getReminderStates.mockResolvedValue([state({ stateId: 'state-r1', repeatIndex: 1, status: 'active', completedAt: null })]);
    runtime.failPuts = false;
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(runtime.held(ROUND_1)).toBeUndefined();
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
  });

  it('never flushes another child\'s pending work without recomputing it', async () => {
    const otherChild = { ...child, childId: '01K0OTHER0000000000000000' };
    beginReminderActivitySession((id) => id === CHILD_ID ? child : id === otherChild.childId ? otherChild : undefined);
    runtime.failPuts = true;
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(9);
    runtime.failPuts = false;
    runtime.putCalls = [];
    bridge.getReminderStates.mockResolvedValue([]);
    await syncReminderActivity(otherChild.childId);
    expect(runtime.putCalls.every((input) => String(input.key).includes(otherChild.childId))).toBe(true);
    expect(runtime.held(ROUND_1)).toBeUndefined();
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(runtime.held(ROUND_1)).toBeUndefined();
    expect(runtime.held(ROUND_2)).toMatchObject({ todoState: 'open' });
  });

  it('stops before the next publication once the session ended', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    nimi.client.activity.put.mockImplementationOnce(async (input: Record<string, unknown>) => { await gate; return runtime.put(input); });
    const running = syncReminderActivity(CHILD_ID);
    await vi.waitFor(() => expect(nimi.client.activity.put).toHaveBeenCalledTimes(1));
    endReminderActivitySession();
    release();
    await running;
    expect(nimi.client.activity.put).toHaveBeenCalledTimes(1);
    await expect(syncReminderActivity(CHILD_ID)).resolves.toBe(0);
    await expect(retryReminderActivity()).resolves.toBe(0);
    expect(nimi.client.activity.put).toHaveBeenCalledTimes(1);
  });

  it('opens a care round and rejects a mismatched activity type without publishing', async () => {
    await syncReminderActivity(CHILD_ID);
    const care = runtime.putCalls.find((input) => input.type === CARE_REMINDER_ACTIVITY_TYPE && input.todoState === 'open')!;
    const target = parseReminderActivityObjectRef(String(care.objectRef))!;
    const selectChild = vi.fn();
    const navigate = vi.fn();
    registerReminderOpenHandler({ selectChild, navigate, focus: async () => undefined });
    runtime.putCalls = [];

    await expect(nimi.handler!({ activityId: 'act_care', objectRef: String(care.objectRef), type: CARE_REMINDER_ACTIVITY_TYPE })).resolves.toBe('opened');
    expect(selectChild).toHaveBeenCalledExactlyOnceWith(CHILD_ID);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`/reminders?focus=${encodeURIComponent(`${target.ruleId}:${target.repeatIndex}`)}`);
    await expect(nimi.handler!({ activityId: 'act_care', objectRef: String(care.objectRef), type: GROWTH_REMINDER_ACTIVITY_TYPE })).resolves.toBe('object-unavailable');
    expect(selectChild).toHaveBeenCalledTimes(1);
    expect(runtime.putCalls).toHaveLength(0);
  });

  it('opens the exact round of the right child and reports anything else as unavailable', async () => {
    const selectChild = vi.fn();
    const navigate = vi.fn();
    registerReminderOpenHandler({ selectChild, navigate, focus: async () => undefined });
    const objectRef = reminderActivityObjectRef(CHILD_ID, 'PO-REM-GRO-002', 2);
    await expect(nimi.handler!({ activityId: 'act_1', objectRef, type: GROWTH_REMINDER_ACTIVITY_TYPE })).resolves.toBe('opened');
    expect(selectChild).toHaveBeenCalledWith(CHILD_ID);
    expect(navigate).toHaveBeenCalledWith(`/reminders?focus=${encodeURIComponent('PO-REM-GRO-002:2')}`);
    await expect(nimi.handler!({ activityId: 'act_2', objectRef, type: 'org.other.thing.v1' })).resolves.toBe('object-unavailable');
    await expect(nimi.handler!({ activityId: 'act_3', objectRef: reminderActivityObjectRef('01K0OTHER0000000000000000', 'PO-REM-GRO-002', 2), type: GROWTH_REMINDER_ACTIVITY_TYPE })).resolves.toBe('object-unavailable');
    await expect(nimi.handler!({ activityId: 'act_4', objectRef: reminderActivityObjectRef(CHILD_ID, 'PO-REM-GRO-002', 7), type: GROWTH_REMINDER_ACTIVITY_TYPE })).resolves.toBe('object-unavailable');
    expect(selectChild).toHaveBeenCalledTimes(1);
  });
});


it('uses a stable opaque grouping value without returning a child identity', async () => {
  const a = await reminderActivityGroupRef(CHILD_ID);
  expect(a).toMatch(/^parentos-group-[a-f0-9]{64}$/u);
  expect(a).not.toContain(CHILD_ID);
  expect(await reminderActivityGroupRef(CHILD_ID)).toBe(a);
  expect(await reminderActivityGroupRef('01K0OTHER0000000000000000')).not.toBe(a);
});
