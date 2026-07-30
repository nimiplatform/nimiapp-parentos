/**
 * ReminderExplainDrawer — per-kind reminder disclosure surface.
 *
 * Authoritative contract: rule.parentos.remi.r011
 *
 * Consumed by both the timeline panel (W5b) and the /reminders page (W5c).
 * Props are fully controlled: the parent owns open/close state and dispatches
 * actions back through `onAction`. The drawer does not call the engine
 * directly — it emits UI-level action verbs (ReminderActionType from
 * reminder-actions.ts) that the parent forwards to `applyReminderAction`.
 *
 * Footer dispatch per user confirmation: terminal-ish progression states
 * (acknowledged / practicing / consulted) still show a forward action rather
 * than disabled history text, because guide/practice/consult items are
 * intentionally cyclic or invite deeper engagement.
 */

import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { ReminderKind } from '../../knowledge-base/index.js';
import type { ActiveReminder } from '../../engine/reminder-engine.js';
import {
  canMarkNotApplicable,
  defaultSnoozeUntil,
  type ReminderActionType,
} from '../../engine/reminder-actions.js';
import { currentProgressionState } from '../../engine/reminder-progression.js';
import { getLocalToday } from '../../engine/reminder-engine.js';
import { domainDetailRoute } from './reminder-detail-route.js';
import { i18nText } from '../../i18n/index.js';


const DRAWER_WIDTH = 440;

export interface ReminderExplainDrawerProps {
  reminder: ActiveReminder | null;
  onClose: () => void;
  onAction: (reminder: ActiveReminder, action: ReminderActionType, extra?: string | null) => void;
  onOpenCapture: (reminder: ActiveReminder) => void;
}

interface FooterPrimary {
  variant: 'action' | 'link' | 'capture';
  label: string;
  action?: ReminderActionType;
  to?: string;
}

/**
 * Per-kind / per-progression footer action resolution per PO-REMI-005 and the
 * user-approved UI dispatch table.
 */
function resolveFooterPrimary(reminder: ActiveReminder): FooterPrimary[] {
  const kind: ReminderKind = reminder.kind;
  const progression = currentProgressionState({
    kind,
    acknowledgedAt: reminder.state?.acknowledgedAt ?? null,
    reflectedAt: reminder.state?.reflectedAt ?? null,
    practiceStartedAt: reminder.state?.practiceStartedAt ?? null,
    practiceLastAt: reminder.state?.practiceLastAt ?? null,
    practiceCount: reminder.state?.practiceCount ?? 0,
    practiceHabituatedAt: reminder.state?.practiceHabituatedAt ?? null,
    consultedAt: reminder.state?.consultedAt ?? null,
    consultationConversationId: reminder.state?.consultationConversationId ?? null,
    completedAt: reminder.state?.completedAt ?? null,
    notApplicable: reminder.state?.notApplicable ?? 0,
  });
  const ruleRoute = `?reminderRuleId=${encodeURIComponent(reminder.rule.ruleId)}&repeatIndex=${reminder.repeatIndex}`;

  if (kind === 'task') {
    if (progression === 'completed') {
      return [{ variant: 'action', label: i18nText('Reminders.action.restore'), action: 'restore' }];
    }
    switch (reminder.rule.actionType) {
      case 'go_hospital':
        if (reminder.rule.domain === 'vaccine') {
          return [
            { variant: 'link', label: i18nText('Reminders.action.recordVaccine'), to: domainDetailRoute(reminder.rule.domain) },
            { variant: 'action', label: i18nText('Reminders.action.markComplete'), action: 'complete' },
          ];
        }
        return [
          { variant: 'link', label: i18nText('Reminders.action.viewProfile'), to: domainDetailRoute(reminder.rule.domain) },
          { variant: 'action', label: i18nText('Reminders.action.markComplete'), action: 'complete' },
        ];
      case 'record_data':
        return [
          { variant: 'capture', label: i18nText('Reminders.action.goRecord') },
        ];
      default:
        return [{ variant: 'action', label: i18nText('Reminders.action.markComplete'), action: 'complete' }];
    }
  }

  if (kind === 'guide') {
    if (progression === 'reflected') {
      return [{ variant: 'action', label: i18nText('Reminders.action.restore'), action: 'restore' }];
    }
    if (progression === 'acknowledged') {
      return [{ variant: 'action', label: i18nText('Reminders.action.reflect'), action: 'reflect' }];
    }
    return [{ variant: 'action', label: i18nText('Reminders.action.acknowledged'), action: 'acknowledge' }];
  }

  if (kind === 'practice') {
    if (progression === 'habituated') {
      return [{ variant: 'action', label: i18nText('Reminders.action.restore'), action: 'restore' }];
    }
    if (progression === 'practicing') {
      return [
        { variant: 'action', label: i18nText('Reminders.action.logPractice'), action: 'log_practice' },
        { variant: 'action', label: i18nText('Reminders.action.markHabituated'), action: 'mark_habituated' },
      ];
    }
    return [{ variant: 'action', label: i18nText('Reminders.action.startPractice'), action: 'start_practicing' }];
  }

  // consult
  if (progression === 'consulted') {
    return [
      { variant: 'link', label: i18nText('Reminders.action.reopenAdvisor'), to: `/advisor${ruleRoute}` },
    ];
  }
  return [{ variant: 'link', label: i18nText('Reminders.action.askAdvisor'), to: `/advisor${ruleRoute}` }];
}

