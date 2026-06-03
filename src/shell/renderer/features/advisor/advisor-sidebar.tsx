import { Plus } from 'lucide-react';
import { ScrollArea, cn } from '@nimiplatform/kit/ui';
import type { ConversationRow } from '../../bridge/sqlite-bridge.js';
import { formatRelativeTimeCn } from './advisor-theme.js';

export type AdvisorSidebarProps = {
  conversations: ConversationRow[];
  activeConvId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
};

export function AdvisorSidebar({
  conversations,
  activeConvId,
  onSelectConversation,
  onNewConversation,
}: AdvisorSidebarProps) {
  return (
    <aside className="advisor-sidebar-panel mt-4 mb-5 flex w-64 shrink-0 flex-col p-3">
      <button
        type="button"
        onClick={onNewConversation}
        className="mb-3 flex min-h-10 w-full items-center justify-center gap-2 parentos-radius-lg border border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_86%,var(--nimi-surface-panel))] px-3 text-[14px] font-semibold text-[var(--nimi-text-primary)] transition-all hover:border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_30%,var(--nimi-border-subtle))] hover:shadow-[var(--nimi-elevation-base)]"
      >
        <Plus size={15} aria-hidden="true" />
        新对话
      </button>

      <ScrollArea className="min-h-0 flex-1" contentClassName="pr-1">
        <div className="flex flex-col gap-1">
          {conversations.map((conv) => {
            const active = conv.conversationId === activeConvId;
            return (
              <button
                key={conv.conversationId}
                type="button"
                onClick={() => onSelectConversation(conv.conversationId)}
                className={cn(
                  'flex w-full flex-col gap-1 parentos-radius-lg px-3 py-3 text-left transition-all duration-[var(--nimi-motion-fast)] hover:bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_5%,transparent)]',
                  active && 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_9%,var(--nimi-surface-card))] shadow-[var(--nimi-elevation-base)]',
                )}
              >
                <p
                  className={cn(
                    'w-full truncate text-[14px] text-[var(--nimi-text-secondary)]',
                    active && 'font-semibold text-[var(--nimi-text-primary)]',
                  )}
                >
                  {conv.title ?? '新对话'}
                </p>
                <span className="text-[11px] text-[var(--nimi-text-muted)]">
                  {formatRelativeTimeCn(conv.lastMessageAt)}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
