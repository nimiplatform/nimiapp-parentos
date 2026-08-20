// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
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
  role: 'user' | 'assistant';
  content: string;
  contextSnapshot: string | null;
  createdAt: string;
};

type TextGenerateInput = {
  surfaceId: string;
  messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
  defaults?: { temperature?: number; maxTokens?: number };
};

const conversationStore: StoredConversation[] = [];
const messageStore: StoredMessage[] = [];

const {
  createConversationMock,
  getConversationsMock,
  insertAiMessageMock,
  insertConsultationAiMessageMock,
  getAiMessagesMock,
  getMeasurementsMock,
  getVaccineRecordsMock,
  getMilestoneRecordsMock,
  getJournalEntriesMock,
  getOutdoorRecordsMock,
  getOutdoorGoalMock,
  textGenerateMock,
  chatControl,
} = vi.hoisted(() => ({
  createConversationMock: vi.fn(async (params: {
    conversationId: string;
    childId: string;
    title: string | null;
    now: string;
  }) => {
    conversationStore.unshift({
      conversationId: params.conversationId,
      childId: params.childId,
      title: params.title,
      startedAt: params.now,
      lastMessageAt: params.now,
      messageCount: 0,
      createdAt: params.now,
    });
  }),
  getConversationsMock: vi.fn(async (childId: string) => conversationStore
    .filter((item) => item.childId === childId)
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))),
  insertAiMessageMock: vi.fn(async (params: {
    messageId: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    contextSnapshot: string | null;
    now: string;
  }) => {
    messageStore.push({
      messageId: params.messageId,
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      contextSnapshot: params.contextSnapshot,
      createdAt: params.now,
    });
    const conversation = conversationStore.find((item) => item.conversationId === params.conversationId);
    if (conversation) {
      conversation.lastMessageAt = params.now;
      conversation.messageCount += 1;
    }
  }),
  insertConsultationAiMessageMock: vi.fn(async (params: {
    messageId: string;
    conversationId: string;
    childId: string;
    ruleId: string;
    repeatIndex: number;
    content: string;
    contextSnapshot: string | null;
    now: string;
  }) => {
    messageStore.push({
      messageId: params.messageId,
      conversationId: params.conversationId,
      role: 'assistant',
      content: params.content,
      contextSnapshot: params.contextSnapshot,
      createdAt: params.now,
    });
    const conversation = conversationStore.find((item) => item.conversationId === params.conversationId);
    if (conversation) {
      conversation.lastMessageAt = params.now;
      conversation.messageCount += 1;
    }
  }),
  getAiMessagesMock: vi.fn(async (conversationId: string) => messageStore
    .filter((item) => item.conversationId === conversationId)
    .map((item) => ({ ...item }))),
  getMeasurementsMock: vi.fn(async () => [
    {
      measurementId: 'm-1',
      childId: 'child-1',
      typeId: 'height',
      value: 98.4,
      measuredAt: '2026-04-01T00:00:00.000Z',
      ageMonths: 27,
      percentile: null,
      source: 'manual',
      notes: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ]),
  getVaccineRecordsMock: vi.fn(async () => [
    {
      recordId: 'v-1',
      childId: 'child-1',
      ruleId: 'PO-REM-VAC-001',
      vaccineName: 'MMR',
      vaccinatedAt: '2026-03-01T00:00:00.000Z',
      ageMonths: 26,
      batchNumber: null,
      hospital: null,
      adverseReaction: null,
      photoPath: null,
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ]),
  getMilestoneRecordsMock: vi.fn(async () => [
    {
      recordId: 'ms-1',
      childId: 'child-1',
      milestoneId: 'PO-MS-LANG-003',
      achievedAt: '2026-02-01T00:00:00.000Z',
      ageMonthsWhenAchieved: 25,
      notes: null,
      photoPath: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ]),
  getJournalEntriesMock: vi.fn(async () => [
    {
      entryId: 'j-1',
      childId: 'child-1',
      contentType: 'text',
      textContent: '午睡比较稳定',
      voicePath: null,
      photoPaths: null,
      recordedAt: '2026-04-02T00:00:00.000Z',
      ageMonths: 27,
      observationMode: 'five-minute',
      dimensionId: null,
      selectedTags: null,
      guidedAnswers: null,
      observationDuration: 5,
      keepsake: 0,
      moodTag: null,
      recorderId: 'mom',
      createdAt: '2026-04-02T00:00:00.000Z',
      updatedAt: '2026-04-02T00:00:00.000Z',
    },
  ]),
  getOutdoorRecordsMock: vi.fn(async () => []),
  getOutdoorGoalMock: vi.fn(async () => null),
  textGenerateMock: vi.fn(),
  chatControl: {
    text: '默认顾问回复。',
    failure: null as { message: string; reasonCode: string } | null,
  },
}));

vi.mock('@nimiplatform/kit/features/chat/ui', () => {
  /** Minimal markdown renderer that converts **bold** and - list items. */
  function SimpleMd({ content }: { content: string }) {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(<ul key={`ul-${elements.length}`}>{listItems.map((li, i) => <li key={i}>{li}</li>)}</ul>);
        listItems = [];
      }
    };

    for (const line of lines) {
      if (line.startsWith('- ')) {
        listItems.push(line.slice(2));
        continue;
      }
      flushList();
      if (line.trim()) {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : part
        ));
        elements.push(<p key={`p-${elements.length}`}>{parts}</p>);
      }
    }
    flushList();
    return <div>{elements}</div>;
  }

  return {
    CanonicalConversationShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CanonicalTranscriptView: ({ messages }: { messages: Array<{ id: string; role: string; content: string }> }) => (
      <div>
        {messages.map((message) => (
          <div key={message.id} data-role={message.role}>
            <SimpleMd content={message.content} />
          </div>
        ))}
      </div>
    ),
  };
});

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  createConversation: createConversationMock,
  getConversations: getConversationsMock,
  insertAiMessage: insertAiMessageMock,
  insertConsultationAiMessage: insertConsultationAiMessageMock,
  getAiMessages: getAiMessagesMock,
  getMeasurements: getMeasurementsMock,
  getVaccineRecords: getVaccineRecordsMock,
  getMilestoneRecords: getMilestoneRecordsMock,
  getJournalEntries: getJournalEntriesMock,
  getOutdoorRecords: getOutdoorRecordsMock,
  getOutdoorGoal: getOutdoorGoalMock,
}));

