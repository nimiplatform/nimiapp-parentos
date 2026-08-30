import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Send, Square } from 'lucide-react';
import { Button, cn } from '@nimiplatform/kit/ui';
import { i18nText } from '../../i18n/index.js';


const MIN_HEIGHT = 48;
const MAX_HEIGHT = 128;

export type AdvisorComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
  recordRoute: string | null;
};

export function AdvisorComposer({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isStreaming,
  recordRoute,
}: AdvisorComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    el.style.height = `${h}px`;
    // Only show scrollbar when content actually exceeds max height
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="advisor-composer-shell shrink-0 px-6 pb-5 pt-3">
      <div className="mx-auto max-w-3xl">
        {recordRoute && (
          <div className="mb-2">
            <Button asChild tone="secondary" size="sm">
              <Link to={recordRoute} className="inline-flex items-center gap-1.5">
                <Plus size={14} aria-hidden="true" />
                {i18nText('Advisor.composer.recordData')}
              </Link>
            </Button>
          </div>
        )}

        <div className="advisor-composer-box">
          <div className="flex items-end gap-2 p-2">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder={i18nText('Advisor.composer.placeholder')}
              disabled={disabled}
              rows={1}
              className="advisor-composer-textarea min-h-[48px] max-h-32 min-w-0 flex-1 resize-none overflow-y-hidden border-0 bg-transparent px-3 py-3 text-[14px] leading-[1.6] text-[var(--nimi-text-primary)] outline-none placeholder:text-[var(--nimi-text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={isStreaming ? onStop : onSend}
              disabled={!isStreaming && !value.trim()}
              className={cn(
                'mb-1 flex h-9 w-9 shrink-0 items-center justify-center parentos-radius-10 transition-all',
                isStreaming
                  ? 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-danger)] hover:bg-[color-mix(in_srgb,var(--nimi-status-danger)_18%,var(--nimi-surface-card))]'
                  : 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)] shadow-[var(--nimi-elevation-base)] hover:shadow-[var(--nimi-elevation-raised)] disabled:cursor-not-allowed disabled:bg-[color-mix(in_srgb,var(--nimi-text-muted)_18%,var(--nimi-surface-card))] disabled:text-[var(--nimi-text-muted)] disabled:shadow-none',
              )}
              aria-label={isStreaming ? i18nText('Advisor.composer.stop') : i18nText('Advisor.composer.send')}
            >
              {isStreaming ? <Square size={14} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
