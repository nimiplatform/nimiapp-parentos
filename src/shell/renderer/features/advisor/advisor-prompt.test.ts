import { describe, expect, it } from 'vitest';
import type { HealthRecordEventRow, HealthRecordValueRow } from '../../bridge/sqlite-bridge.js';
import { projectAdvisorFacts, resolveAdvisorPeriod, type AdvisorChildContext, type AdvisorRecordGroupId } from './advisor-context.js';
import type { AdvisorHistoryTurn, AdvisorIntent } from './advisor-intent.js';
import { selectAdvisorKnowledge } from './advisor-knowledge.js';
import { ADVISOR_ANSWER_BUDGET, buildAdvisorAnswerMessages, utf8Bytes } from './advisor-prompt.js';

const teen: AdvisorChildContext = {
  childId: 'c1', displayName: '小安', gender: 'female', birthDate: '2012-11-20', nurtureMode: 'advanced', ageMonths: 166, recorderProfiles: null,
};

function manyRows() {
  const events: HealthRecordEventRow[] = [];
  const values: HealthRecordValueRow[] = [];
  const add = (protocolId: string, groupId: string, date: string, metricId: string, valueNumber: number, unit: string | null) => {
    const eventId = `e${events.length}`;
    events.push({
      eventId, childId: 'c1', protocolId, groupId, recordKind: 'manual', sourceSurface: 'profile_detail', recordedAt: date, effectiveDate: date,
      ageMonths: 160, recorderId: null, linkedReminderStateId: null, linkedReminderRuleId: null, notes: '裸眼视力，未散瞳', metadataJson: null,
      createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`,
    });
    values.push({
      valueId: `${eventId}-v`, eventId, childId: 'c1', metricId, valueNumber, valueText: null, valueJson: null, unit, qualifier: null,
      recordKind: 'measured', sourceValueIds: null, createdAt: `${date}T08:00:00.000Z`,
    });
  };
  for (let day = 1; day <= 28; day += 1) {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
    add('sleep-night', 'sleep', date, 'sleep.duration_minutes', 450 + day, 'min');
    add('outdoor-activity', 'outdoor', date, 'outdoor.activity_minutes', 30 + day, 'min');
    add('vision-basic', 'vision', date, 'vision.left_visual_acuity', 0.4, 'decimal');
    add('growth-school-biannual', 'growth', date, 'growth.height', 160 + day / 10, 'cm');
  }
  return { events, values };
}

const intent = (overrides: Partial<AdvisorIntent>): AdvisorIntent => ({
  task: 'records', domains: [], groups: [], time: { kind: 'default' }, compare: false, detail: false, ...overrides,
});

function factsFor(groups: AdvisorRecordGroupId[]) {
  return projectAdvisorFacts({
    child: teen,
    sources: { health: { status: 'ok', rows: manyRows() }, outdoorGoal: { status: 'ok', rows: 630 }, journal: { status: 'ok', rows: [] } },
    groups,
    period: resolveAdvisorPeriod({ kind: 'default' }, '2026-09-30', teen.birthDate),
    today: '2026-09-30',
    requestedAt: '2026-09-30T10:00:00.000Z',
  });
}

describe('buildAdvisorAnswerMessages', () => {
  it('keeps a large overview inside the budget with every category in the checklist', () => {
    const groups: AdvisorRecordGroupId[] = ['growth', 'vision', 'sleep', 'outdoor', 'journal'];
    const result = buildAdvisorAnswerMessages({
      strategy: 'needs-review-descriptive',
      intent: intent({ task: 'overview' }),
      child: teen,
      today: '2026-09-30',
      facts: factsFor(groups),
      knowledge: { entries: [], coverage: [] },
      history: [],
      question: '最近孩子整体发展情况怎么样',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const system = result.messages[0]?.text ?? '';
    expect(utf8Bytes(system)).toBeLessThanOrEqual(ADVISOR_ANSWER_BUDGET.maxMessageBytes);
    for (const label of ['户外活动', '生长', '视力', '睡眠']) expect(system).toContain(`- ${label}：`);
    expect(system).toContain('没有任何记录的类别：随记');
    expect(system).not.toContain('"nights"');
    expect(system).not.toContain('decimal');
    expect(JSON.stringify(result.factsView)).not.toContain('"inPeriod"');
  });

  it('itemizes the period\'s categories and reduces older-only ones to their latest date', () => {
    const rows = manyRows();
    const recentOutdoor = { events: rows.events.filter((event) => event.groupId === 'outdoor'), values: rows.values.filter((value) => value.metricId.startsWith('outdoor.')) };
    const oldGrowth = {
      eventId: 'old-growth', childId: 'c1', protocolId: 'growth-school-biannual', groupId: 'growth', recordKind: 'manual', sourceSurface: 'profile_detail',
      recordedAt: '2026-06-18', effectiveDate: '2026-06-18', ageMonths: 163, recorderId: null, linkedReminderStateId: null, linkedReminderRuleId: null,
      notes: null, metadataJson: null, createdAt: '2026-06-18T08:00:00.000Z', updatedAt: '2026-06-18T08:00:00.000Z',
    } satisfies HealthRecordEventRow;
    const facts = projectAdvisorFacts({
      child: teen,
      sources: {
        health: {
          status: 'ok',
          rows: {
            events: [...recentOutdoor.events, oldGrowth],
            values: [...recentOutdoor.values, {
              valueId: 'old-growth-v', eventId: 'old-growth', childId: 'c1', metricId: 'growth.height', valueNumber: 162.3, valueText: null, valueJson: null,
              unit: 'cm', qualifier: null, recordKind: 'measured', sourceValueIds: null, createdAt: '2026-06-18T08:00:00.000Z',
            }],
          },
        },
        outdoorGoal: { status: 'ok', rows: 630 },
      },
      groups: ['outdoor', 'growth', 'dental'],
      period: resolveAdvisorPeriod({ kind: 'default' }, '2026-09-30', teen.birthDate),
      today: '2026-09-30',
      requestedAt: '2026-09-30T10:00:00.000Z',
    });
    const result = buildAdvisorAnswerMessages({
      strategy: 'needs-review-descriptive',
      intent: intent({ task: 'overview' }),
      child: teen,
      today: '2026-09-30',
      facts,
      knowledge: { entries: [], coverage: [] },
      history: [],
      question: '最近孩子整体发展情况怎么样',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const system = result.messages[0]?.text ?? '';
    expect(system).toContain('- 户外活动：');
    expect(system).not.toContain('- 生长：');
    expect(system).toContain('只有更早记录的类别：生长（最近一次 2026-06-18）');
    expect(system).toContain('没有任何记录的类别：口腔');
    expect(system).not.toContain('digest 的顺序');
  });

  it('lists each named area with its reason, including areas the app does not record', () => {
    const domains = ['sleep', 'sensitivity', 'digital', 'outdoor'] as const;
    const result = buildAdvisorAnswerMessages({
      strategy: 'needs-review-descriptive',
      intent: intent({ domains: [...domains] }),
      child: teen,
      today: '2026-09-30',
      facts: factsFor(['sleep', 'outdoor', 'journal']),
      knowledge: selectAdvisorKnowledge({ domains: [...domains], ageMonths: teen.ageMonths }),
      history: [],
      question: '睡眠、敏感期、数字使用和户外都说一下',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const system = result.messages[0]?.text ?? '';
    expect(system).toContain('- 敏感期：');
    expect(system).toContain('现有资料只适用于约 0–7 岁，孩子现在 13 岁');
    expect(system).toMatch(/- 数字使用：还没有可用的一般资料；应用里也没有这方面的记录/u);
    expect(system).toContain('- 户外活动：本周（2026-09-28 起）已记录');
    expect(system).not.toContain('[K1]');
  });

  it('keeps at most six whole turns in real roles, with the question once and last', () => {
    const history: AdvisorHistoryTurn[] = Array.from({ length: 8 }, (_, index) => ({
      user: { messageId: `u${index}`, content: `问题 ${index}` },
      assistant: { messageId: `a${index}`, content: `回答 ${index}` },
    }));
    const result = buildAdvisorAnswerMessages({
      strategy: 'generic-chat',
      intent: intent({ task: 'chat' }),
      child: teen,
      today: '2026-09-30',
      facts: null,
      knowledge: { entries: [], coverage: [] },
      history,
      question: '你好',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages.map((message) => message.role)).toEqual(['system', ...Array(6).fill(['user', 'assistant']).flat(), 'user']);
    expect(result.messages[1]?.text).toBe('问题 2');
    expect(result.messages.at(-1)?.text).toBe('你好');
    expect(result.historyTrimmed).toBe(true);
    expect(result.messages[0]?.text).toContain('更早的对话没有提供给你');
  });

  it('hands knowledge entries only to reviewed-advice', () => {
    const preschooler = { ...teen, ageMonths: 48 };
    const knowledge = selectAdvisorKnowledge({ domains: ['sensitivity'], ageMonths: 48 });
    const base = {
      intent: intent({ task: 'knowledge', domains: ['sensitivity'] }),
      child: preschooler,
      today: '2026-09-30',
      facts: null,
      knowledge,
      history: [],
      question: '敏感期要注意什么',
    };
    const reviewed = buildAdvisorAnswerMessages({ ...base, strategy: 'reviewed-advice' });
    const descriptive = buildAdvisorAnswerMessages({ ...base, strategy: 'needs-review-descriptive', knowledge: { entries: [], coverage: knowledge.coverage } });
    expect(reviewed.ok && reviewed.messages[0]?.text).toContain('[K1]');
    expect(descriptive.ok && descriptive.messages[0]?.text).not.toContain('[K1]');
  });
});
