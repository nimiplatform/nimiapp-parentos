import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiMessageRow } from '../../bridge/sqlite-bridge.js';
import type { ParentosTextTurnInput, ParentosTextTurnResult } from '../settings/parentos-ai-text-turn.js';

const bridge = vi.hoisted(() => ({
  messages: [] as AiMessageRow[],
  getAiMessages: vi.fn(),
  insertAiMessage: vi.fn(),
  getHealthRecordEvents: vi.fn(),
  getHealthRecordValues: vi.fn(),
  getJournalEntries: vi.fn(),
  getMilestoneRecords: vi.fn(),
  getOutdoorGoal: vi.fn(),
  getPostureAssessments: vi.fn(),
  getVaccineRecords: vi.fn(),
}));

const turn = vi.hoisted(() => ({
  runParentosTextTurn: vi.fn<(input: ParentosTextTurnInput) => Promise<ParentosTextTurnResult>>(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getAiMessages: bridge.getAiMessages,
  insertAiMessage: bridge.insertAiMessage,
  getHealthRecordEvents: bridge.getHealthRecordEvents,
  getHealthRecordValues: bridge.getHealthRecordValues,
  getJournalEntries: bridge.getJournalEntries,
  getMilestoneRecords: bridge.getMilestoneRecords,
  getOutdoorGoal: bridge.getOutdoorGoal,
  getPostureAssessments: bridge.getPostureAssessments,
  getVaccineRecords: bridge.getVaccineRecords,
}));

vi.mock('../settings/parentos-ai-text-turn.js', () => ({
  runParentosTextTurn: turn.runParentosTextTurn,
}));

import { runAdvisorTurn, selectAdvisorHistory, type AdvisorTurnControl, type AdvisorTurnInput } from './advisor-turn.js';

const child = {
  childId: 'child-a', displayName: '小安', gender: 'female', birthDate: '2013-06-01', nurtureMode: 'balanced', ageMonths: 159, recorderProfiles: null,
};

function message(messageId: string, role: 'user' | 'assistant', content: string, contextSnapshot: string | null = null): AiMessageRow {
  return { messageId, conversationId: 'conv-1', role, content, contextSnapshot, createdAt: `2026-09-30T0${messageId.length}:00:00.000Z` };
}

const outdoorEvents = [
  ['e1', '2026-09-28', 60],
  ['e2', '2026-09-29', 30],
] as const;

function intentJson(value: Record<string, unknown>) {
  return JSON.stringify({ task: 'records', domains: ['outdoor'], groups: ['outdoor'], time: { kind: 'default' }, compare: false, detail: false, ...value });
}

const isIntentCall = (input: ParentosTextTurnInput) => input.messages[0]?.text.includes('任务解析器') ?? false;

function scriptTurns(script: { intent?: string | ParentosTextTurnResult; answer?: string | ParentosTextTurnResult }) {
  turn.runParentosTextTurn.mockImplementation(async (input) => {
    const planned = isIntentCall(input) ? script.intent ?? intentJson({}) : script.answer ?? '本周已记录 **90 分钟**。';
    return typeof planned === 'string' ? { ok: true, text: planned, traceId: 'trace' } : planned;
  });
}

/** Resolves the scripted step only after the signal aborts, like a canceled stream. */
function blockUntilAbort(step: 'intent' | 'answer', onEnter?: () => void) {
  turn.runParentosTextTurn.mockImplementation((input) => {
    if ((step === 'intent') !== isIntentCall(input)) {
      return Promise.resolve({ ok: true, text: isIntentCall(input) ? intentJson({}) : '回答', traceId: 't' });
    }
    const pending = new Promise<ParentosTextTurnResult>((_resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    onEnter?.();
    return pending;
  });
}

function makeControl(overrides: Partial<AdvisorTurnControl> = {}) {
  const abort = new AbortController();
  const persisted: Array<{ content: string; contextSnapshot: string }> = [];
  const control: AdvisorTurnControl = {
    signal: abort.signal,
    isCurrent: () => true,
    setPhase: vi.fn(),
    onUserPersisted: vi.fn(),
    persistAssistant: vi.fn(async (content: string, contextSnapshot: string) => { persisted.push({ content, contextSnapshot }); }),
    ...overrides,
  };
  return { control, abort, persisted };
}

function input(overrides: Partial<AdvisorTurnInput> = {}): AdvisorTurnInput {
  return {
    requestId: 'req-1',
    child,
    conversationId: 'conv-1',
    question: '户外活动够了吗',
    retryOf: null,
    now: new Date('2026-09-30T10:00:00.000Z'),
    language: 'zh',
    ...overrides,
  };
}

const userInserts = () => bridge.insertAiMessage.mock.calls.filter((call) => call[0].role === 'user');

describe('selectAdvisorHistory', () => {
  it('pairs only adjacent user/assistant messages and stops before a retried message', () => {
    const rows = [
      message('u1', 'user', 'A'), message('a1', 'assistant', 'A answer'),
      message('u2', 'user', 'B (failed)'),
      message('u3', 'user', 'C'), message('a3', 'assistant', 'C answer'),
      message('u4', 'user', 'D (unanswered)'),
    ];
    expect(selectAdvisorHistory(rows, null).map((pair) => [pair.user.messageId, pair.assistant.messageId])).toEqual([['u1', 'a1'], ['u3', 'a3']]);
    expect(selectAdvisorHistory(rows, 'u3').map((pair) => pair.user.messageId)).toEqual(['u1']);
  });
});

describe('runAdvisorTurn', () => {
  beforeEach(() => {
    bridge.messages = [];
    for (const fn of Object.values(bridge)) if (typeof fn === 'function') fn.mockReset();
    bridge.getAiMessages.mockImplementation(async () => bridge.messages);
    bridge.insertAiMessage.mockImplementation(async (row: AiMessageRow & { now: string }) => {
      bridge.messages.push({ ...row, createdAt: row.now });
    });
    bridge.getHealthRecordEvents.mockResolvedValue(outdoorEvents.map(([eventId, date]) => ({
      eventId, childId: 'child-a', protocolId: 'outdoor-activity', groupId: 'outdoor', recordKind: 'manual', sourceSurface: 'profile_detail',
      recordedAt: date, effectiveDate: date, ageMonths: 159, recorderId: null, linkedReminderStateId: null, linkedReminderRuleId: null,
      notes: null, metadataJson: null, createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`,
    })));
    bridge.getHealthRecordValues.mockResolvedValue(outdoorEvents.map(([eventId, date, minutes]) => ({
      valueId: `${eventId}-v`, eventId, childId: 'child-a', metricId: 'outdoor.activity_minutes', valueNumber: minutes, valueText: null,
      valueJson: null, unit: 'min', qualifier: null, recordKind: 'measured', sourceValueIds: null, createdAt: `${date}T08:00:00.000Z`,
    })));
    bridge.getOutdoorGoal.mockResolvedValue(630);
    bridge.getJournalEntries.mockResolvedValue([]);
    turn.runParentosTextTurn.mockReset();
  });

  it('answers from request-time facts that outrank history, with the question sent once and last', async () => {
    bridge.messages = [
      message('u1', 'user', '户外怎么样', '{"version":2}'),
      message('a1', 'assistant', '上周记录了 300 分钟。'),
    ];
    scriptTurns({});
    const { control, persisted } = makeControl();
    const outcome = await runAdvisorTurn(input(), control);
    expect(outcome).toEqual({ status: 'answered' });

    const answerCall = turn.runParentosTextTurn.mock.calls.map((call) => call[0]).find((call) => !isIntentCall(call));
    const roles = answerCall?.messages.map((item) => item.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(answerCall?.messages.at(-1)?.text).toBe('户外活动够了吗');
    expect(answerCall?.messages.filter((item) => item.text.includes('户外活动够了吗'))).toHaveLength(1);
    const system = answerCall?.messages[0]?.text ?? '';
    expect(system).toContain('以这次读取的记录为准');
    expect(system).toContain('"totalMinutes":90');
    expect(system).toContain('"setBy":"家长设定"');
    expect(system).not.toContain('[K1]');

    expect(userInserts()).toHaveLength(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.content).toContain('依据本地记录：户外活动（2026-09-28、2026-09-29）');
    const userSnapshot = JSON.parse(userInserts()[0]?.[0].contextSnapshot);
    expect(userSnapshot).toMatchObject({ version: 2, strategy: 'needs-review-descriptive', historyMessageIds: ['u1', 'a1'] });
    expect(persisted[0]?.contextSnapshot).toBe(userInserts()[0]?.[0].contextSnapshot);
  });

  it('continues the previous answered turn for a follow-up, from its frozen snapshot', async () => {
    const previousIntent = { task: 'records', domains: ['outdoor'], groups: ['outdoor'], time: { kind: 'default' }, compare: false, detail: false };
    bridge.messages = [
      message('u1', 'user', '户外活动够了吗', '{"version":2}'),
      message('a1', 'assistant', '本周已记录 90 分钟。\n\n依据本地记录：户外活动（2026-09-28）', JSON.stringify({ version: 2, intent: previousIntent, facts: { period: { start: '2026-09-01', end: '2026-09-30' } } })),
    ];
    scriptTurns({ intent: JSON.stringify({ task: 'follow-up', domains: [], groups: [], time: { kind: 'default' }, compare: true, detail: false }) });
    const { control } = makeControl();
    expect(await runAdvisorTurn(input({ question: '那和上次比呢？', now: new Date('2026-10-04T10:00:00.000Z') }), control)).toEqual({ status: 'answered' });
    expect(bridge.getHealthRecordEvents).toHaveBeenCalled();
    const snapshot = JSON.parse(userInserts()[0]?.[0].contextSnapshot);
    expect(snapshot).toMatchObject({
      followUp: true,
      intent: { ...previousIntent, time: { kind: 'range', start: '2026-09-01', end: '2026-09-30' }, compare: true },
      facts: { period: { start: '2026-09-01', end: '2026-09-30' } },
    });
    const answerCall = turn.runParentosTextTurn.mock.calls.map((call) => call[0]).find((call) => !isIntentCall(call));
    expect(answerCall?.messages[2]).toEqual({ role: 'assistant', text: '本周已记录 90 分钟。' });
  });

  it('reads no records for small talk, even when the health store is failing', async () => {
    bridge.getHealthRecordEvents.mockRejectedValue(new Error('disk'));
    scriptTurns({ intent: intentJson({ task: 'chat' }), answer: '你好！我是成长底稿的成长顾问。' });
    const { control, persisted } = makeControl();
    expect(await runAdvisorTurn(input({ question: '你好' }), control)).toEqual({ status: 'answered' });
    expect(bridge.getHealthRecordEvents).not.toHaveBeenCalled();
    expect(persisted[0]?.content).toBe('你好！我是成长底稿的成长顾问。');
  });

  it('counts the full journal period before trimming the answer input', async () => {
    const entries = Array.from({ length: 501 }, (_, index) => ({
      entryId: `j${index}`, childId: child.childId, recordedAt: '2026-09-25T10:00:00.000Z',
      contentType: 'text', textContent: '一次观察', selectedTags: null, dimensionId: null, recorderId: null,
    }));
    bridge.getJournalEntries.mockImplementation(async (_childId: string, limit: number) => limit < 0 ? entries : entries.slice(0, limit));
    scriptTurns({ intent: intentJson({ domains: [], groups: ['journal'] }), answer: '这一时段记录了 501 次观察。' });
    const { control, persisted } = makeControl();
    expect(await runAdvisorTurn(input(), control)).toEqual({ status: 'answered' });
    const snapshot = JSON.parse(persisted[0]!.contextSnapshot);
    expect(snapshot.facts.records[0].recordsInPeriod).toBe(501);
    expect(snapshot.facts.records[0].entries.length).toBeLessThan(501);
  });

  it('stops before any write when a required read fails, and keeps the facts that were read', async () => {
    bridge.getHealthRecordEvents.mockRejectedValue(new Error('disk'));
    scriptTurns({ intent: intentJson({ domains: ['outdoor'], groups: ['outdoor', 'journal'] }) });
    const { control, persisted } = makeControl();
    const outcome = await runAdvisorTurn(input(), control);
    expect(outcome).toMatchObject({ status: 'failed', userPersisted: false, failure: { kind: 'facts-read', failedGroupLabels: ['户外活动'] } });
    expect(turn.runParentosTextTurn).toHaveBeenCalledTimes(1);
    expect(bridge.insertAiMessage).not.toHaveBeenCalled();
    expect(persisted).toHaveLength(0);
  });

  it('fails an invalid parse instead of guessing from keywords', async () => {
    scriptTurns({ intent: '户外相关问题' });
    const { control } = makeControl();
    expect(await runAdvisorTurn(input(), control)).toMatchObject({ status: 'failed', failure: { kind: 'intent' }, userPersisted: false });
    expect(bridge.getHealthRecordEvents).not.toHaveBeenCalled();
    expect(bridge.insertAiMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['unsafe wording', '这可能是发育迟缓，需要治疗。', 'safety'],
    ['an unprovided citation', '户外很重要 [K3]。', 'citation'],
  ] as const)('never persists an answer with %s', async (_label, answer, kind) => {
    scriptTurns({ answer });
    const { control, persisted } = makeControl();
    const outcome = await runAdvisorTurn(input(), control);
    expect(outcome).toMatchObject({ status: 'failed', userPersisted: true, failure: { kind } });
    expect(persisted).toHaveLength(0);
  });

  it('treats a length stop as a failure, not a truncated success', async () => {
    scriptTurns({ answer: { ok: false, failure: { kind: 'length', reasonCode: 'parentos-ai-output-length', traceId: 't' } } });
    const { control, persisted } = makeControl();
    expect(await runAdvisorTurn(input(), control)).toMatchObject({ status: 'failed', failure: { kind: 'length' } });
    expect(persisted).toHaveLength(0);
  });

  it('cancels the intent step without writing anything', async () => {
    const { control, abort, persisted } = makeControl();
    blockUntilAbort('intent', () => abort.abort());
    expect(await runAdvisorTurn(input(), control)).toEqual({ status: 'canceled', userPersisted: false });
    expect(bridge.insertAiMessage).not.toHaveBeenCalled();
    expect(persisted).toHaveLength(0);
  });

  it('cancels the answer step after the user write without an assistant write', async () => {
    const { control, abort, persisted } = makeControl();
    blockUntilAbort('answer', () => abort.abort());
    expect(await runAdvisorTurn(input(), control)).toEqual({ status: 'canceled', userPersisted: true });
    expect(userInserts()).toHaveLength(1);
    expect(persisted).toHaveLength(0);
  });

  it('does not start the assistant write once the request lost its conversation or child', async () => {
    let current = true;
    scriptTurns({});
    turn.runParentosTextTurn.mockImplementation(async (call) => {
      if (!isIntentCall(call)) current = false;
      return { ok: true, text: isIntentCall(call) ? intentJson({}) : '回答。', traceId: 't' };
    });
    const { control, persisted } = makeControl({ isCurrent: () => current });
    expect(await runAdvisorTurn(input(), control)).toEqual({ status: 'canceled', userPersisted: true });
    expect(persisted).toHaveLength(0);
  });

  it('lets a dispatched assistant write finish even if the request is stopped meanwhile', async () => {
    scriptTurns({});
    const written: string[] = [];
    let stop = () => {};
    const { control, abort } = makeControl({
      persistAssistant: vi.fn(async (content: string) => {
        stop();
        written.push(content);
      }),
    });
    stop = () => abort.abort();
    expect(await runAdvisorTurn(input(), control)).toEqual({ status: 'answered' });
    expect(written).toHaveLength(1);
  });

  it('retries the unanswered user message without a new insert or touching its snapshot', async () => {
    const original = message('u9', 'user', '户外活动够了吗', '{"version":2,"requestId":"old"}');
    bridge.messages = [original];
    scriptTurns({});
    const { control, persisted } = makeControl();
    expect(await runAdvisorTurn(input({ question: original.content, retryOf: original, requestId: 'req-retry' }), control)).toEqual({ status: 'answered' });
    expect(bridge.insertAiMessage).not.toHaveBeenCalled();
    expect(bridge.messages[0]?.contextSnapshot).toBe('{"version":2,"requestId":"old"}');
    const retrySnapshot = JSON.parse(persisted[0]?.contextSnapshot ?? '{}');
    expect(retrySnapshot).toMatchObject({ requestId: 'req-retry', retryOfUserMessageId: 'u9' });
    expect(retrySnapshot.facts.records[0]).toMatchObject({ category: '户外活动' });
  });

  it('refuses an over-long question before any model call', async () => {
    scriptTurns({});
    const { control } = makeControl();
    expect(await runAdvisorTurn(input({ question: '很'.repeat(3000) }), control)).toMatchObject({ status: 'failed', failure: { kind: 'input-too-long' } });
    expect(turn.runParentosTextTurn).not.toHaveBeenCalled();
  });
});
