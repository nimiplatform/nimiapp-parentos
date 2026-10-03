import { describe, expect, it } from 'vitest';
import {
  buildAdvisorIntentMessages,
  extractJsonObject,
  parseAdvisorIntent,
  readSnapshotIntent,
  resolveAdvisorFollowUp,
  resolveAdvisorIntentGroups,
  type AdvisorIntent,
} from './advisor-intent.js';

const valid = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  task: 'records',
  domains: ['outdoor'],
  groups: ['outdoor'],
  time: { kind: 'default' },
  compare: false,
  detail: false,
  ...overrides,
});

describe('parseAdvisorIntent', () => {
  it('accepts the closed typed shape, including fenced or reasoning-wrapped output', () => {
    expect(parseAdvisorIntent(valid())).toMatchObject({ ok: true, intent: { task: 'records', domains: ['outdoor'], groups: ['outdoor'] } });
    expect(parseAdvisorIntent(`\`\`\`json\n${valid()}\n\`\`\``).ok).toBe(true);
    expect(parseAdvisorIntent(`<think>{"task":"chat"}</think>${valid({ compare: true })}`))
      .toMatchObject({ ok: true, intent: { compare: true } });
  });

  it('defaults absent time and flags but rejects anything outside the closed sets', () => {
    expect(parseAdvisorIntent('{"task":"overview"}')).toMatchObject({ ok: true, intent: { time: { kind: 'default' }, compare: false, detail: false } });
    expect(parseAdvisorIntent('我觉得是户外问题')).toEqual({ ok: false, reason: 'intent-json-missing' });
    expect(parseAdvisorIntent(valid({ task: 'advice' }))).toEqual({ ok: false, reason: 'intent-task-invalid' });
    expect(parseAdvisorIntent(valid({ domains: ['screen-time'] }))).toEqual({ ok: false, reason: 'intent-domain-invalid' });
    expect(parseAdvisorIntent(valid({ groups: ['eyes'] }))).toEqual({ ok: false, reason: 'intent-group-invalid' });
    expect(parseAdvisorIntent(valid({ time: { kind: 'range', start: '2026-02-30', end: '2026-03-01' } }))).toEqual({ ok: false, reason: 'intent-time-invalid' });
    expect(parseAdvisorIntent(valid({ time: { kind: 'recent-days', days: 0 } }))).toEqual({ ok: false, reason: 'intent-time-invalid' });
    expect(parseAdvisorIntent(valid({ compare: 'yes' }))).toEqual({ ok: false, reason: 'intent-flag-invalid' });
  });

  it('reads sibling catalog ids through the documented link and ignores scope on follow-up', () => {
    expect(parseAdvisorIntent(valid({ domains: ['outdoor', 'journal'], groups: ['sensitivity'] })))
      .toMatchObject({ ok: true, intent: { domains: ['outdoor'], groups: ['journal'] } });
    expect(parseAdvisorIntent(valid({ task: 'follow-up', domains: ['sleep', 'digital'], groups: ['digital', 'sensitivity'] })))
      .toMatchObject({ ok: true, intent: { task: 'follow-up', domains: [], groups: [] } });
  });

  it('clears domains and groups for chat so small talk reads nothing', () => {
    const parsed = parseAdvisorIntent(valid({ task: 'chat' }));
    expect(parsed).toMatchObject({ ok: true, intent: { task: 'chat', domains: [], groups: [] } });
  });

  it('finds the first balanced object even with braces inside strings', () => {
    expect(extractJsonObject('prefix {"a":"}{","b":{"c":1}} suffix')).toEqual({ a: '}{', b: { c: 1 } });
  });
});

describe('resolveAdvisorIntentGroups', () => {
  const intent = (overrides: Partial<AdvisorIntent>): AdvisorIntent => ({
    task: 'records', domains: [], groups: [], time: { kind: 'default' }, compare: false, detail: false, ...overrides,
  });

  it('reads every group for an overview and none for chat', () => {
    expect(resolveAdvisorIntentGroups(intent({ task: 'overview' }))).toEqual([
      'growth', 'vision', 'fitness', 'sleep', 'outdoor', 'vaccine', 'dental', 'medical', 'development', 'posture', 'journal',
    ]);
    expect(resolveAdvisorIntentGroups(intent({ task: 'chat', groups: ['sleep'] }))).toEqual([]);
  });

  it('adds the record groups that hold each named domain', () => {
    expect(resolveAdvisorIntentGroups(intent({ domains: ['sleep', 'sensitivity', 'digital', 'outdoor'] })))
      .toEqual(['sleep', 'outdoor', 'journal']);
    expect(resolveAdvisorIntentGroups(intent({ domains: ['dental'], groups: [] }))).toEqual(['dental']);
  });
});

describe('resolveAdvisorFollowUp', () => {
  const previous: AdvisorIntent = {
    task: 'records', domains: ['vision'], groups: ['vision'], time: { kind: 'this-month' }, compare: false, detail: false,
  };
  const followUp = (overrides: Partial<AdvisorIntent> = {}): AdvisorIntent => ({
    task: 'follow-up', domains: [], groups: [], time: { kind: 'default' }, compare: false, detail: false, ...overrides,
  });

  it('continues the previous answered scope with the new flags', () => {
    expect(resolveAdvisorFollowUp(followUp({ compare: true }), previous))
      .toEqual({ ...previous, compare: true, detail: false });
    expect(resolveAdvisorFollowUp(followUp({ detail: true, time: { kind: 'last-month' } }), previous))
      .toEqual({ ...previous, time: { kind: 'last-month' }, detail: true });
  });

  it('asks for clarification when there is no answered turn to continue', () => {
    expect(resolveAdvisorFollowUp(followUp(), null).task).toBe('clarify');
  });

  it('reads the resolved intent frozen in an answer snapshot', () => {
    expect(readSnapshotIntent(JSON.stringify({ version: 2, intent: previous }))).toEqual(previous);
    expect(readSnapshotIntent('{"version":1}')).toBeNull();
    expect(readSnapshotIntent('not json')).toBeNull();
  });

  it('keeps the answered calendar period when a follow-up crosses into another month', () => {
    const frozen = readSnapshotIntent(JSON.stringify({
      version: 2,
      intent: previous,
      facts: { period: { start: '2026-09-01', end: '2026-09-30' } },
    }));
    expect(resolveAdvisorFollowUp(followUp(), frozen).time)
      .toEqual({ kind: 'range', start: '2026-09-01', end: '2026-09-30' });
    expect(resolveAdvisorFollowUp(followUp({ time: { kind: 'this-month' } }), frozen).time)
      .toEqual({ kind: 'this-month' });
  });
});

describe('buildAdvisorIntentMessages', () => {
  it('labels recent turns as context and sends the question as the only user message', () => {
    const messages = buildAdvisorIntentMessages({
      question: '那和上次比呢',
      today: '2026-09-30',
      language: 'zh',
      history: [{
        user: { messageId: 'u1', content: '视力最近怎么样' },
        assistant: { messageId: 'a1', content: '9月10日左眼 4.9，右眼 5.0。' },
      }],
    });
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[1]?.text).toBe('那和上次比呢');
    const system = messages[0]?.text ?? '';
    expect(system).toContain('今天是 2026-09-30');
    expect(system).toContain('家长：视力最近怎么样');
    expect(system).toContain('顾问：9月10日左眼 4.9，右眼 5.0。');
    expect(system).toContain('- digital：');
    expect(system).toContain('- journal：');
  });
});
