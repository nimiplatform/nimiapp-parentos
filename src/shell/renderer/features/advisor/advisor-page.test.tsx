// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import type { ParentosTextTurnInput, ParentosTextTurnResult } from '../settings/parentos-ai-text-turn.js';
import AdvisorPage from './advisor-page.js';

type StoredConversation = {
  conversationId: string;
  childId: string;
  title: string | null;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
};

type StoredMessage = {
  messageId: string;
  conversationId: string;
  role: string;
  content: string;
  contextSnapshot: string | null;
  createdAt: string;
};

const store = vi.hoisted(() => ({
  conversations: [] as StoredConversation[],
  messages: [] as StoredMessage[],
}));

const bridge = vi.hoisted(() => ({
  createConversation: vi.fn(),
  getConversations: vi.fn(),
  insertAiMessage: vi.fn(),
  insertConsultationAiMessage: vi.fn(),
  getAiMessages: vi.fn(),
  getHealthRecordEvents: vi.fn(),
  getHealthRecordValues: vi.fn(),
  getJournalEntries: vi.fn(),
  getMilestoneRecords: vi.fn(),
  getOutdoorGoal: vi.fn(),
  getPostureAssessments: vi.fn(),
  getVaccineRecords: vi.fn(),
  getReminderStates: vi.fn(),
}));

