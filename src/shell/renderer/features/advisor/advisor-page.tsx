import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAppStore, computeAgeMonths, computeAgeMonthsAt, formatAge, type ChildProfile } from '../../app-shell/app-store.js';
import {
  createConversation,
  getAiMessages,
  getConversations,
  insertAiMessage,
  insertConsultationAiMessage,
  getReminderStates,
} from '../../bridge/sqlite-bridge.js';
import type { AiMessageRow, ConversationRow } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import {
  hasParentosAIConfigCapability,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
} from '../settings/parentos-ai-config.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { logRendererEvent } from '../../infra/telemetry/renderer-log.js';
import { i18n, i18nText } from '../../i18n/index.js';
import { resolveAppLanguage } from '../../i18n/language.js';
import { AdvisorSidebar } from './advisor-sidebar.js';
import { AdvisorTranscript, type AdvisorTranscriptFailure } from './advisor-transcript.js';
import { AdvisorComposer } from './advisor-composer.js';
import { AdvisorEmptyState } from './advisor-empty-state.js';
import { AdvisorJournalContext, type JournalEntryAdvisorContext } from './advisor-journal-context.js';
import { AdvisorSuggestions, AdvisorSuggestionsSkeleton } from './advisor-suggestions.js';
import { generateAdvisorSuggestions, type AdvisorSuggestion } from './advisor-suggestion-engine.js';
import { AdvisorOpeningCard } from './advisor-opening-card.js';
import { AdvisorRuntimeGateNotice } from './advisor-runtime-gate.js';
import {
  ADVISOR_RECORD_GROUPS,
  advisorFactsReadFailures,
  formatLocalDate,
  projectAdvisorFacts,
  readAdvisorSources,
  resolveAdvisorPeriod,
  summarizeAdvisorFacts,
  type AdvisorChildContext,
  type AdvisorFacts,
} from './advisor-context.js';
import {
  findUnansweredUserMessage,
  runAdvisorTurn,
  type AdvisorTurnFailure,
  type AdvisorTurnPhase,
} from './advisor-turn.js';

type AdvisorLocationState = {
  journalEntryContext?: JournalEntryAdvisorContext;
} | null;

type ReminderConsultationAnchor = {
  childId: string;
  ruleId: string;
  repeatIndex: number;
};

/** The one in-flight send of this page, bound to its child and conversation. */
type TurnRequest = {
  readonly requestId: string;
  readonly childId: string;
  readonly conversationId: string;
  readonly abort: AbortController;
};

type TurnView = {
  readonly requestId: string;
  readonly conversationId: string;
  readonly phase: AdvisorTurnPhase;
  /** Shown as the parent's bubble until the user message is persisted. */
  readonly pendingQuestion: string | null;
};

type TurnFailureView = {
  readonly conversationId: string;
  readonly question: string;
  readonly userPersisted: boolean;
  readonly failure: AdvisorTurnFailure;
};

function padDateSegment(value: number) {
  return String(value).padStart(2, '0');
}

function parseAdvisorDisplayDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAdvisorConversationDate(value: string) {
  const date = parseAdvisorDisplayDate(value);
  if (!date) {
    return value.split('T')[0] ?? value;
  }
  return [
    String(date.getFullYear()),
    padDateSegment(date.getMonth() + 1),
    padDateSegment(date.getDate()),
  ].join('-');
}

function formatAdvisorContextDateTime(value: string) {
  const date = parseAdvisorDisplayDate(value);
  if (!date) {
    return value.replace('T', ' ').slice(0, 16);
  }
  return [
    formatAdvisorConversationDate(value),
    `${padDateSegment(date.getHours())}:${padDateSegment(date.getMinutes())}`,
  ].join(' ');
}

/** Opening question for a conversation started from a reminder or record page. */
function buildTopicQuestion(topic: string, desc: string) {
  const detail = desc.replace(/\\n/g, '\n').trim();
  return detail
    ? i18nText('Advisor.entry.topicQuestionWithDetail', { topic, detail })
    : i18nText('Advisor.entry.topicQuestion', { topic });
}

