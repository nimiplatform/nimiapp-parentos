import {
  ADVISOR_DOMAIN_DEFINITIONS,
  ADVISOR_RECORD_GROUP_DEFINITIONS,
  ADVISOR_TASK_DEFINITIONS,
  type AdvisorClassifierDomain,
  type AdvisorIntentTask,
  type AdvisorLocalizedText,
  type AdvisorRecordGroupId,
} from '../../knowledge-base/index.js';
import { i18nText } from '../../i18n/index.js';
import type { AppLanguage } from '../../i18n/language.js';
import type { ParentosTextTurnMessage } from '../settings/parentos-ai-text-turn.js';

export type AdvisorTimeExpression =
  | { readonly kind: 'default' }
  | { readonly kind: 'recent-days'; readonly days: number }
  | { readonly kind: 'this-week' }
  | { readonly kind: 'last-week' }
  | { readonly kind: 'this-month' }
  | { readonly kind: 'last-month' }
  | { readonly kind: 'range'; readonly start: string; readonly end: string }
  | { readonly kind: 'all' };

export interface AdvisorIntent {
  readonly task: AdvisorIntentTask;
  readonly domains: readonly AdvisorClassifierDomain[];
  readonly groups: readonly AdvisorRecordGroupId[];
  readonly time: AdvisorTimeExpression;
  readonly compare: boolean;
  readonly detail: boolean;
}

/** A complete, adjacent user/assistant pair of the same conversation. */
export interface AdvisorHistoryTurn {
  readonly user: { readonly messageId: string; readonly content: string };
  readonly assistant: {
    readonly messageId: string;
    readonly content: string;
    /** The resolved intent frozen in that answer's snapshot, when readable. */
    readonly intent?: AdvisorIntent | null;
  };
}

export type AdvisorIntentParseResult =
  | { readonly ok: true; readonly intent: AdvisorIntent }
  | { readonly ok: false; readonly reason: string };

const TASKS = new Set<string>(ADVISOR_TASK_DEFINITIONS.map((definition) => definition.task));
const DOMAINS = new Set<string>(ADVISOR_DOMAIN_DEFINITIONS.map((definition) => definition.domain));
const GROUPS = new Set<string>(ADVISOR_RECORD_GROUP_DEFINITIONS.map((definition) => definition.groupId));
const SIMPLE_TIME_KINDS = new Set(['default', 'this-week', 'last-week', 'this-month', 'last-month', 'all']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const INTENT_HISTORY_TURNS = 3;
const INTENT_USER_CHARS = 400;
const INTENT_ASSISTANT_CHARS = 240;

/** Removes visible chain-of-thought markup some local models emit as plain text. */
export function stripReasoningMarkup(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/giu, '').replace(/^[\s\S]*?<\/think>/iu, '').trim();
}

/** Returns the first balanced JSON object in the text, or null. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function parseTime(value: unknown): AdvisorTimeExpression | null {
  if (value === undefined || value === null) return { kind: 'default' };
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== 'string') return null;
  if (SIMPLE_TIME_KINDS.has(kind)) return { kind } as AdvisorTimeExpression;
  if (kind === 'recent-days') {
    const days = record.days;
    return typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 3660 ? { kind, days } : null;
  }
  if (kind === 'range') {
    const { start, end } = record;
    return isRealDate(start) && isRealDate(end) && start <= end ? { kind, start, end } : null;
  }
  return null;
}

function parseIdList<T extends string>(value: unknown, allowed: ReadonlySet<string>): T[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) return null;
    if (!out.includes(item as T)) out.push(item as T);
  }
  return out;
}

function parseFlag(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  return typeof value === 'boolean' ? value : null;
}

/**
 * Domain ids and record-group ids are two closed catalogs linked by the
 * classifier asset. An id placed in the sibling field is read through that
 * documented link (a group-only id names records to read; a domain id in the
 * groups field names that domain's record groups). This widens only which
 * records are read and never grants knowledge. Unknown ids stay invalid.
 */
