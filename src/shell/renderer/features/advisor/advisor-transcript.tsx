import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { AiMessageRow } from '../../bridge/sqlite-bridge.js';
import { AdvisorAvatar, type AdvisorAvatarState } from './advisor-mascot.js';
import { isAdvisorSourceBlock } from './advisor-boundary.js';
import type { AdvisorTurnFailureKind, AdvisorTurnPhase } from './advisor-turn.js';
import { i18nText } from '../../i18n/index.js';

export type AdvisorTranscriptFailure = {
  kind: AdvisorTurnFailureKind;
  failedGroups: readonly string[];
  /** Relevant facts that were read successfully, already worded for parents. */
  facts: ReadonlyArray<{ label: string; lines: readonly string[] }>;
  unsavedAnswer: string | null;
  /** The question when it never reached the conversation store. */
  pendingQuestion: string | null;
};

export type AdvisorTranscriptProps = {
  messages: AiMessageRow[];
  pendingQuestion: string | null;
  phase: AdvisorTurnPhase | null;
  failure: AdvisorTranscriptFailure | null;
  canRetry: boolean;
  showUnansweredRetry: boolean;
  onRetry: () => void;
  stopped: boolean;
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '');
}

function isBulletLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
}

function stripHeadingPrefix(line: string): string {
  return line.replace(/^\s{0,3}#{1,6}\s+/, '');
}

function AdvisorMessageContent({ content }: { content: string }) {
  const blocks = content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="advisor-message-content">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').map((line) => stripHeadingPrefix(line.trim())).filter(Boolean);
        if (isAdvisorSourceBlock(block)) {
          return (
            <p key={`block-${blockIndex}`} className="advisor-message-sources">
              {lines.map((line, lineIndex) => (
                <Fragment key={`${line}-${lineIndex}`}>
                  {lineIndex > 0 ? <br /> : null}
                  {line}
                </Fragment>
              ))}
            </p>
          );
        }
        if (lines.length > 0 && lines.every(isBulletLine)) {
          return (
            <ul key={`block-${blockIndex}`} className="my-2 list-disc space-y-1.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={`${line}-${lineIndex}`}>{renderInline(stripBulletPrefix(line))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`block-${blockIndex}`} className="my-2 whitespace-pre-wrap">
            {lines.map((line, lineIndex) => (
              <Fragment key={`${line}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Assistant turns sit beside the advisor mascot; only the live turn keeps it moving. */
function AdvisorAssistantRow({ avatar, children }: { avatar: AdvisorAvatarState; children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-3">
      <AdvisorAvatar state={avatar} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function AdvisorAssistantName() {
  return (
    <div className="mb-1.5 text-[12px] font-semibold text-[var(--nimi-text-muted)]">
      {i18nText('Advisor.transcript.assistant')}
    </div>
  );
}

function AdvisorUserBubble({ content, note }: { content: string; note?: string }) {
  return (
    <div className="flex w-full flex-col items-end gap-1">
      <article className="advisor-message-card advisor-message-card--user">
        <span className="sr-only">{i18nText('Advisor.transcript.user')}</span>
        <AdvisorMessageContent content={content} />
      </article>
      {note ? <span className="pr-1 text-[12px] text-[var(--nimi-text-muted)]">{note}</span> : null}
    </div>
  );
}

function AdvisorMessageCard({ message, live }: { message: AiMessageRow; live: boolean }) {
  if (message.role === 'user') {
    return <AdvisorUserBubble content={message.content} />;
  }
  return (
    <AdvisorAssistantRow avatar={live ? 'idle' : 'still'}>
      <article className="advisor-message-card advisor-message-card--assistant">
        <AdvisorAssistantName />
        <AdvisorMessageContent content={message.content} />
      </article>
    </AdvisorAssistantRow>
  );
}

/** Nothing of a reply is shown before it completes and passes the checks. */
// @nimi-authority: rule.parentos.advs.r006
function AdvisorThinkingCard({ phase }: { phase: AdvisorTurnPhase }) {
  return (
    <AdvisorAssistantRow avatar="thinking">
      <article className="advisor-message-card advisor-message-card--assistant advisor-message-card--pending">
        <div className="flex items-center gap-3">
          <span className="advisor-thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="sr-only" role="status">
            {i18nText(`Advisor.transcript.phase.${phase}`)}
          </span>
        </div>
      </article>
    </AdvisorAssistantRow>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" onClick={onRetry} className="advisor-thinking-stop">
      <RotateCcw size={12} aria-hidden="true" />
      {i18nText('Advisor.failure.retry')}
    </button>
  );
}

function AdvisorFailureCard({
  failure,
  canRetry,
  onRetry,
}: {
  failure: AdvisorTranscriptFailure;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const factGroups = failure.facts.filter((group) => group.lines.length > 0);
  return (
    <AdvisorAssistantRow avatar="still">
      <article className="advisor-message-card advisor-message-card--assistant advisor-message-card--failure" role="status">
        <AdvisorAssistantName />
        {failure.unsavedAnswer ? <AdvisorMessageContent content={failure.unsavedAnswer} /> : null}
        <p className="advisor-failure-text">
          {i18nText(`Advisor.failure.${failure.kind}`, {
            groups: failure.failedGroups.join(i18nText('Advisor.facts.partSeparator')),
          })}
        </p>
        {factGroups.length > 0 ? (
          <div className="advisor-failure-facts">
            <div className="text-[12px] font-semibold text-[var(--nimi-text-muted)]">{i18nText('Advisor.failure.verifiedFacts')}</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {factGroups.map((group) => (
                <li key={group.label}>
                  {i18nText('Advisor.failure.factLine', { label: group.label, lines: group.lines.join(i18nText('Advisor.facts.partSeparator')) })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {failure.kind === 'ai-unavailable' ? (
            <Link to="/settings/ai" className="advisor-thinking-stop">
              {i18nText('Advisor.runtimeGate.action')}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          ) : null}
          {canRetry ? <RetryButton onRetry={onRetry} /> : null}
        </div>
      </article>
    </AdvisorAssistantRow>
  );
}

export function AdvisorTranscript({
  messages,
  pendingQuestion,
  phase,
  failure,
  canRetry,
  showUnansweredRetry,
  onRetry,
  stopped,
}: AdvisorTranscriptProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingQuestion, phase, failure]);

  const liveAssistantId = phase
    ? null
    : [...messages].reverse().find((message) => message.role !== 'user')?.messageId ?? null;

  // `relative` makes the scroller the containing block of the messages'
  // absolute sr-only labels; otherwise they resolve against the shell <main>,
  // escape this clip, and make <main> scrollable so the wheel lifts the page.
  return (
    <div ref={scrollContainerRef} className="advisor-transcript relative min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 pb-10 pt-6">
        {messages.map((message) => (
          <AdvisorMessageCard
            key={message.messageId}
            message={message}
            live={message.messageId === liveAssistantId}
          />
        ))}

        {pendingQuestion ? <AdvisorUserBubble content={pendingQuestion} /> : null}
        {failure?.pendingQuestion ? (
          <AdvisorUserBubble content={failure.pendingQuestion} note={i18nText('Advisor.transcript.notSaved')} />
        ) : null}

        {phase ? <AdvisorThinkingCard phase={phase} /> : null}

        {!phase && stopped ? (
          <p role="status" className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Advisor.transcript.stopped')}</p>
        ) : null}

        {!phase && failure ? <AdvisorFailureCard failure={failure} canRetry={canRetry} onRetry={onRetry} /> : null}

        {!phase && !failure && showUnansweredRetry ? (
          <div className="flex items-center justify-end gap-2 text-[12px] text-[var(--nimi-text-muted)]">
            <span>{i18nText('Advisor.transcript.unanswered')}</span>
            {canRetry ? <RetryButton onRetry={onRetry} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
