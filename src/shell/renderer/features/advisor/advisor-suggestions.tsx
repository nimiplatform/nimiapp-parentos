import { cn } from '@nimiplatform/kit/ui';
import type { AdvisorSuggestion } from './advisor-suggestion-engine.js';

export type AdvisorSuggestionsProps = {
  suggestions: AdvisorSuggestion[];
  disabled: boolean;
  /** Hide while the parent is typing; keeps its space so the greeting does not jump. */
  hidden?: boolean;
  onSelect: (question: string) => void;
};

export function AdvisorSuggestions({
  suggestions,
  disabled,
  hidden = false,
  onSelect,
}: AdvisorSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className={cn('mt-7 flex max-w-2xl flex-wrap justify-center gap-2 transition-opacity', hidden && 'invisible opacity-0')}>
      {suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item.question)}
          className="advisor-suggestion-chip rounded-full px-4 py-1.5 text-[14px] leading-6 text-[var(--nimi-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {item.question}
        </button>
      ))}
    </div>
  );
}

export function AdvisorSuggestionsSkeleton() {
  const widths = ['w-40', 'w-36', 'w-44'];
  return (
    <div className="mt-7 flex max-w-2xl flex-wrap justify-center gap-2" aria-hidden="true">
      {widths.map((w, i) => (
        <div key={i} className={`advisor-suggestion-skeleton h-[38px] ${w} rounded-full`} />
      ))}
    </div>
  );
}