const KIND_BADGE: Record<ReminderKind, { labelKey: string; fg: string; bg: string }> = {
  task:     { labelKey: 'Reminders.kind.task',     fg: '#1d4ed8', bg: '#dbeafe' },
  guide:    { labelKey: 'Reminders.kind.guide',    fg: '#9333ea', bg: '#f3e8ff' },
  practice: { labelKey: 'Reminders.kind.practice', fg: '#047857', bg: '#d1fae5' },
  consult:  { labelKey: 'Reminders.kind.consult',  fg: '#c2410c', bg: '#fed7aa' },
};

const PROGRESSION_LABEL_KEYS: Record<string, string> = {
  pending: 'Reminders.progression.pending',
  due: 'Reminders.progression.due',
  acknowledged: 'Reminders.progression.acknowledged',
  reflected: 'Reminders.progression.reflected',
  practicing: 'Reminders.progression.practicing',
  habituated: 'Reminders.progression.habituated',
  consulted: 'Reminders.progression.consulted',
  completed: 'Reminders.progression.completed',
  snoozed: 'Reminders.progression.snoozed',
  scheduled: 'Reminders.progression.scheduled',
  not_applicable: 'Reminders.progression.notApplicable',
};

function kindLabel(kind: ReminderKind): string {
  return i18nText(KIND_BADGE[kind].labelKey);
}

function progressionLabel(progression: string): string {
  const key = PROGRESSION_LABEL_KEYS[progression];
  return key ? i18nText(key) : progression;
}

function isExplainComplete(reminder: ActiveReminder): boolean {
  const explain = reminder.rule.explain;
  if (reminder.kind === 'task') return true; // explain optional for task per PO-REMI-006
  if (!explain) return false;
  return (
    typeof explain.whyNow === 'string'
    && explain.whyNow.trim().length > 0
    && Array.isArray(explain.howTo)
    && explain.howTo.length >= 3
    && typeof explain.doneWhen === 'string'
    && explain.doneWhen.trim().length > 0
    && Array.isArray(explain.sources)
    && explain.sources.length > 0
  );
}

