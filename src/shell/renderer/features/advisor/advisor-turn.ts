import { getAiMessages, insertAiMessage } from '../../bridge/sqlite-bridge.js';
import type { AiMessageRow } from '../../bridge/sqlite-bridge.js';
import { ulid } from '../../bridge/ulid.js';
import type { AppLanguage } from '../../i18n/language.js';
import { logRendererEvent } from '../../infra/telemetry/renderer-log.js';
import {
  runParentosTextTurn,
  type ParentosTextTurnFailure,
  type ParentosTextTurnMessage,
} from '../settings/parentos-ai-text-turn.js';
import {
  checkAdvisorAnswer,
  renderAdvisorAnswerContent,
  stripAdvisorSourceBlocks,
  resolveAdvisorPromptStrategy,
  type AdvisorPromptStrategy,
} from './advisor-boundary.js';
import {
  advisorFactsReadFailures,
  describeAdvisorFactSources,
  formatLocalDate,
  projectAdvisorFacts,
  readAdvisorSources,
  resolveAdvisorPeriod,
  type AdvisorChildContext,
  type AdvisorFacts,
  type AdvisorRecordGroupId,
} from './advisor-context.js';
import {
  buildAdvisorIntentMessages,
  extractJsonObject,
  parseAdvisorIntent,
  readSnapshotIntent,
  resolveAdvisorFollowUp,
  resolveAdvisorIntentGroups,
  stripReasoningMarkup,
  type AdvisorHistoryTurn,
  type AdvisorIntent,
} from './advisor-intent.js';
import { selectAdvisorKnowledge, type AdvisorKnowledgeSelection } from './advisor-knowledge.js';
import {
  ADVISOR_ANSWER_BUDGET,
  ADVISOR_INTENT_BUDGET,
  ADVISOR_MAX_QUESTION_BYTES,
  buildAdvisorAnswerMessages,
  utf8Bytes,
} from './advisor-prompt.js';

export type AdvisorTurnPhase = 'understanding' | 'reading' | 'answering' | 'saving';

export type AdvisorTurnFailureKind =
  | 'ai-unavailable'
  | 'history-read'
  | 'intent'
  | 'facts-read'
  | 'runtime'
  | 'length'
  | 'content-filter'
  | 'safety'
  | 'citation'
  | 'format'
  | 'input-too-long'
  | 'user-persist'
  | 'assistant-persist';

export interface AdvisorTurnFailure {
  readonly kind: AdvisorTurnFailureKind;
  readonly reasonCode: string;
  /** Facts read successfully for this turn; failure states may list them. */
  readonly facts: AdvisorFacts | null;
  readonly failedGroupLabels: readonly string[];
  /** A checked answer whose assistant write failed; shown as unsaved. */
  readonly unsavedAnswer?: string;
}

export type AdvisorTurnOutcome =
  | { readonly status: 'answered' }
  | { readonly status: 'failed'; readonly failure: AdvisorTurnFailure; readonly userPersisted: boolean }
  | { readonly status: 'canceled'; readonly userPersisted: boolean };

export interface AdvisorTurnInput {
  readonly requestId: string;
  readonly child: AdvisorChildContext;
  readonly conversationId: string;
  readonly question: string;
  /** The persisted last user message being retried, if any. */
  readonly retryOf: AiMessageRow | null;
  readonly now: Date;
  readonly language: AppLanguage;
}

export interface AdvisorTurnControl {
  readonly signal: AbortSignal;
  /** False once the request lost its child, conversation, or request identity. */
  readonly isCurrent: () => boolean;
  readonly setPhase: (phase: AdvisorTurnPhase) => void;
  readonly onUserPersisted: (messageId: string) => void;
  /** Writes the checked answer; consultation writeback is the caller's concern. */
  readonly persistAssistant: (content: string, contextSnapshot: string) => Promise<void>;
}

/**
 * Pairs only adjacent user/assistant messages. An unanswered user message is
 * never matched with a later reply; messages from the retried user message on
 * are excluded.
 */
// @nimi-authority: rule.parentos.advs.r006
export function selectAdvisorHistory(messages: readonly AiMessageRow[], beforeMessageId: string | null): AdvisorHistoryTurn[] {
  const cutoff = beforeMessageId ? messages.findIndex((message) => message.messageId === beforeMessageId) : -1;
  const scoped = cutoff >= 0 ? messages.slice(0, cutoff) : messages;
  const turns: AdvisorHistoryTurn[] = [];
  for (let index = 0; index < scoped.length - 1; index += 1) {
    const user = scoped[index];
    const assistant = scoped[index + 1];
    if (user?.role === 'user' && assistant?.role === 'assistant') {
      turns.push({
        user: { messageId: user.messageId, content: user.content },
        // The app-rendered source block is display provenance, not something
        // the model said; leaving it in history teaches the model to copy it.
        assistant: {
          messageId: assistant.messageId,
          content: stripAdvisorSourceBlocks(assistant.content),
          intent: readSnapshotIntent(assistant.contextSnapshot),
        },
      });
      index += 1;
    }
  }
  return turns;
}