function splitScopeIds(domainsValue: unknown, groupsValue: unknown):
  | { domains: AdvisorClassifierDomain[]; groups: AdvisorRecordGroupId[] }
  | { invalid: 'intent-domain-invalid' | 'intent-group-invalid' } {
  const both = new Set([...DOMAINS, ...GROUPS]);
  const rawDomains = parseIdList<string>(domainsValue, both);
  if (!rawDomains) return { invalid: 'intent-domain-invalid' };
  const rawGroups = parseIdList<string>(groupsValue, both);
  if (!rawGroups) return { invalid: 'intent-group-invalid' };
  const domains = rawDomains.filter((id): id is AdvisorClassifierDomain => DOMAINS.has(id));
  const groups = new Set<AdvisorRecordGroupId>();
  for (const id of [...rawDomains.filter((item) => !DOMAINS.has(item)), ...rawGroups]) {
    if (GROUPS.has(id)) {
      groups.add(id as AdvisorRecordGroupId);
    } else {
      for (const group of ADVISOR_DOMAIN_DEFINITIONS.find((definition) => definition.domain === id)?.recordGroups ?? []) {
        groups.add(group);
      }
    }
  }
  return { domains, groups: [...groups] };
}

/**
 * One runtime type check of the intent-parse output. Anything outside the
 * closed task/domain/group/time sets is invalid: there is no keyword fallback
 * and no guessed classification. Chat and follow-up carry no scope of their
 * own, so their scope fields are ignored rather than validated.
 */
// @nimi-authority: rule.parentos.advs.r002
export function parseAdvisorIntent(raw: string): AdvisorIntentParseResult {
  const parsed = extractJsonObject(stripReasoningMarkup(raw));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'intent-json-missing' };
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.task !== 'string' || !TASKS.has(record.task)) {
    return { ok: false, reason: 'intent-task-invalid' };
  }
  const task = record.task as AdvisorIntentTask;
  const scopeless = task === 'chat' || task === 'follow-up';
  const scope = scopeless ? { domains: [], groups: [] } : splitScopeIds(record.domains, record.groups);
  if ('invalid' in scope) return { ok: false, reason: scope.invalid };
  const time = parseTime(record.time);
  if (!time) return { ok: false, reason: 'intent-time-invalid' };
  const compare = parseFlag(record.compare);
  const detail = parseFlag(record.detail);
  if (compare === null || detail === null) return { ok: false, reason: 'intent-flag-invalid' };
  return {
    ok: true,
    intent: {
      task,
      domains: scope.domains,
      groups: scope.groups,
      time,
      compare,
      detail,
    },
  };
}

/**
 * A follow-up continues the previous answered turn: its task, domains, record
 * groups and period come from that turn's frozen intent, while the new
 * comparison/detail flags and any explicit new period apply. Without an
 * answered previous turn it is a clarification.
 */
// @nimi-authority: rule.parentos.advs.r002
export function resolveAdvisorFollowUp(parsed: AdvisorIntent, previous: AdvisorIntent | null): AdvisorIntent {
  if (parsed.task !== 'follow-up') return parsed;
  if (!previous || previous.task === 'follow-up') {
    return { ...parsed, task: 'clarify' };
  }
  return {
    task: previous.task,
    domains: previous.domains,
    groups: previous.groups,
    time: parsed.time.kind === 'default' ? previous.time : parsed.time,
    compare: parsed.compare,
    detail: parsed.detail,
  };
}

/** The resolved intent frozen in an answer's contextSnapshot, or null. */
export function readSnapshotIntent(contextSnapshot: string | null): AdvisorIntent | null {
  if (!contextSnapshot) return null;
  try {
    const snapshot = JSON.parse(contextSnapshot) as { version?: unknown; intent?: unknown; facts?: { period?: { start?: unknown; end?: unknown } } };
    if (snapshot.version !== 2 || !snapshot.intent) return null;
    const parsed = parseAdvisorIntent(JSON.stringify(snapshot.intent));
    if (!parsed.ok) return null;
    // Resolve relative expressions against the original answer's frozen dates.
    // Reusing "this-month" or "default" would move a follow-up into a new period.
    const period = snapshot.facts?.period;
    if (period && isRealDate(period.start) && isRealDate(period.end) && period.start <= period.end) {
      return { ...parsed.intent, time: { kind: 'range', start: period.start, end: period.end } };
    }
    return parsed.intent;
  } catch {
    return null;
  }
}

/**
 * Record groups a turn must read: overview reads every group, chat reads
 * none, other tasks read the groups they named plus the groups that hold the
 * records of their named domains.
 */
