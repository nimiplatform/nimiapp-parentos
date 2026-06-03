import { Fragment, useEffect, useRef } from 'react';
import { Square } from 'lucide-react';
import { cn } from '@nimiplatform/kit/ui';
import type { AiMessageRow } from '../../bridge/sqlite-bridge.js';

type StreamingState = 'idle' | 'streaming';

export type AdvisorTranscriptProps = {
  messages: AiMessageRow[];
  streamingState: StreamingState;
  streamingContent: string;
  onStopGenerating: () => void;
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-[var(--nimi-status-success)]">
          {part.slice(2, -2)}
        </strong>
      );
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

function AdvisorMessageContent({ content }: { content: string }) {
  const blocks = content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="advisor-message-content">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
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

function AdvisorMessageCard({ message }: { message: AiMessageRow }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <article
        className={cn(
          'advisor-message-card',
          isUser ? 'advisor-message-card--user' : 'advisor-message-card--assistant',
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-[var(--nimi-text-muted)]">
            {isUser ? '你' : '成长顾问'}
          </span>
        </div>
        <AdvisorMessageContent content={message.content} />
      </article>
    </div>
  );
}

function AdvisorStreamingCard({ content }: { content: string }) {
  return (
    <div className="flex w-full justify-start">
      <article className="advisor-message-card advisor-message-card--assistant">
        <div className="mb-2 text-[12px] font-semibold text-[var(--nimi-text-muted)]">成长顾问</div>
        <AdvisorMessageContent content={content} />
        <span className="inline-block animate-pulse text-[var(--nimi-action-primary-bg)]">|</span>
      </article>
    </div>
  );
}

function AdvisorThinkingCard({ onStop }: { onStop: () => void }) {
  return (
    <div className="flex w-full justify-start">
      <article className="advisor-message-card advisor-message-card--assistant">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] text-[var(--nimi-text-muted)]">
            <span className="advisor-thinking-dot" />
            <span>AI 正在思考...</span>
          </div>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-8 items-center gap-1.5 parentos-radius-lg px-2.5 text-[12px] font-medium text-[var(--nimi-status-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,transparent)]"
          >
            <Square size={12} aria-hidden="true" />
            停止
          </button>
        </div>
      </article>
    </div>
  );
}

export function AdvisorTranscript({
  messages,
  streamingState,
  streamingContent,
  onStopGenerating,
}: AdvisorTranscriptProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingContent]);

  return (
    <div ref={scrollContainerRef} className="advisor-transcript min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 pb-5 pt-6">
        {messages.map((message) => (
          <AdvisorMessageCard key={message.messageId} message={message} />
        ))}

        {streamingState === 'streaming' && streamingContent ? (
          <AdvisorStreamingCard content={streamingContent} />
        ) : null}

        {streamingState === 'streaming' && !streamingContent ? (
          <AdvisorThinkingCard onStop={onStopGenerating} />
        ) : null}
      </div>
    </div>
  );
}