/** The last persisted user message when it has no reply yet. */
export function findUnansweredUserMessage(messages: readonly AiMessageRow[]): AiMessageRow | null {
  const last = messages.at(-1);
  return last?.role === 'user' ? last : null;
}

export function buildAdvisorContextSnapshot(input: {
  requestId: string;
  requestedAt: string;
  child: AdvisorChildContext;
  intent: AdvisorIntent;
  strategy: AdvisorPromptStrategy;
  groups: readonly AdvisorRecordGroupId[];
  /** The fact JSON exactly as the model received it. */
  factsView: object | null;
  knowledge: AdvisorKnowledgeSelection;
  historyMessageIds: readonly string[];
  historyTrimmed: boolean;
  retryOfUserMessageId: string | null;
  followUp?: boolean;
}): string {
  return JSON.stringify({
    version: 2,
    requestId: input.requestId,
    requestedAt: input.requestedAt,
    child: {
      childId: input.child.childId,
      displayName: input.child.displayName,
      gender: input.child.gender,
      birthDate: input.child.birthDate,
      ageMonths: input.child.ageMonths,
      nurtureMode: input.child.nurtureMode,
    },
    intent: input.intent,
    strategy: input.strategy,
    readGroups: input.groups,
    facts: input.factsView,
    knowledge: input.knowledge.entries.map((entry) => ({
      citeId: entry.citeId,
      assetId: entry.assetId,
      entryId: entry.entryId,
      contentVersion: entry.contentVersion,
    })),
    coverage: input.knowledge.coverage,
    historyMessageIds: input.historyMessageIds,
    historyTrimmed: input.historyTrimmed,
    ...(input.retryOfUserMessageId ? { retryOfUserMessageId: input.retryOfUserMessageId } : {}),
    ...(input.followUp ? { followUp: true } : {}),
  });
}

/**
 * Diagnostic view of a rejected parse: only the returned field shapes and id
 * strings, never free text that could echo the parent's question.
 */