vi.mock('../settings/parentos-ai-runtime.js', () => ({
  runParentosTextGenerate: (input: TextGenerateInput) => textGenerateMock(input),
}));

vi.mock('../settings/parentos-ai-config.js', () => ({
  hasParentosAIConfigCapability: () => Promise.resolve(true),
  PARENTOS_TEXT_CAPABILITY_CONTRACT: 'text.generate',
}));

function promptTextOf(input: TextGenerateInput): string {
  return input.messages
    .map((message) => message.content.map((part) => part.text ?? '').join(''))
    .join('\n');
}

function isSuggestionCall(input: TextGenerateInput): boolean {
  const system = input.messages.find((message) => message.role === 'system');
  const systemText = system?.content.map((part) => part.text ?? '').join('') ?? '';
  return systemText.startsWith('你是 ParentOS 的"推荐问题"助手。');
}

function chatCalls(): TextGenerateInput[] {
  return textGenerateMock.mock.calls
    .map((call) => call[0] as TextGenerateInput)
    .filter((input) => !isSuggestionCall(input));
}

function renderAdvisorPage(
  initialEntries: Array<string | { pathname: string; state?: unknown }> = ['/'],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AdvisorPage />
    </MemoryRouter>,
  );
}

describe('AdvisorPage', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    conversationStore.length = 0;
    messageStore.length = 0;
    createConversationMock.mockClear();
    getConversationsMock.mockClear();
    insertAiMessageMock.mockClear();
    insertConsultationAiMessageMock.mockClear();
    getAiMessagesMock.mockClear();
    getMeasurementsMock.mockClear();
    getVaccineRecordsMock.mockClear();
    getMilestoneRecordsMock.mockClear();
    getJournalEntriesMock.mockClear();
    getOutdoorRecordsMock.mockClear();
    getOutdoorGoalMock.mockClear();
    textGenerateMock.mockReset();
    chatControl.text = '默认顾问回复。';
    chatControl.failure = null;
    textGenerateMock.mockImplementation(async (input: TextGenerateInput) => {
      if (isSuggestionCall(input)) {
        return {
          ok: true as const,
          text: JSON.stringify([
            '最近睡眠节律稳定吗？',
            '户外活动还够吗？',
            '敏感期要注意什么？',
          ]),
          finishReason: 'stop' as const,
          traceId: 'trace-suggest',
        };
      }
      if (chatControl.failure) {
        return {
          ok: false as const,
          error: {
            message: chatControl.failure.message,
            reasonCode: chatControl.failure.reasonCode,
            cause: new Error(chatControl.failure.message),
          },
        };
      }
      return {
        ok: true as const,
        text: chatControl.text,
        finishReason: 'stop' as const,
        traceId: 'trace-chat',
      };
    });

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

  afterEach(() => {
    useAppStore.setState({
      bootstrapReady: false,
      familyId: null,
      activeChildId: null,
      children: [],
    });
  });

  it('persists a full frozen advisor snapshot and routes unknown domains to clarifier runtime', async () => {
    chatControl.text = '你想聊睡眠、敏感期、屏幕使用，还是先看身高、疫苗、里程碑这些记录？';

    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(chatCalls()).toHaveLength(1);
    });

    const chatInput = chatCalls()[0]!;
    expect(chatInput.surfaceId).toBe('parentos.advisor');
    const promptText = promptTextOf(chatInput);
    expect(promptText).toContain('当前策略：unknown-clarifier');
    expect(promptText).toContain('已审核领域');

    const userCall = insertAiMessageMock.mock.calls.find((call) => call[0].role === 'user')?.[0];
    expect(userCall?.contextSnapshot).toBeTruthy();
    expect(screen.getByRole('button', { name: /最近怎么样？/ })).toBeTruthy();
    const snapshot = JSON.parse(String(userCall?.contextSnapshot)) as {
      child: { childId: string; displayName: string };
      measurements: unknown[];
      vaccines: unknown[];
      milestones: unknown[];
      journalEntries: unknown[];
    };
    expect(snapshot.child).toEqual(expect.objectContaining({
      childId: 'child-1',
      displayName: 'Mimi',
    }));
    expect(snapshot.measurements).toHaveLength(1);
    expect(snapshot.vaccines).toHaveLength(1);
    expect(snapshot.milestones).toHaveLength(1);
    expect(snapshot.journalEntries).toHaveLength(1);

    await waitFor(() => {
      expect(screen.getByText(/你想聊睡眠、敏感期、屏幕使用/)).toBeTruthy();
    });
  });

  it('shows journal context preview and starts conversation on starter click', async () => {
    chatControl.text = '我先帮你整理一下这条随记里值得继续留意的部分。';

    renderAdvisorPage([{
      pathname: '/advisor',
      state: {
        journalEntryContext: {
          entryId: 'journal-entry-1',
          recordedAt: '2026-04-05T09:48:00.000Z',
          contentType: 'text',
          textContent: '午睡前自己把玩具收好了，还主动和我说想先去洗手。',
          dimensionName: 'Self care',
          tags: ['Independent cleanup'],
          recorderName: 'Mom',
        },
      },
    }]);

    // Should show context preview instead of auto-sending
    await waitFor(() => {
      expect(screen.getByText('关于这条随记，你想聊什么？')).toBeTruthy();
      expect(screen.getByText(/午睡前自己把玩具收好了/)).toBeTruthy();
      expect(screen.getByText('Self care')).toBeTruthy();
      expect(screen.getByText('Independent cleanup')).toBeTruthy();
    });

    // No conversation created yet
    expect(createConversationMock).not.toHaveBeenCalled();

    // Click a starter to begin conversation
    fireEvent.click(screen.getByText('请帮我整理这条记录的关键信息'));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1);
      expect(chatCalls()).toHaveLength(1);
    });

    expect(createConversationMock.mock.calls[0]?.[0]).toMatchObject({
      childId: 'child-1',
      title: '随记 2026-04-05',
    });

    const userCall = insertAiMessageMock.mock.calls.find((call) => call[0].role === 'user')?.[0];
    expect(userCall?.content).toContain('成长随记继续聊聊');
    expect(userCall?.content).toContain('Self care');
    expect(userCall?.content).toContain('Independent cleanup');
    expect(userCall?.content).toContain('午睡前自己把玩具收好了');
    expect(userCall?.content).toContain('请帮我整理这条记录的关键信息');

    await waitFor(() => {
      expect(screen.getByText(/我先帮你整理一下这条随记/)).toBeTruthy();
    });
  });

  it('persists reminder-launched advisor replies through the consultation transaction', async () => {
    chatControl.text = '睡眠节律目前比较稳定。';

    renderAdvisorPage(['/advisor?reminderRuleId=PO-REM-CONSULT-001&repeatIndex=2']);

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(chatCalls()).toHaveLength(1);
      expect(insertConsultationAiMessageMock).toHaveBeenCalledTimes(1);
    });

    expect(createConversationMock.mock.calls[0]?.[0]).toMatchObject({
      childId: 'child-1',
      title: null,
    });
    expect(insertConsultationAiMessageMock.mock.calls[0]?.[0]).toMatchObject({
      childId: 'child-1',
      ruleId: 'PO-REM-CONSULT-001',
      repeatIndex: 2,
    });
    expect(insertConsultationAiMessageMock.mock.calls[0]?.[0].content).toContain('睡眠节律目前比较稳定。');
    expect(insertAiMessageMock.mock.calls.filter((call) => call[0].role === 'assistant')).toHaveLength(0);

    await waitFor(() => {
      expect(screen.getByText(/睡眠节律目前比较稳定/)).toBeTruthy();
    });
  });

  it('shows structured fallback and still allows retry when reminder consultation writeback fails', async () => {
    chatControl.text = '第一次回复不应显示。';
    insertConsultationAiMessageMock.mockRejectedValueOnce(new Error('missing reminder state'));

    renderAdvisorPage(['/advisor?reminderRuleId=PO-REM-CONSULT-001&repeatIndex=2']);

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(chatCalls()).toHaveLength(1);
      expect(insertConsultationAiMessageMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/第一次回复不应显示/)).toBeNull();
    await waitFor(() => {
      expect(screen.getByText(/首条咨询回复持久化失败/)).toBeTruthy();
    });
    expect(insertAiMessageMock.mock.calls.filter((call) => call[0].role === 'assistant')).toHaveLength(0);

    chatControl.text = '第二次回复已写回。';
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(chatCalls()).toHaveLength(2);
      expect(insertConsultationAiMessageMock).toHaveBeenCalledTimes(2);
    });
    expect(insertConsultationAiMessageMock.mock.calls[1]?.[0]).toMatchObject({
      childId: 'child-1',
      ruleId: 'PO-REM-CONSULT-001',
      repeatIndex: 2,
    });
    expect(insertConsultationAiMessageMock.mock.calls[1]?.[0].content).toContain('第二次回复已写回。');

    await waitFor(() => {
      expect(screen.getByText(/第二次回复已写回/)).toBeTruthy();
    });
  });

  it('assembles reviewed-domain runtime prompts from the frozen snapshot', async () => {
    chatControl.text = '睡眠节律目前比较稳定。';

    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(chatCalls()).toHaveLength(1);
    });

    const chatInput = chatCalls()[0]!;
    expect(chatInput.surfaceId).toBe('parentos.advisor');
    const promptText = promptTextOf(chatInput);
    expect(promptText).toContain('当前策略：reviewed-advice');
    expect(promptText).toContain('问题：最近睡眠怎么样？');
    expect(promptText).toContain('已判定领域：sleep');
    expect(promptText).toContain('"childId":"child-1"');

    await waitFor(() => {
      expect(screen.getByText(/来源：sleep:/)).toBeTruthy();
    });
  });

  it('fails closed for generic advisor chat without reviewed-domain readiness', async () => {
    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '你好，测试，你的模型是？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(insertAiMessageMock.mock.calls.filter((call) => call[0].role === 'assistant')).toHaveLength(1);
    });

    expect(chatCalls()).toHaveLength(0);

    await waitFor(() => {
      expect(screen.getByText(/当前问题尚未明确到已审核领域/)).toBeTruthy();
    });
    expect(screen.queryByText(/本地受治理的模型调用路径/)).toBeNull();
  });

  it('fails closed for needs-review questions instead of entering runtime', async () => {
    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '疫苗补种怎么判断？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(insertAiMessageMock.mock.calls.filter((call) => call[0].role === 'assistant')).toHaveLength(1);
    });

    expect(chatCalls()).toHaveLength(0);

    await waitFor(() => {
      expect(screen.getByText(/当前问题涉及 needs-review 领域/)).toBeTruthy();
    });
    expect(screen.getByText(/建议咨询专业人士/)).toBeTruthy();
  });

  it('returns structured fallback when advisor snapshot assembly fails before runtime', async () => {
    getMeasurementsMock
      .mockRejectedValueOnce(new Error('snapshot read failed'))
      .mockRejectedValueOnce(new Error('snapshot read failed'));

    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(insertAiMessageMock.mock.calls.filter((call) => call[0].role === 'assistant')).toHaveLength(1);
    });

    expect(chatCalls()).toHaveLength(0);
    expect(insertAiMessageMock.mock.calls.find((call) => call[0].role === 'user')?.[0].contextSnapshot).toContain('"measurements":[]');

    await waitFor(() => {
      expect(screen.getByText(/本地快照读取失败/)).toBeTruthy();
    });
  });

  it('returns local structured fallback when user message persistence fails before runtime', async () => {
    insertAiMessageMock.mockRejectedValueOnce(new Error('user write failed'));

    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByText(/用户消息持久化失败/)).toBeTruthy();
    });

    expect(chatCalls()).toHaveLength(0);
    expect(insertAiMessageMock.mock.calls.filter((call) => call[0].role === 'assistant')).toHaveLength(0);
  });

  it('keeps typed runtime failure codes out of the user-visible fallback note', async () => {
    chatControl.failure = {
      reasonCode: 'local-app-operation-unavailable',
      message: 'dial tcp 127.0.0.1:8321: connect: connection refused',
    };

    renderAdvisorPage();

    fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入问题...')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('输入问题...'), {
      target: { value: '最近睡眠怎么样？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByText(/AI 运行时响应失败，已退回本地结构化事实/)).toBeTruthy();
    });
    expect(screen.queryByText(/local-app-operation-unavailable/)).toBeNull();
    expect(screen.queryByText(/connect: connection refused/)).toBeNull();
  });

  it('renders conversation list and message content without raw UTC slices', async () => {
    conversationStore.push({
      conversationId: 'conv-local-time',
      childId: 'child-1',
      title: '本地时间测试',
      startedAt: '2026-04-14T16:39:14.000Z',
      lastMessageAt: '2026-04-14T16:39:14.000Z',
      messageCount: 1,
      createdAt: '2026-04-14T16:39:14.000Z',
    });
    messageStore.push({
      messageId: 'msg-local-time',
      conversationId: 'conv-local-time',
      role: 'assistant',
      content: '本地时间显示检查',
      contextSnapshot: null,
      createdAt: '2026-04-14T16:41:55.000Z',
    });

    renderAdvisorPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本地时间测试/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /本地时间测试/i }));

    await waitFor(() => {
      expect(screen.getByText('本地时间显示检查')).toBeTruthy();
    });

    // Sidebar shows Chinese relative time instead of raw date strings
    // Raw UTC segments must not leak to the UI
    expect(screen.queryByText('16:39:14')).toBeNull();
    expect(screen.queryByText('16:41:55')).toBeNull();
  });

  it('generates starter suggestions once runtime availability becomes ready', async () => {
    renderAdvisorPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /新对话/ }));
    });

    await waitFor(() => {
      expect(textGenerateMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '最近睡眠节律稳定吗？' })).toBeTruthy();
    });
  });
});