export function resolveAdvisorIntentGroups(intent: AdvisorIntent): AdvisorRecordGroupId[] {
  if (intent.task === 'chat') return [];
  if (intent.task === 'overview') return ADVISOR_RECORD_GROUP_DEFINITIONS.map((definition) => definition.groupId);
  const groups = new Set<AdvisorRecordGroupId>(intent.groups);
  for (const domain of intent.domains) {
    for (const group of ADVISOR_DOMAIN_DEFINITIONS.find((definition) => definition.domain === domain)?.recordGroups ?? []) {
      groups.add(group);
    }
  }
  return ADVISOR_RECORD_GROUP_DEFINITIONS.map((definition) => definition.groupId).filter((group) => groups.has(group));
}

function localized(text: AdvisorLocalizedText, language: AppLanguage) {
  return text[language];
}

function clipText(text: string, max: number) {
  const compact = text.trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

export function buildAdvisorIntentSystemPrompt(input: {
  today: string;
  language: AppLanguage;
  history: readonly AdvisorHistoryTurn[];
}): string {
  const { language } = input;
  const lines: string[] = [
    i18nText('Advisor.intentPrompt.role'),
    '',
    i18nText('Advisor.intentPrompt.taskTitle'),
    ...ADVISOR_TASK_DEFINITIONS.map((definition) => i18nText('Advisor.intentPrompt.idLine', {
      id: definition.task,
      text: localized(definition.definition, language),
    })),
    '',
    i18nText('Advisor.intentPrompt.domainTitle'),
    ...ADVISOR_DOMAIN_DEFINITIONS.map((definition) => i18nText('Advisor.intentPrompt.domainLine', {
      id: definition.domain,
      text: localized(definition.definition, language),
      examples: definition.examples[language].join(i18nText('Advisor.intentPrompt.exampleSeparator')),
    })),
    '',
    i18nText('Advisor.intentPrompt.groupTitle'),
    ...ADVISOR_RECORD_GROUP_DEFINITIONS.map((definition) => i18nText('Advisor.intentPrompt.idLine', {
      id: definition.groupId,
      text: localized(definition.definition, language),
    })),
    '',
    i18nText('Advisor.intentPrompt.timeTitle', { today: input.today }),
    i18nText('Advisor.intentPrompt.flags'),
    '',
    i18nText('Advisor.intentPrompt.rulesTitle'),
    i18nText('Advisor.intentPrompt.ruleFollowUp'),
    i18nText('Advisor.intentPrompt.ruleAllNamed'),
    i18nText('Advisor.intentPrompt.ruleTaskChoice'),
    i18nText('Advisor.intentPrompt.ruleClarify'),
    i18nText('Advisor.intentPrompt.ruleOutput'),
    '',
    i18nText('Advisor.intentPrompt.examplesTitle'),
  ];
  for (const definition of ADVISOR_TASK_DEFINITIONS) {
    for (const example of definition.examples) {
      if (example.context) {
        lines.push(i18nText('Advisor.intentPrompt.exampleContext', { text: localized(example.context, language) }));
      }
      lines.push(i18nText('Advisor.intentPrompt.exampleInput', { text: localized(example.input, language) }));
      lines.push(i18nText('Advisor.intentPrompt.exampleOutput', { json: JSON.stringify(example.output) }));
    }
  }
  lines.push('', i18nText('Advisor.intentPrompt.historyTitle'));
  const recent = input.history.slice(-INTENT_HISTORY_TURNS);
  if (recent.length === 0) {
    lines.push(i18nText('Advisor.intentPrompt.noHistory'));
  }
  for (const turn of recent) {
    lines.push(i18nText('Advisor.intentPrompt.historyParent', { text: clipText(turn.user.content, INTENT_USER_CHARS) }));
    lines.push(i18nText('Advisor.intentPrompt.historyAdvisor', { text: clipText(turn.assistant.content, INTENT_ASSISTANT_CHARS) }));
  }
  return lines.join('\n');
}

/**
 * The parse call sees recent turns as labelled context inside its system
 * message and the current input as the only user message, so a chatty model
 * is not invited to continue the conversation instead of returning JSON.
 */
export function buildAdvisorIntentMessages(input: {
  question: string;
  today: string;
  language: AppLanguage;
  history: readonly AdvisorHistoryTurn[];
}): ParentosTextTurnMessage[] {
  return [
    { role: 'system', text: buildAdvisorIntentSystemPrompt(input) },
    { role: 'user', text: input.question },
  ];
}