function describeIntentOutput(raw: string): Record<string, unknown> {
  const parsed = extractJsonObject(stripReasoningMarkup(raw));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { json: false, chars: raw.length };
  }
  const idsOf = (value: unknown) => (Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' && /^[a-z][a-z0-9-]{0,31}$/u.test(item) ? item : typeof item))
    : typeof value);
  const record = parsed as Record<string, unknown>;
  const time = record.time && typeof record.time === 'object' ? (record.time as Record<string, unknown>).kind : record.time;
  return {
    json: true,
    keys: Object.keys(record),
    task: typeof record.task === 'string' && /^[a-z-]{1,32}$/u.test(record.task) ? record.task : typeof record.task,
    domains: idsOf(record.domains),
    groups: idsOf(record.groups),
    time: typeof time === 'string' && /^[a-z-]{1,32}$/u.test(time) ? time : typeof time,
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function failure(
  kind: AdvisorTurnFailureKind,
  reasonCode: string,
  extra: Partial<Omit<AdvisorTurnFailure, 'kind' | 'reasonCode'>> = {},
): AdvisorTurnFailure {
  return { kind, reasonCode, facts: extra.facts ?? null, failedGroupLabels: extra.failedGroupLabels ?? [], ...(extra.unsavedAnswer ? { unsavedAnswer: extra.unsavedAnswer } : {}) };
}

function answerFailureKind(textTurn: ParentosTextTurnFailure): AdvisorTurnFailureKind {
  switch (textTurn.kind) {
    case 'ai-unavailable':
      return 'ai-unavailable';
    case 'input-over-budget':
      return 'input-too-long';
    case 'length':
      return 'length';
    case 'content-filter':
      return 'content-filter';
    default:
      return 'runtime';
  }
}

function intentFailureKind(textTurn: ParentosTextTurnFailure): AdvisorTurnFailureKind {
  switch (textTurn.kind) {
    case 'ai-unavailable':
      return 'ai-unavailable';
    case 'input-over-budget':
      return 'input-too-long';
    case 'failed':
    case 'incomplete':
      return 'runtime';
    default:
      return 'intent';
  }
}

function fitIntentMessages(input: AdvisorTurnInput, history: readonly AdvisorHistoryTurn[], today: string): ParentosTextTurnMessage[] | null {
  for (const keep of [history.length, 1, 0]) {
    const messages = buildAdvisorIntentMessages({
      question: input.question,
      today,
      language: input.language,
      history: history.slice(history.length - Math.min(keep, history.length)),
    });
    const sizes = messages.map((message) => utf8Bytes(message.text));
    if (sizes.every((size) => size <= ADVISOR_INTENT_BUDGET.maxMessageBytes)
      && sizes.reduce((sum, size) => sum + size, 0) <= ADVISOR_INTENT_BUDGET.maxPromptBytes) {
      return messages;
    }
  }
  return null;
}

/**
 * One advisor turn: history → bounded intent parse → task-scoped facts and
 * knowledge → deterministic strategy → frozen snapshot → user write → answer
 * → checks → assistant write. Every async boundary re-checks ownership; after
 * the assistant write is dispatched the turn can no longer be canceled.
 */
// @nimi-authority: rule.parentos.advs.r006
export async function runAdvisorTurn(input: AdvisorTurnInput, control: AdvisorTurnControl): Promise<AdvisorTurnOutcome> {
  const { signal } = control;
  const live = () => !signal.aborted && control.isCurrent();
  const requestedAt = input.now.toISOString();
  const today = formatLocalDate(input.now);
  const timings: Record<string, number> = {};
  const started = performance.now();
  let userPersisted = input.retryOf !== null;

  const log = (message: string, details: Record<string, unknown>) => {
    logRendererEvent({ level: 'info', area: 'advisor', message, costMs: Math.round(performance.now() - started), details });
  };
  const failed = (turnFailure: AdvisorTurnFailure): AdvisorTurnOutcome => {
    log('action:advisor-turn-failed', { kind: turnFailure.kind, reasonCode: turnFailure.reasonCode, timings });
    return { status: 'failed', failure: turnFailure, userPersisted };
  };
  const canceled = (): AdvisorTurnOutcome => ({ status: 'canceled', userPersisted });

  if (utf8Bytes(input.question) > ADVISOR_MAX_QUESTION_BYTES) {
    return failed(failure('input-too-long', 'parentos-advisor-question-too-long'));
  }

  control.setPhase('understanding');
  let history: AdvisorHistoryTurn[];
  try {
    history = selectAdvisorHistory(await getAiMessages(input.conversationId), input.retryOf?.messageId ?? null);
  } catch {
    if (!live()) return canceled();
    return failed(failure('history-read', 'parentos-advisor-history-read-failed'));
  }
  if (!live()) return canceled();

  // Step 1: bounded, cancelable intent parse.
  const intentMessages = fitIntentMessages(input, history, today);
  if (!intentMessages) {
    return failed(failure('input-too-long', 'parentos-advisor-intent-over-budget'));
  }
  let intent: AdvisorIntent;
  let parsedTask: AdvisorIntent['task'];
  const intentStarted = performance.now();
  try {
    const result = await runParentosTextTurn({
      surfaceId: 'parentos.advisor',
      messages: intentMessages,
      budget: ADVISOR_INTENT_BUDGET,
      defaults: { temperature: 0, maxTokens: 512 },
      signal,
    });
    timings.intentMs = Math.round(performance.now() - intentStarted);
    if (!live()) return canceled();
    if (!result.ok) {
      return failed(failure(intentFailureKind(result.failure), result.failure.reasonCode));
    }
    const parsed = parseAdvisorIntent(result.text);
    if (!parsed.ok) {
      log('action:advisor-intent-invalid', { reason: parsed.reason, output: describeIntentOutput(result.text) });
      return failed(failure('intent', parsed.reason));
    }
    parsedTask = parsed.intent.task;
    intent = resolveAdvisorFollowUp(parsed.intent, history.at(-1)?.assistant.intent ?? null);
  } catch (error) {
    if (isAbortError(error) || !live()) return canceled();
    return failed(failure('runtime', 'parentos-advisor-intent-call-failed'));
  }

  // Step 2: read only what this task needs, against the frozen request date.
  const groups = resolveAdvisorIntentGroups(intent);
  let facts: AdvisorFacts | null = null;
  if (groups.length > 0) {
    control.setPhase('reading');
    const sources = await readAdvisorSources(input.child.childId, groups);
    if (!live()) return canceled();
    facts = projectAdvisorFacts({
      child: input.child,
      sources,
      groups,
      period: resolveAdvisorPeriod(intent.time, today, input.child.birthDate),
      today,
      requestedAt,
    });
    const readFailures = advisorFactsReadFailures(facts);
    if (readFailures.length > 0) {
      return failed(failure('facts-read', 'parentos-advisor-local-read-failed', {
        facts,
        failedGroupLabels: readFailures.map((group) => group.label),
      }));
    }
  }

  const knowledge = intent.task === 'knowledge' || intent.task === 'records'
    ? selectAdvisorKnowledge({ domains: intent.domains, ageMonths: input.child.ageMonths })
    : { entries: [], coverage: [] };
  const strategy = resolveAdvisorPromptStrategy(intent, groups, knowledge);
  const providedKnowledge: AdvisorKnowledgeSelection = strategy === 'reviewed-advice'
    ? knowledge
    : { entries: [], coverage: knowledge.coverage };

  const prompt = buildAdvisorAnswerMessages({
    strategy,
    intent,
    child: input.child,
    today,
    facts,
    knowledge: providedKnowledge,
    history,
    question: input.question,
  });
  if (!prompt.ok) {
    return failed(failure('input-too-long', 'parentos-advisor-answer-over-budget', { facts }));
  }

  // Step 3: freeze the snapshot and persist the user message once.
  const contextSnapshot = buildAdvisorContextSnapshot({
    requestId: input.requestId,
    requestedAt,
    child: input.child,
    intent,
    strategy,
    groups,
    factsView: prompt.factsView,
    knowledge: providedKnowledge,
    historyMessageIds: prompt.historyMessageIds,
    historyTrimmed: prompt.historyTrimmed,
    retryOfUserMessageId: input.retryOf?.messageId ?? null,
    followUp: parsedTask === 'follow-up',
  });
  if (!input.retryOf) {
    if (!live()) return canceled();
    const userMessageId = ulid();
    try {
      await insertAiMessage({
        messageId: userMessageId,
        conversationId: input.conversationId,
        role: 'user',
        content: input.question,
        contextSnapshot,
        now: requestedAt,
      });
    } catch {
      if (!live()) return canceled();
      return failed(failure('user-persist', 'parentos-advisor-user-persist-failed', { facts: prompt.facts }));
    }
    userPersisted = true;
    control.onUserPersisted(userMessageId);
    if (!live()) return canceled();
  }

  // Step 4: cancelable answer call; nothing is visible until it completes.
  control.setPhase('answering');
  const answerStarted = performance.now();
  let answerText: string;
  try {
    const result = await runParentosTextTurn({
      surfaceId: 'parentos.advisor',
      messages: prompt.messages,
      budget: ADVISOR_ANSWER_BUDGET,
      defaults: { temperature: intent.task === 'chat' ? 0.7 : 0.4, maxTokens: intent.detail || intent.task === 'overview' ? 3072 : 2048 },
      signal,
    });
    timings.answerMs = Math.round(performance.now() - answerStarted);
    if (!live()) return canceled();
    if (!result.ok) {
      return failed(failure(answerFailureKind(result.failure), result.failure.reasonCode, { facts: prompt.facts }));
    }
    answerText = result.text;
  } catch (error) {
    if (isAbortError(error) || !live()) return canceled();
    return failed(failure('runtime', 'parentos-advisor-answer-call-failed', { facts: prompt.facts }));
  }

  const checked = checkAdvisorAnswer(answerText, providedKnowledge.entries);
  if (!checked.ok) {
    return failed(failure(
      checked.reason === 'empty' ? 'runtime' : checked.reason,
      `parentos-advisor-answer-${checked.reason}`,
      { facts: prompt.facts },
    ));
  }
  const content = renderAdvisorAnswerContent({
    body: checked.body,
    cited: checked.cited,
    localFactSources: prompt.facts && strategy !== 'generic-chat' ? describeAdvisorFactSources(prompt.facts) : null,
  });

  // Step 5: last cancel point; once the write is dispatched it completes into
  // the original conversation only.
  if (!live()) return canceled();
  control.setPhase('saving');
  try {
    await control.persistAssistant(content, contextSnapshot);
  } catch {
    return failed(failure('assistant-persist', 'parentos-advisor-assistant-persist-failed', { facts: prompt.facts, unsavedAnswer: content }));
  }
  log('action:advisor-turn-answered', { task: intent.task, followUp: parsedTask === 'follow-up', strategy, groups: groups.length, knowledge: providedKnowledge.entries.length, timings });
  return { status: 'answered' };
}