const ai = vi.hoisted(() => ({
  available: true,
  intent: '' as string,
  answer: '' as string,
  hold: null as 'intent' | 'answer' | null,
  held: null as null | ((result: ParentosTextTurnResult) => void),
  runParentosTextTurn: vi.fn(),
  runParentosTextGenerate: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => bridge);

vi.mock('../settings/parentos-ai-text-turn.js', () => ({
  runParentosTextTurn: (input: ParentosTextTurnInput) => ai.runParentosTextTurn(input),
}));

vi.mock('../settings/parentos-ai-runtime.js', () => ({
  runParentosTextGenerate: (input: unknown) => ai.runParentosTextGenerate(input),
}));

vi.mock('../settings/parentos-ai-config.js', () => ({
  hasParentosAIConfigCapability: () => Promise.resolve(ai.available),
  PARENTOS_TEXT_CAPABILITY_CONTRACT: 'text.generate',
}));

const INTENT_OUTDOOR = JSON.stringify({ task: 'records', domains: ['outdoor'], groups: ['outdoor'], time: { kind: 'default' }, compare: false, detail: false });

const isIntentCall = (input: ParentosTextTurnInput) => input.messages[0]?.text.includes('任务解析器') ?? false;

function outdoorRows(childId: string) {
  const rows = [['e1', '2026-09-28', 60], ['e2', '2026-09-29', 30]] as const;
  return {
    events: rows.map(([eventId, date]) => ({
      eventId, childId, protocolId: 'outdoor-activity', groupId: 'outdoor', recordKind: 'manual', sourceSurface: 'profile_detail',
      recordedAt: date, effectiveDate: date, ageMonths: 159, recorderId: null, linkedReminderStateId: null, linkedReminderRuleId: null,
      notes: null, metadataJson: null, createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`,
    })),
    values: rows.map(([eventId, date, minutes]) => ({
      valueId: `${eventId}-v`, eventId, childId, metricId: 'outdoor.activity_minutes', valueNumber: minutes, valueText: null,
      valueJson: null, unit: 'min', qualifier: null, recordKind: 'measured', sourceValueIds: null, createdAt: `${date}T08:00:00.000Z`,
    })),
  };
}

function child(childId: string, displayName: string) {
  return {
    childId,
    familyId: 'family-1',
    displayName,
    gender: 'female' as const,
    birthDate: '2013-06-01',
    birthWeightKg: null,
    birthHeightCm: null,
    birthHeadCircCm: null,
    avatarPath: null,
    nurtureMode: 'balanced' as const,
    nurtureModeOverrides: null,
    allergies: null,
    medicalNotes: null,
    recorderProfiles: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderAdvisorPage(initialEntries: Array<string | { pathname: string; state?: unknown }> = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AdvisorPage />
    </MemoryRouter>,
  );
}

async function openNewConversation() {
  await waitFor(() => expect(bridge.getConversations).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
  await waitFor(() => expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy());
}

function send(question: string) {
  fireEvent.change(screen.getByPlaceholderText('输入问题...'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
}

const transcriptText = () => document.querySelector('.advisor-transcript')?.textContent ?? '';

const assistantInserts = () => bridge.insertAiMessage.mock.calls.filter((call) => call[0].role === 'assistant');
const userInserts = () => bridge.insertAiMessage.mock.calls.filter((call) => call[0].role === 'user');

describe('AdvisorPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T10:00:00.000Z'));
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    store.conversations.length = 0;
    store.messages.length = 0;
    for (const fn of Object.values(bridge)) fn.mockReset();
    bridge.createConversation.mockImplementation(async (params: { conversationId: string; childId: string; title: string | null; now: string }) => {
      store.conversations.unshift({ ...params, startedAt: params.now, lastMessageAt: params.now, messageCount: 0, createdAt: params.now });
    });
    bridge.getConversations.mockImplementation(async (childId: string) => store.conversations.filter((item) => item.childId === childId));
    bridge.insertAiMessage.mockImplementation(async (params: StoredMessage & { now: string }) => {
      store.messages.push({ messageId: params.messageId, conversationId: params.conversationId, role: params.role, content: params.content, contextSnapshot: params.contextSnapshot, createdAt: params.now });
    });
    bridge.insertConsultationAiMessage.mockImplementation(async (params: StoredMessage & { now: string }) => {
      store.messages.push({ messageId: params.messageId, conversationId: params.conversationId, role: 'assistant', content: params.content, contextSnapshot: params.contextSnapshot, createdAt: params.now });
    });
    bridge.getAiMessages.mockImplementation(async (conversationId: string) => store.messages.filter((item) => item.conversationId === conversationId).map((item) => ({ ...item })));
    bridge.getHealthRecordEvents.mockImplementation(async (childId: string) => outdoorRows(childId).events);
    bridge.getHealthRecordValues.mockImplementation(async (childId: string) => outdoorRows(childId).values);
    bridge.getJournalEntries.mockResolvedValue([]);
    bridge.getMilestoneRecords.mockResolvedValue([]);
    bridge.getOutdoorGoal.mockResolvedValue(630);
    bridge.getPostureAssessments.mockResolvedValue([]);
    bridge.getVaccineRecords.mockResolvedValue([]);
    bridge.getReminderStates.mockResolvedValue([]);

    ai.available = true;
    ai.intent = INTENT_OUTDOOR;
    ai.answer = '本周已记录 **90 分钟**，家长设定的目标是每周 630 分钟。';
    ai.hold = null;
    ai.held = null;
    ai.runParentosTextTurn.mockReset();
    ai.runParentosTextTurn.mockImplementation((input: ParentosTextTurnInput) => {
      const step = isIntentCall(input) ? 'intent' : 'answer';
      const result: ParentosTextTurnResult = { ok: true, text: step === 'intent' ? ai.intent : ai.answer, traceId: 't' };
      if (ai.hold !== step) return Promise.resolve(result);
      return new Promise((resolve, reject) => {
        ai.held = resolve;
        input.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    });
    ai.runParentosTextGenerate.mockReset();
    ai.runParentosTextGenerate.mockResolvedValue({ ok: true, text: '["这周户外够吗？","最近随记里写了什么？","户外目标完成了吗？"]', finishReason: 'stop', traceId: 's' });

    useAppStore.setState({
      bootstrapReady: true,
      familyId: 'family-1',
      activeChildId: 'child-1',
      children: [child('child-1', '小安'), child('child-2', '小宁')],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.setState({ bootstrapReady: false, familyId: null, activeChildId: null, children: [] });
  });

  it('blocks turns and model calls until a text model is configured', async () => {
    ai.available = false;
    renderAdvisorPage();
    await waitFor(() => expect(screen.getByRole('link', { name: '去连接 AI' })).toBeTruthy());
    expect(screen.getByRole('link', { name: '去连接 AI' }).getAttribute('href')).toBe('/settings/ai');
    expect(screen.queryByPlaceholderText('输入问题...')).toBeNull();
    expect(ai.runParentosTextTurn).not.toHaveBeenCalled();
  });

  it('shows no reply text until the checked answer is saved, then shows its record sources', async () => {
    renderAdvisorPage();
    await openNewConversation();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('输入问题...'), { target: { value: '户外活动够了吗' } });
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(false);
    ai.hold = 'answer';
    send('户外活动够了吗');

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在整理回答'));
    expect(transcriptText()).toContain('户外活动够了吗');
    expect(screen.queryByText(/90 分钟/)).toBeNull();
    expect(screen.getByRole('button', { name: '停止生成' }).closest('.advisor-composer-box')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '发送' })).toBeNull();
    expect((screen.getByPlaceholderText('输入问题...') as HTMLTextAreaElement).disabled).toBe(true);

    await act(async () => { ai.held?.({ ok: true, text: ai.answer, traceId: 't' }); });
    await waitFor(() => expect(screen.getByText(/家长设定的目标是每周 630 分钟/)).toBeTruthy());
    expect(screen.getByText(/依据本地记录：户外活动（2026-09-28、2026-09-29）/)).toBeTruthy();
    expect(userInserts()).toHaveLength(1);
    expect(assistantInserts()).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: '停止生成' })).toBeNull();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('stopping the answer keeps the saved question and retries it without a second insert', async () => {
    renderAdvisorPage();
    await openNewConversation();
    ai.hold = 'answer';
    send('户外活动够了吗');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在整理回答'));
    await waitFor(() => expect(userInserts()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    await waitFor(() => expect(screen.getByText('这个问题还没有得到回答')).toBeTruthy());
    expect(assistantInserts()).toHaveLength(0);
    expect(screen.getByText('已停止')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '停止生成' })).toBeNull();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);

    ai.hold = null;
    fireEvent.click(screen.getByRole('button', { name: /重新回答/ }));
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));
    expect(userInserts()).toHaveLength(1);
    const retrySnapshot = JSON.parse(assistantInserts()[0]?.[0].contextSnapshot);
    expect(retrySnapshot.retryOfUserMessageId).toBe(userInserts()[0]?.[0].messageId);
    expect(userInserts()[0]?.[0].contextSnapshot).not.toBe(assistantInserts()[0]?.[0].contextSnapshot);
  });

  it('stopping while the question is being understood writes nothing and returns the question', async () => {
    renderAdvisorPage();
    await openNewConversation();
    ai.hold = 'intent';
    send('视力最近怎么样');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在理解问题'));
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    await waitFor(() => expect((screen.getByPlaceholderText('输入问题...') as HTMLTextAreaElement).value).toBe('视力最近怎么样'));
    expect(bridge.insertAiMessage).not.toHaveBeenCalled();
    expect(screen.getByText('已停止')).toBeTruthy();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('never shows or writes an old request after switching conversation', async () => {
    store.conversations.push({ conversationId: 'conv-old', childId: 'child-1', title: '旧对话', startedAt: '2026-09-01', lastMessageAt: '2026-09-01', messageCount: 2, createdAt: '2026-09-01' });
    store.messages.push(
      { messageId: 'u-old', conversationId: 'conv-old', role: 'user', content: '以前的问题', contextSnapshot: null, createdAt: '2026-09-01T01:00:00.000Z' },
      { messageId: 'a-old', conversationId: 'conv-old', role: 'assistant', content: '以前的回答', contextSnapshot: null, createdAt: '2026-09-01T01:00:01.000Z' },
    );
    renderAdvisorPage();
    await openNewConversation();
    ai.hold = 'answer';
    send('户外活动够了吗');
    await waitFor(() => expect(userInserts()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /旧对话/ }));
    await waitFor(() => expect(screen.getByText('以前的回答')).toBeTruthy());
    expect(transcriptText()).not.toContain('户外活动够了吗');
    expect(screen.queryByRole('status')).toBeNull();
    expect(assistantInserts()).toHaveLength(0);
  });

  it('drops the old child\'s conversation and request when the child changes', async () => {
    renderAdvisorPage();
    await openNewConversation();
    ai.hold = 'answer';
    send('户外活动够了吗');
    await waitFor(() => expect(userInserts()).toHaveLength(1));

    act(() => { useAppStore.setState({ activeChildId: 'child-2' }); });
    await waitFor(() => expect(screen.getByText('选择或创建一个对话')).toBeTruthy());
    expect(transcriptText()).toBe('');
    expect(screen.queryByText('户外活动够了吗')).toBeNull();
    expect(assistantInserts()).toHaveLength(0);
    expect(bridge.insertConsultationAiMessage).not.toHaveBeenCalled();
  });

  it('writes a reminder consultation only with a checked answer', async () => {
    bridge.getReminderStates.mockResolvedValue([{ childId: 'child-1', ruleId: 'PO-REM-INT-003', repeatIndex: 0 }]);
    renderAdvisorPage(['/?reminderRuleId=PO-REM-INT-003&repeatIndex=0']);
    await openNewConversation();
    ai.answer = '这可能是发育迟缓。';
    send('孩子一直喜欢画画，要不要系统学？');
    await waitFor(() => expect(screen.getByText(/没有通过安全检查/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: '停止生成' })).toBeNull();
    expect(screen.queryByText('正在整理回答…')).toBeNull();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
    expect(bridge.insertConsultationAiMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/可以核对的记录/)).toBeTruthy();
    expect(screen.getByText(/户外活动：本周（2026-09-28 起）已记录 90 分钟/)).toBeTruthy();

    ai.answer = '记录里还没有和画画相关的随记；可以先记下每次投入的时长和表现。';
    fireEvent.click(screen.getByRole('button', { name: /重新回答/ }));
    await waitFor(() => expect(bridge.insertConsultationAiMessage).toHaveBeenCalledTimes(1));
    expect(bridge.insertConsultationAiMessage.mock.calls[0]?.[0]).toMatchObject({ childId: 'child-1', ruleId: 'PO-REM-INT-003', repeatIndex: 0 });
    expect(assistantInserts()).toHaveLength(0);
  });

  it('saves the checked answer without a consult mark when the reminder has no row', async () => {
    renderAdvisorPage(['/?reminderRuleId=PO-REM-INT-003&repeatIndex=0']);
    await openNewConversation();
    ai.answer = '记录里还没有和画画相关的随记；可以先记下每次投入的时长和表现。';
    send('孩子一直喜欢画画，要不要系统学？');
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));
    expect(bridge.insertConsultationAiMessage).not.toHaveBeenCalled();
    expect(screen.queryByText(/没有保存成功/)).toBeNull();
  });

  it('starts a journal conversation with the entry as the question context', async () => {
    renderAdvisorPage([{
      pathname: '/',
      state: {
        journalEntryContext: {
          entryId: 'journal-1',
          recordedAt: '2026-09-27T13:00:00.000Z',
          contentType: 'text',
          textContent: '作业写到很晚，十一点才睡。',
          dimensionName: '自我管理',
          tags: ['作业'],
          recorderName: '妈妈',
        },
      },
    }]);
    await waitFor(() => expect(screen.getByText('关于这条随记，你想聊什么？')).toBeTruthy());
    ai.intent = JSON.stringify({ task: 'records', domains: ['sleep', 'observation'], groups: ['sleep', 'journal'], time: { kind: 'default' }, compare: false, detail: false });
    ai.answer = '家长记录里提到作业写到很晚、十一点才睡；睡眠记录这段时间还没有。';
    fireEvent.click(screen.getByRole('button', { name: /请帮我整理这条记录的关键信息/ }));
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));
    expect(bridge.createConversation.mock.calls[0]?.[0]).toMatchObject({ childId: 'child-1', title: '随记 2026-09-27' });
    const question = userInserts()[0]?.[0].content as string;
    expect(question).toContain('作业写到很晚，十一点才睡。');
    expect(question).toContain('请帮我整理这条记录的关键信息');
  });

  it('offers starter questions grounded in recent records and sends the chosen one', async () => {
    renderAdvisorPage();
    await openNewConversation();
    await waitFor(() => expect(screen.getByRole('button', { name: '这周户外够吗？' })).toBeTruthy());
    const grounding = JSON.parse((ai.runParentosTextGenerate.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ text: string }> }> })
      .messages[1]?.content[0]?.text.split('\n')[1] ?? '{}');
    expect(grounding.recordedCategories).toEqual([{ category: '户外活动', recordsInPeriod: 2, latestRecordDate: '2026-09-29' }]);
    expect(grounding.knowledgeTopics).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: '这周户外够吗？' }));
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));
    expect(userInserts()[0]?.[0].content).toBe('这周户外够吗？');
  });
});