function buildJournalEntryOpening(context: JournalEntryAdvisorContext, starterQuestion: string) {
  const lines = [
    i18nText('Advisor.journalOpening.intro'),
    i18nText('Advisor.journalOpening.recordedAt', { value: formatAdvisorContextDateTime(context.recordedAt) }),
  ];
  if (context.dimensionName) {
    lines.push(i18nText('Advisor.journalOpening.dimension', { value: context.dimensionName }));
  }
  if (context.recorderName) {
    lines.push(i18nText('Advisor.journalOpening.recorder', { value: context.recorderName }));
  }
  if (context.tags.length > 0) {
    lines.push(i18nText('Advisor.journalOpening.tags', { value: context.tags.join(i18nText('Advisor.journalOpening.tagSeparator')) }));
  }
  lines.push(i18nText('Advisor.journalOpening.content', {
    value: context.textContent?.trim() || i18nText('Advisor.journalOpening.noText'),
  }));
  lines.push('', starterQuestion);
  return lines.join('\n');
}

function toAdvisorChildContext(child: ChildProfile, atIso: string): AdvisorChildContext {
  return {
    childId: child.childId,
    displayName: child.displayName,
    gender: child.gender,
    birthDate: child.birthDate,
    nurtureMode: child.nurtureMode,
    ageMonths: computeAgeMonthsAt(child.birthDate, atIso),
    recorderProfiles: child.recorderProfiles,
  };
}