export function ReminderExplainDrawer({ reminder, onClose, onAction, onOpenCapture }: ReminderExplainDrawerProps) {
  if (!reminder) return null;

  const explain = reminder.rule.explain;
  const complete = isExplainComplete(reminder);
  const kindBadge = KIND_BADGE[reminder.kind];
  const progression = currentProgressionState({
    kind: reminder.kind,
    acknowledgedAt: reminder.state?.acknowledgedAt ?? null,
    reflectedAt: reminder.state?.reflectedAt ?? null,
    practiceStartedAt: reminder.state?.practiceStartedAt ?? null,
    practiceLastAt: reminder.state?.practiceLastAt ?? null,
    practiceCount: reminder.state?.practiceCount ?? 0,
    practiceHabituatedAt: reminder.state?.practiceHabituatedAt ?? null,
    consultedAt: reminder.state?.consultedAt ?? null,
    consultationConversationId: reminder.state?.consultationConversationId ?? null,
    completedAt: reminder.state?.completedAt ?? null,
    notApplicable: reminder.state?.notApplicable ?? 0,
  });

  const primaries = complete ? resolveFooterPrimary(reminder) : [];
  const notApplicableOk = canMarkNotApplicable(reminder);

  const drawer = (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className="parentos-reminder-explain-drawer-overlay fixed inset-0 z-[90] bg-[rgba(15,23,42,0.28)] transition-opacity"
      />
      <aside
        role="dialog"
        aria-label={i18nText('Reminders.drawer.ariaTitle', { title: reminder.rule.title })}
        className="parentos-reminder-explain-drawer fixed right-0 top-0 z-[100] flex h-full flex-col bg-white shadow-[-18px_0_48px_rgba(15,23,42,0.14)]"
        style={{ width: DRAWER_WIDTH }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b px-6 py-6" style={{ borderColor: '#eceae4' }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-[2px] text-[12px] font-semibold tracking-[0.04em]"
                style={{ background: kindBadge.bg, color: kindBadge.fg }}
              >
                {kindLabel(reminder.kind)}
              </span>
              <span className="text-[12px]" style={{ color: '#94a3b8' }}>
                {progressionLabel(progression)}
              </span>
              {reminder.kind === 'practice' && reminder.state?.practiceCount ? (
                <span className="text-[12px]" style={{ color: '#64748b' }}>
                  {i18nText('Reminders.drawer.practiceCount', { count: reminder.state.practiceCount })}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-[17px] font-semibold leading-[1.45] tracking-tight" style={{ color: '#0f172a' }}>
              {reminder.rule.title}
            </h2>
            <p className="mt-2.5 text-[14px] leading-[1.8]" style={{ color: '#475569' }}>
              {reminder.rule.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18nText('Reminders.action.close')}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#f0f0ec]"
            style={{ color: '#b0b5bc' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!complete ? (
            <ExplainIncompletePlaceholder kind={reminder.kind} />
          ) : explain ? (
            <>
              {explain.whyNow && (
                <Section title={i18nText('Reminders.drawer.section.whyNow')}>
                  <p className="text-[14px] leading-[1.8]" style={{ color: '#1e293b' }}>{explain.whyNow}</p>
                </Section>
              )}
              {explain.howTo && explain.howTo.length > 0 && (
                <Section title={i18nText('Reminders.drawer.section.howTo')}>
                  <ol className="ml-4 list-decimal space-y-3">
                    {explain.howTo.map((step, index) => (
                      <li key={index} className="pl-1 text-[14px] leading-[1.8]" style={{ color: '#1e293b' }}>
                        {step}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
              {explain.doneWhen && (
                <Section title={i18nText('Reminders.drawer.section.doneWhen')}>
                  <p className="text-[14px] leading-[1.8]" style={{ color: '#1e293b' }}>{explain.doneWhen}</p>
                </Section>
              )}
              {explain.pitfalls && explain.pitfalls.length > 0 && (
                <Section title={i18nText('Reminders.drawer.section.pitfalls')}>
                  <ul className="ml-4 list-disc space-y-2.5">
                    {explain.pitfalls.map((item, index) => (
                      <li key={index} className="pl-1 text-[14px] leading-[1.8]" style={{ color: '#475569' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {explain.ifNotNow && (
                <Section title={i18nText('Reminders.drawer.section.ifNotNow')}>
                  <p className="text-[14px] leading-[1.8]" style={{ color: '#475569' }}>{explain.ifNotNow}</p>
                </Section>
              )}
              {explain.sources && explain.sources.length > 0 && (
                <Section title={i18nText('Reminders.drawer.section.sources')}>
                  <ul className="space-y-2">
                    {explain.sources.map((source, index) => (
                      <li key={index} className="text-[13px] leading-[1.7]" style={{ color: '#64748b' }}>
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-[#1e293b]"
                          >
                            {source.citation}
                          </a>
                        ) : (
                          source.citation
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            // Task rules are allowed to omit explain. Render title + description only.
            <p className="text-[14px] leading-[1.8]" style={{ color: '#475569' }}>
              {reminder.rule.description}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4" style={{ borderColor: '#eceae4', background: '#fafaf8' }}>
          <div className="flex flex-wrap items-center gap-2">
            {primaries.map((primary, index) => {
              const isPrimary = index === 0;
              const className = `inline-flex h-9 items-center justify-center rounded-full px-4 text-[14px] font-medium transition-colors ${
                isPrimary ? 'text-white' : ''
              }`;
              const style = isPrimary
                ? { background: '#1e293b' }
                : { background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0' };
              if (primary.variant === 'link' && primary.to) {
                return (
                  <Link key={`${primary.label}-${index}`} to={primary.to} onClick={onClose} className={className} style={style}>
                    {primary.label}
                  </Link>
                );
              }
              if (primary.variant === 'action' && primary.action) {
                const action = primary.action;
                return (
                  <button
                    key={`${primary.label}-${index}`}
                    type="button"
                    onClick={() => {
                      onAction(reminder, action);
                      onClose();
                    }}
                    className={className}
                    style={style}
                  >
                    {primary.label}
                  </button>
                );
              }
              if (primary.variant === 'capture') {
                return (
                  <button
                    key={`${primary.label}-${index}`}
                    type="button"
                    onClick={() => {
                      onOpenCapture(reminder);
                      onClose();
                    }}
                    className={className}
                    style={style}
                  >
                    {primary.label}
                  </button>
                );
              }
              return null;
            })}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onAction(reminder, 'snooze', defaultSnoozeUntil(reminder.kind, getLocalToday()));
                  onClose();
                }}
                className="inline-flex h-9 items-center rounded-full px-3 text-[13px] transition-colors hover:bg-[#f1f5f9]"
                style={{ color: '#475569' }}
              >
                {i18nText('Reminders.action.snooze')}
              </button>
              {notApplicableOk && (
                <button
                  type="button"
                  onClick={() => {
                    onAction(reminder, 'mark_not_applicable');
                    onClose();
                  }}
                  className="inline-flex h-9 items-center rounded-full px-3 text-[13px] transition-colors hover:bg-[#f1f5f9]"
                  style={{ color: '#475569' }}
                >
                  {i18nText('Reminders.action.notApplicable')}
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );

  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#8d93a0' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ExplainIncompletePlaceholder({ kind }: { kind: ReminderKind }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-5" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
      <p className="text-[14px] font-medium" style={{ color: '#b45309' }}>
        {i18nText('Reminders.drawer.incompleteTitle')}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed" style={{ color: '#92400e' }}>
        {i18nText('Reminders.drawer.incompleteDescription', { kind: kindLabel(kind) })}
      </p>
    </div>
  );
}