export default function AdvisorPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((item) => item.childId === activeChildId);
  const location = useLocation();
  const journalEntryContext = (location.state as AdvisorLocationState | undefined)?.journalEntryContext ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageRow[]>([]);
  const [input, setInput] = useState('');
  const [stoppedConversationId, setStoppedConversationId] = useState<string | null>(null);
  const [turn, setTurn] = useState<TurnView | null>(null);
  const [turnFailure, setTurnFailure] = useState<TurnFailureView | null>(null);
  const [runtimeAvailable, setRuntimeAvailable] = useState<boolean | null>(null);
  const [recordRoute, setRecordRoute] = useState<string | null>(null);
  const topicHandledRef = useRef<string | null>(null);
  const journalHandledRef = useRef<string | null>(null);
  const [pendingJournalContext, setPendingJournalContext] = useState<JournalEntryAdvisorContext | null>(null);
  const [suggestions, setSuggestions] = useState<AdvisorSuggestion[]>([]);
  const [suggestionsState, setSuggestionsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [openingFacts, setOpeningFacts] = useState<AdvisorFacts | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const snapshotConvRef = useRef<string | null>(null);
  const suggestionConvRef = useRef<string | null>(null);
  const pendingReminderConsultationAnchorRef = useRef<ReminderConsultationAnchor | null>(null);

  // rule.parentos.advs.r006: request ownership. A turn stays current only while
  // it is the page's turn and its child and conversation are still on screen.
  const turnRef = useRef<TurnRequest | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const activeChildIdRef = useRef<string | null>(activeChildId);
  activeConvIdRef.current = activeConvId;
  activeChildIdRef.current = activeChildId;

  // PO-REMI-007 consultation writeback. Tracks which conversations have already
  // recorded a consulted reminder so subsequent assistant replies on the same
  // conversation remain no-ops (first write wins). The Rust layer also enforces
  // idempotency; this ref just avoids unnecessary bridge calls.
  const consultationWrittenRef = useRef<Set<string>>(new Set());
  const consultationAnchorByConversationRef = useRef<Map<string, ReminderConsultationAnchor>>(new Map());

  // Switching conversation or child supersedes the turn: it loses ownership at
  // once and may no longer touch the screen.
  const cancelActiveTurn = useCallback(() => {
    setStoppedConversationId(null);
    const request = turnRef.current;
    if (!request) return;
    turnRef.current = null;
    request.abort.abort();
    setTurn(null);
  }, []);

  // Stop keeps ownership until the turn unwinds, so an unsent question can go
  // back into the composer. Once the assistant write is dispatched there is
  // nothing left to stop.
  const stopActiveTurn = useCallback(() => {
    turnRef.current?.abort.abort();
  }, []);

  const readReminderConsultationAnchorFromSearch = (): ReminderConsultationAnchor | null => {
    if (!child) {
      return null;
    }
    const reminderRuleId = searchParams.get('reminderRuleId')?.trim();
    if (!reminderRuleId) {
      return null;
    }
    return {
      childId: child.childId,
      ruleId: reminderRuleId,
      repeatIndex: Number(searchParams.get('repeatIndex') ?? '0') || 0,
    };
  };

  // @nimi-authority: rule.parentos.advs.r006a
  const saveAssistantMessage = async (conversationId: string, content: string, contextSnapshot: string) => {
    const now = isoNow();
    const anchor = consultationAnchorByConversationRef.current.get(conversationId);
    if (anchor && !consultationWrittenRef.current.has(conversationId)) {
      // The consult mark needs the reminder's own row and is never fabricated
      // (PO-REMI-012); without one the checked answer is still saved and only
      // the mark is withheld (PO-ADVS-006a orders the message first).
      const rows = await getReminderStates(anchor.childId);
      if (rows.some((row) => row.ruleId === anchor.ruleId && row.repeatIndex === anchor.repeatIndex)) {
        await insertConsultationAiMessage({
          messageId: ulid(),
          conversationId,
          childId: anchor.childId,
          ruleId: anchor.ruleId,
          repeatIndex: anchor.repeatIndex,
          content,
          contextSnapshot,
          now,
        });
        consultationWrittenRef.current.add(conversationId);
        return;
      }
      logRendererEvent({ level: 'warn', area: 'advisor', message: 'action:reminder-consultation-row-missing', details: { ruleId: anchor.ruleId, repeatIndex: anchor.repeatIndex } });
      await insertAiMessage({ messageId: ulid(), conversationId, role: 'assistant', content, contextSnapshot, now });
      consultationWrittenRef.current.add(conversationId);
      return;
    }
    await insertAiMessage({ messageId: ulid(), conversationId, role: 'assistant', content, contextSnapshot, now });
  };

  // @nimi-authority: rule.parentos.advs.r006
  const startTurn = async (params: {
    conversationId: string;
    question: string;
    retryOf: AiMessageRow | null;
  }) => {
    if (!child || turnRef.current) return;
    const now = new Date();
    const request: TurnRequest = {
      requestId: ulid(),
      childId: child.childId,
      conversationId: params.conversationId,
      abort: new AbortController(),
    };
    turnRef.current = request;
    const isCurrent = () => turnRef.current === request
      && activeConvIdRef.current === request.conversationId
      && activeChildIdRef.current === request.childId;
    // Writes land in their original conversation; only that conversation, while
    // still on screen for the same child, may show them.
    const refreshMessages = async () => {
      const rows = await getAiMessages(request.conversationId);
      if (activeConvIdRef.current === request.conversationId && activeChildIdRef.current === request.childId) {
        setMessages(rows);
      }
    };

    setStoppedConversationId(null);
    setTurnFailure(null);
    setTurn({
      requestId: request.requestId,
      conversationId: request.conversationId,
      phase: 'understanding',
      pendingQuestion: params.retryOf ? null : params.question,
    });

    try {
      const outcome = await runAdvisorTurn({
        requestId: request.requestId,
        child: toAdvisorChildContext(child, now.toISOString()),
        conversationId: request.conversationId,
        question: params.question,
        retryOf: params.retryOf,
        now,
        language: resolveAppLanguage(i18n.language),
      }, {
        signal: request.abort.signal,
        isCurrent,
        setPhase: (phase) => {
          if (!isCurrent()) return;
          setTurn((current) => (current?.requestId === request.requestId ? { ...current, phase } : current));
        },
        onUserPersisted: () => {
          if (!isCurrent()) return;
          setTurn((current) => (current?.requestId === request.requestId ? { ...current, pendingQuestion: null } : current));
          setConversations((current) => current.map((conversation) => (
            conversation.conversationId === request.conversationId && conversation.title === null
              ? { ...conversation, title: params.question, lastMessageAt: now.toISOString() }
              : conversation
          )));
          refreshMessages().catch(catchLog('advisor', 'action:reload-ai-messages-failed'));
        },
        persistAssistant: async (content, contextSnapshot) => {
          await saveAssistantMessage(request.conversationId, content, contextSnapshot);
          // The write belongs to its original conversation; only a still-visible
          // conversation refreshes.
          if (isCurrent()) {
            await refreshMessages().catch(catchLog('advisor', 'action:reload-ai-messages-failed'));
          }
        },
      });
      if (!isCurrent()) return;
      if (outcome.status === 'failed') {
        catchLog('advisor', `action:advisor-turn-${outcome.failure.kind}`, 'warn')(new Error(outcome.failure.reasonCode));
        setTurnFailure({
          conversationId: request.conversationId,
          question: params.question,
          userPersisted: outcome.userPersisted,
          failure: outcome.failure,
        });
        if (outcome.userPersisted) {
          await refreshMessages().catch(catchLog('advisor', 'action:reload-ai-messages-failed'));
        }
      } else if (outcome.status === 'canceled') {
        setStoppedConversationId(request.conversationId);
        if (!outcome.userPersisted && !params.retryOf) {
          // Nothing was written: hand the question back to the composer.
          setInput((current) => current || params.question);
        }
      }
    } finally {
      if (turnRef.current === request) {
        turnRef.current = null;
        setTurn(null);
      }
    }
  };

  const startConversationWithQuestion = async (params: {
    title: string | null;
    question: string;
    reminderConsultationAnchor?: ReminderConsultationAnchor;
  }) => {
    if (!child || turnRef.current) {
      return;
    }
    const convId = ulid();
    await createConversation({ conversationId: convId, childId: child.childId, title: params.title, now: isoNow() });
    const reminderConsultationAnchor = params.reminderConsultationAnchor
      ?? pendingReminderConsultationAnchorRef.current
      ?? readReminderConsultationAnchorFromSearch()
      ?? undefined;
    if (reminderConsultationAnchor) {
      consultationAnchorByConversationRef.current.set(convId, reminderConsultationAnchor);
      pendingReminderConsultationAnchorRef.current = null;
    }
    activeConvIdRef.current = convId;
    setActiveConvId(convId);
    setMessages([]);
    setTurnFailure(null);
    setConversations(await getConversations(child.childId));
    await startTurn({ conversationId: convId, question: params.question, retryOf: null });
  };

  // A different child means a different family record: nothing of the old
  // child's conversation or in-flight request may stay on screen.
  useEffect(() => {
    cancelActiveTurn();
    activeConvIdRef.current = null;
    setActiveConvId(null);
    setMessages([]);
    setTurnFailure(null);
    setOpeningFacts(null);
    setSuggestions([]);
    setSuggestionsState('idle');
    snapshotConvRef.current = null;
    suggestionConvRef.current = null;
    if (!activeChildId) {
      setConversations([]);
      return;
    }
    let active = true;
    getConversations(activeChildId)
      .then((rows) => { if (active) setConversations(rows); })
      .catch(catchLog('advisor', 'action:load-conversations-failed'));
    return () => { active = false; };
  }, [activeChildId, cancelActiveTurn]);

  useEffect(() => () => {
    turnRef.current?.abort.abort();
    turnRef.current = null;
  }, []);

  useEffect(() => {
    const stopWatching = window.parentOSHost?.onSessionInvalidated(() => cancelActiveTurn());
    return () => { stopWatching?.(); };
  }, [cancelActiveTurn]);

  useEffect(() => {
    if (!activeConvId) return;
    let active = true;
    getAiMessages(activeConvId)
      .then((rows) => { if (active && activeConvIdRef.current === activeConvId) setMessages(rows); })
      .catch(catchLog('advisor', 'action:load-ai-messages-failed'));
    return () => { active = false; };
  }, [activeConvId]);

  useEffect(() => {
    async function checkRuntime() {
      setRuntimeAvailable(await hasParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT));
    }
    void checkRuntime();
  }, []);

  // ── Handle incoming topic from reminder panel ─────────────
  useEffect(() => {
    // rule.parentos.advs.r003: without a configured text model the advisor must
    // not start a Q&A turn, so reminder/topic openings wait until the runtime
    // check succeeds.
    if (runtimeAvailable !== true) return;
    const topic = searchParams.get('topic');
    const desc = searchParams.get('desc') ?? '';
    const record = searchParams.get('record');
    const reminderRuleId = searchParams.get('reminderRuleId')?.trim() || null;
    const repeatIndex = Number(searchParams.get('repeatIndex') ?? '0') || 0;
    if (reminderRuleId && child) {
      pendingReminderConsultationAnchorRef.current = { childId: child.childId, ruleId: reminderRuleId, repeatIndex };
      if (!topic) {
        setSearchParams({}, { replace: true });
      }
    }
    if (!topic || !child || topicHandledRef.current === topic) return;

    topicHandledRef.current = topic;
    if (record) setRecordRoute(record);
    setSearchParams({}, { replace: true });

    startConversationWithQuestion({
      title: topic,
      question: buildTopicQuestion(topic, desc),
      reminderConsultationAnchor: reminderRuleId
        ? { childId: child.childId, ruleId: reminderRuleId, repeatIndex }
        : undefined,
    }).catch(catchLog('advisor', 'action:start-topic-conversation-failed'));
  }, [searchParams, child, runtimeAvailable]);

  useEffect(() => {
    if (!child || !journalEntryContext || journalHandledRef.current === journalEntryContext.entryId) {
      return;
    }
    journalHandledRef.current = journalEntryContext.entryId;
    setRecordRoute(null);
    setPendingJournalContext(journalEntryContext);
  }, [child, journalEntryContext]);

  // Opening context for an empty conversation: the same task-scoped reader,
  // over every record group for the default window.
  useEffect(() => {
    if (!child || !activeConvId) return;
    if (messages.length > 0) return;
    if (snapshotConvRef.current === activeConvId) return;
    snapshotConvRef.current = activeConvId;

    suggestionsAbortRef.current?.abort();
    setSuggestions([]);
    setOpeningFacts(null);
    setSuggestionsState('idle');
    suggestionConvRef.current = null;

    const convId = activeConvId;
    const nowIso = new Date().toISOString();
    const today = formatLocalDate(new Date(nowIso));
    const childContext = toAdvisorChildContext(child, nowIso);
    (async () => {
      const sources = await readAdvisorSources(child.childId, ADVISOR_RECORD_GROUPS);
      if (activeConvIdRef.current !== convId || activeChildIdRef.current !== child.childId) return;
      const facts = projectAdvisorFacts({
        child: childContext,
        sources,
        groups: ADVISOR_RECORD_GROUPS,
        period: resolveAdvisorPeriod({ kind: 'default' }, today, child.birthDate),
        today,
        requestedAt: nowIso,
      });
      setOpeningFacts(facts);
      if (advisorFactsReadFailures(facts).length > 0) {
        setSuggestionsState('error');
      }
    })().catch((err) => {
      catchLog('advisor', 'action:build-opening-facts-failed')(err);
      setSuggestionsState('error');
    });
  }, [child, activeConvId, messages.length]);

  useEffect(() => {
    if (!activeConvId || !openingFacts || !child) return;
    if (messages.length > 0) return;
    if (advisorFactsReadFailures(openingFacts).length > 0) return;
    if (runtimeAvailable !== true) {
      setSuggestionsState('idle');
      return;
    }
    if (suggestionConvRef.current === activeConvId) return;
    suggestionConvRef.current = activeConvId;

    suggestionsAbortRef.current?.abort();
    const ac = new AbortController();
    suggestionsAbortRef.current = ac;
    setSuggestions([]);
    setSuggestionsState('loading');

    (async () => {
      try {
        const items = await generateAdvisorSuggestions(openingFacts, {
          ageMonths: computeAgeMonths(child.birthDate),
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        setSuggestions(items);
        setSuggestionsState('ready');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (ac.signal.aborted) return;
        catchLog('advisor', 'action:generate-suggestions-failed')(err);
        setSuggestions([]);
        setSuggestionsState('error');
      }
    })();

    return () => {
      ac.abort();
    };
  }, [activeConvId, openingFacts, runtimeAvailable, messages.length, child]);

  if (!child) return <div className="p-8 text-slate-400">{i18nText('Advisor.page.noActiveChild')}</div>;

  const ageMonths = computeAgeMonths(child.birthDate);
  const turnForView = turn && turn.conversationId === activeConvId ? turn : null;
  const failureForView = turnFailure && turnFailure.conversationId === activeConvId ? turnFailure : null;
  const busy = turn !== null;
  const unanswered = !busy ? findUnansweredUserMessage(messages) : null;

  const selectConversation = (conversationId: string) => {
    if (conversationId === activeConvId) return;
    cancelActiveTurn();
    activeConvIdRef.current = conversationId;
    setActiveConvId(conversationId);
    setMessages([]);
    setTurnFailure(null);
    setRecordRoute(null);
  };

  const handleNewConversation = async () => {
    cancelActiveTurn();
    const convId = ulid();
    try {
      await createConversation({ conversationId: convId, childId: child.childId, title: null, now: isoNow() });
      const reminderConsultationAnchor = pendingReminderConsultationAnchorRef.current
        ?? readReminderConsultationAnchorFromSearch();
      if (reminderConsultationAnchor) {
        consultationAnchorByConversationRef.current.set(convId, reminderConsultationAnchor);
        pendingReminderConsultationAnchorRef.current = null;
        setSearchParams({}, { replace: true });
      }
      activeConvIdRef.current = convId;
      setActiveConvId(convId);
      setMessages([]);
      setTurnFailure(null);
      setRecordRoute(null);
      setConversations(await getConversations(child.childId));
    } catch (err) {
      catchLog('advisor', 'action:create-conversation-failed')(err);
    }
  };

  const handleStartJournalConversation = async (starterQuestion: string) => {
    if (!pendingJournalContext || busy) return;
    const question = buildJournalEntryOpening(pendingJournalContext, starterQuestion);
    const title = i18nText('Advisor.journalOpening.title', { date: formatAdvisorConversationDate(pendingJournalContext.recordedAt) });
    setPendingJournalContext(null);
    try {
      await startConversationWithQuestion({ title, question });
    } catch (err) {
      catchLog('advisor', 'action:start-journal-conversation-failed')(err);
    }
  };

  const askQuestion = async (question: string) => {
    if (busy || runtimeAvailable !== true) return;
    if (pendingJournalContext && !activeConvId) {
      await handleStartJournalConversation(question);
      return;
    }
    if (!activeConvId) return;
    await startTurn({ conversationId: activeConvId, question, retryOf: null });
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || busy || runtimeAvailable !== true) return;
    setInput('');
    await askQuestion(question);
  };

  const handleRetry = async () => {
    if (busy || !activeConvId || runtimeAvailable !== true) return;
    if (unanswered) {
      await startTurn({ conversationId: activeConvId, question: unanswered.content, retryOf: unanswered });
      return;
    }
    if (failureForView && !failureForView.userPersisted) {
      await startTurn({ conversationId: activeConvId, question: failureForView.question, retryOf: null });
    }
  };

  const transcriptFailure: AdvisorTranscriptFailure | null = failureForView
    ? {
      kind: failureForView.failure.kind,
      failedGroups: failureForView.failure.failedGroupLabels,
      facts: failureForView.failure.facts ? summarizeAdvisorFacts(failureForView.failure.facts) : [],
      unsavedAnswer: failureForView.failure.unsavedAnswer ?? null,
      pendingQuestion: failureForView.userPersisted ? null : failureForView.question,
    }
    : null;
  const canRetry = !busy && runtimeAvailable === true
    && (Boolean(unanswered) || Boolean(failureForView && !failureForView.userPersisted && failureForView.failure.kind !== 'input-too-long'));

  return (
    <div className="advisor-page-shell flex h-full min-h-0 gap-5 px-5 pb-3 pt-4">
      <AdvisorSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelectConversation={selectConversation}
        onNewConversation={handleNewConversation}
      />

      <div className="advisor-main-panel flex min-w-0 flex-1 flex-col overflow-hidden">
        {!activeConvId && pendingJournalContext ? (
          <AdvisorJournalContext
            context={pendingJournalContext}
            runtimeAvailable={runtimeAvailable}
            onSelectStarter={handleStartJournalConversation}
          />
        ) : !activeConvId ? (
          <AdvisorEmptyState
            childName={child.displayName}
            runtimeAvailable={runtimeAvailable}
            onNewConversation={handleNewConversation}
          />
        ) : (
          <>
            {messages.length === 0 && !turnForView && !transcriptFailure && stoppedConversationId !== activeConvId ? (
              <AdvisorOpeningCard
                childName={child.displayName}
                ageLabel={formatAge(ageMonths)}
                facts={openingFacts}
              >
                {suggestionsState === 'loading' ? (
                  <AdvisorSuggestionsSkeleton />
                ) : suggestionsState === 'ready' && suggestions.length > 0 ? (
                  <AdvisorSuggestions
                    suggestions={suggestions}
                    disabled={busy}
                    hidden={Boolean(input.trim())}
                    onSelect={(question) => { void askQuestion(question); }}
                  />
                ) : null}
              </AdvisorOpeningCard>
            ) : (
              <AdvisorTranscript
                messages={messages}
                pendingQuestion={turnForView?.pendingQuestion ?? null}
                phase={turnForView?.phase ?? null}
                failure={transcriptFailure}
                canRetry={canRetry}
                showUnansweredRetry={Boolean(unanswered) && !transcriptFailure}
                onRetry={() => { void handleRetry(); }}
                stopped={stoppedConversationId === activeConvId}
              />
            )}
            {runtimeAvailable === false ? (
              <div className="shrink-0 px-6 pb-5 pt-3">
                <div className="mx-auto max-w-3xl">
                  <AdvisorRuntimeGateNotice />
                </div>
              </div>
            ) : (
            <AdvisorComposer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onStop={stopActiveTurn}
              disabled={busy}
              isStreaming={Boolean(turnForView) && turnForView?.phase !== 'saving'}
              recordRoute={recordRoute}
            />
            )}
          </>
        )}
      </div>
    </div>
  );
}
