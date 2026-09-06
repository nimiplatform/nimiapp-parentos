import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, InlineAlert, nimiToast, Popover, PopoverContent, PopoverTrigger, StatusBadge, Surface, cn } from '@nimiplatform/kit/ui';
import { useAppStore, computeAgeMonths } from '../../app-shell/app-store.js';
import {
  deleteCustomTodo,
  getCustomTodos,
  getReminderStates,
  uncompleteCustomTodo,
  type CustomTodoRow,
} from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';
import {
  buildReminderAgenda,
  getLocalToday,
  mapReminderStateRow,
  UnknownReminderRuleError,
  type ActiveReminder,
  type ReminderHistoryItem,
  type ReminderState,
} from '../../engine/reminder-engine.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';
import { FrequencyModal } from './frequency-modal.js';
import { ScheduleModal } from './schedule-modal.js';
import { ReminderExplainDrawer } from './reminder-explain-drawer.js';
import { domainDetailRoute } from './reminder-detail-route.js';
import {
  applyReminderAction,
  canMarkNotApplicable,
  persistAgendaPlan,
} from '../../engine/reminder-actions.js';
import type { ReminderActionType } from '../../engine/reminder-actions.js';
import { loadAllFreqOverrides, type FreqOverrideMap } from '../../engine/reminder-freq-overrides.js';
import { catchLog, catchLogThen } from '../../infra/telemetry/catch-log.js';
import { HealthCaptureModal } from '../profile/health-capture-modal.js';
import {
  canDirectlyCompleteReminder,
  getRecordDataReminderSelection,
  isRecordDataReminder,
  type RecordDataReminderSelection,
} from './record-data-capture.js';
import { i18nText } from '../../i18n/index.js';


const textPrimaryClass = 'text-[var(--nimi-text-primary)]';
const textMutedClass = 'text-[var(--nimi-text-muted)]';
const menuItemClass = 'flex min-h-9 w-full items-center gap-2 rounded-[var(--nimi-radius-sm)] px-3 text-left text-[length:var(--nimi-type-body-sm-size)] text-[var(--nimi-text-secondary)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]';

const DOMAIN_LABEL_KEYS: Record<string, string> = {
  vaccine: 'Reminders.domain.vaccine',
  growth: 'Reminders.domain.growth',
  vision: 'Reminders.domain.vision',
  dental: 'Reminders.domain.dental',
  sleep: 'Reminders.domain.sleep',
  'bone-age': 'Reminders.domain.boneAge',
  checkup: 'Reminders.domain.checkup',
  nutrition: 'Reminders.domain.nutrition',
  safety: 'Reminders.domain.safety',
  language: 'Reminders.domain.language',
  motor: 'Reminders.domain.motor',
  career: 'Reminders.domain.career',
  digital: 'Reminders.domain.digital',
  emotional: 'Reminders.domain.emotional',
  fitness: 'Reminders.domain.fitness',
  hygiene: 'Reminders.domain.hygiene',
  independence: 'Reminders.domain.independence',
  interest: 'Reminders.domain.interest',
  outdoor: 'Reminders.domain.outdoor',
  posture: 'Reminders.domain.posture',
  relationship: 'Reminders.domain.relationship',
  sensitivity: 'Reminders.domain.sensitivity',
  sexuality: 'Reminders.domain.sexuality',
  tanner: 'Reminders.domain.tanner',
  values: 'Reminders.domain.values',
};

function domainLabel(domain: string): string {
  const key = DOMAIN_LABEL_KEYS[domain];
  return key ? i18nText(key) : domain;
}

function useReminderStates(childId: string | null) {
  const [states, setStates] = useState<ReminderState[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!childId) { setStates([]); setLoading(false); return; }
    setLoading(true);
    try { const rows = await getReminderStates(childId); setStates(rows.map(mapReminderStateRow)); } catch { setStates([]); }
    setLoading(false);
  }, [childId]);
  useEffect(() => { void load(); }, [load]);
  return { states, loading, reload: load };
}

function useCustomTodos(childId: string | null) {
  const [todos, setTodos] = useState<CustomTodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!childId) { setTodos([]); setLoading(false); return; }
    setLoading(true);
    try { const rows = await getCustomTodos(childId); setTodos(rows); } catch { setTodos([]); }
    setLoading(false);
  }, [childId]);
  useEffect(() => { void load(); }, [load]);
  return { todos, loading, reload: load };
}

type ReminderPrimaryAction =
  | { label: string; to: string; kind?: 'link' }
  | { label: string; kind: 'capture' };

function primaryAction(reminder: ActiveReminder): ReminderPrimaryAction {
  // W5 will replace these Link primaries with drawer-driven actions per PO-REMI-011.
  // For W4a we only normalize the kind dispatch to the new 4-kind taxonomy.
  if (reminder.kind === 'guide' || reminder.kind === 'practice') {
    return { label: i18nText('Reminders.action.openNote'), to: `/journal?reminderRuleId=${encodeURIComponent(reminder.rule.ruleId)}&repeatIndex=${reminder.repeatIndex}` };
  }
  if (reminder.kind === 'consult') {
    return { label: i18nText('Reminders.action.askAdvisor'), to: `/advisor?reminderRuleId=${encodeURIComponent(reminder.rule.ruleId)}&repeatIndex=${reminder.repeatIndex}` };
  }
  if (reminder.rule.domain === 'vaccine') return { label: i18nText('Reminders.action.recordVaccine'), to: domainDetailRoute(reminder.rule.domain) };
  if (isRecordDataReminder(reminder)) return { label: i18nText('Reminders.action.recordData'), kind: 'capture' };
  if (reminder.rule.domain === 'growth') return { label: i18nText('Reminders.action.recordData'), to: domainDetailRoute(reminder.rule.domain) };
  return { label: reminder.rule.actionType === 'go_hospital' ? i18nText('Reminders.action.goRecord') : i18nText('Reminders.action.viewProfile'), to: domainDetailRoute(reminder.rule.domain) };
}

function statusLabel(reminder: ActiveReminder) {
  switch (reminder.lifecycle) {
    case 'completed': return i18nText('Reminders.status.completed');
    case 'scheduled': return reminder.state?.scheduledDate
      ? i18nText('Reminders.status.scheduledDate', { date: reminder.state.scheduledDate })
      : i18nText('Reminders.status.scheduled');
    case 'snoozed': return reminder.state?.snoozedUntil
      ? i18nText('Reminders.status.snoozedUntil', { date: reminder.state.snoozedUntil })
      : i18nText('Reminders.status.snoozed');
    case 'overdue': return reminder.overdueDays > 0
      ? i18nText('Reminders.status.overdueDays', { days: reminder.overdueDays })
      : i18nText('Reminders.status.overdue');
    case 'due': return i18nText('Reminders.status.dueToday');
    default: return reminder.daysUntilStart > 0
      ? i18nText('Reminders.status.startsInDays', { days: reminder.daysUntilStart })
      : i18nText('Reminders.status.thisWeek');
  }
}

function historyLabel(item: ReminderHistoryItem) {
  switch (item.historyType) {
    case 'completed': return i18nText('Reminders.status.completed');
    case 'scheduled': return item.state?.scheduledDate
      ? i18nText('Reminders.status.scheduledDate', { date: item.state.scheduledDate })
      : i18nText('Reminders.status.scheduled');
    case 'snoozed': return item.state?.snoozedUntil
      ? i18nText('Reminders.status.snoozedUntil', { date: item.state.snoozedUntil })
      : i18nText('Reminders.status.snoozed');
    case 'not_applicable': return i18nText('Reminders.status.notApplicable');
  }
}

function formatDateLabel(value: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

/* ── Glass section card ── */

function SectionCard({ title, hint, count, children, collapsible = false, defaultCollapsed = false }: {
  title: string; hint: string; count?: number; children: ReactNode; collapsible?: boolean; defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <Surface as="section" material="glass-regular" padding="none" tone="card" className="rounded-3xl p-7 transition-transform hover:-translate-y-0.5">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 className={cn('text-[16px] font-semibold tracking-tight', textPrimaryClass)}>{title}</h2>
          <p className={cn('mt-1 text-[13px] leading-relaxed', textMutedClass)}>{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typeof count === 'number' && (
            <StatusBadge tone="neutral" className="shrink-0">{i18nText('Reminders.page.itemCount', { count })}</StatusBadge>
          )}
          {collapsible && (
            <Button type="button" tone="ghost" size="sm" onClick={() => setCollapsed((v) => !v)} className="gap-1 px-2.5 py-1 text-[12px]">
              <span>{collapsed ? i18nText('Reminders.action.expand') : i18nText('Reminders.action.collapse')}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={cn('transition-transform duration-200', collapsed ? 'rotate-0' : 'rotate-180')}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </Button>
          )}
        </div>
      </div>
      {!collapsible || !collapsed ? children : null}
    </Surface>
  );
}

/* ── Sub-group divider inside a section card ── */

function SubGroup({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('text-[13px] font-medium', textMutedClass)}>{label}</span>
        <StatusBadge tone="neutral">{i18nText('Reminders.page.itemCount', { count })}</StatusBadge>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/* ── Reminder row ── */

/**
 * Low-frequency reminder actions (schedule / frequency / not-applicable) live
 * behind one overflow menu, so the card presents a single primary action plus
 * completion instead of a flat button row. Details are reached by clicking the
 * card body, not from this menu. Postponement has exactly one concept — 安排
 * (parent-chosen date); the old one-click 推迟 was removed.
 */
// @nimi-authority: rule.parentos.remi.r005
function ReminderMoreMenu({ reminder, onSchedule, onNotApplicable, onAdjustFrequency }: {
  reminder: ActiveReminder;
  onSchedule: (r: ActiveReminder) => void;
  onNotApplicable: (r: ActiveReminder) => void;
  onAdjustFrequency: (r: ActiveReminder) => void;
}) {
  const [open, setOpen] = useState(false);
  const items: { id: string; label: string; onSelect: () => void }[] = [
    { id: 'schedule', label: i18nText('Reminders.action.schedule'), onSelect: () => onSchedule(reminder) },
  ];
  if (reminder.rule.repeatRule?.cadenceUnit === 'month') {
    items.push({ id: 'adjust-frequency', label: i18nText('Reminders.action.adjustFrequency'), onSelect: () => onAdjustFrequency(reminder) });
  }
  const showNotApplicable = canMarkNotApplicable(reminder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" tone="ghost" size="sm" className="gap-1" onClick={(event) => event.stopPropagation()}>
          <span>{i18nText('Reminders.action.more')}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={cn('transition-transform duration-200', open ? 'rotate-180' : 'rotate-0')}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        <div role="menu" aria-label={i18nText('Reminders.action.more')} onClick={(event) => event.stopPropagation()}>
          {items.map((item) => (
            <button key={item.id} type="button" role="menuitem" className={menuItemClass}
              onClick={() => { setOpen(false); item.onSelect(); }}>
              {item.label}
            </button>
          ))}
          {showNotApplicable ? (
            <>
              <div className="mx-2 my-1 border-t border-[var(--nimi-border-subtle)]" />
              <button type="button" role="menuitem" className={cn(menuItemClass, 'text-[var(--nimi-status-danger)]')}
                onClick={() => { setOpen(false); onNotApplicable(reminder); }}>
                {i18nText('Reminders.action.notApplicable')}
              </button>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// @nimi-authority: rule.parentos.remi.r011
function ReminderRow({ reminder, onOpenDetail, onComplete, onSchedule, onNotApplicable, onAdjustFrequency, onOpenCapture }: {
  reminder: ActiveReminder;
  onOpenDetail: (r: ActiveReminder) => void;
  onComplete: (r: ActiveReminder) => void;
  onSchedule: (r: ActiveReminder) => void;
  onNotApplicable: (r: ActiveReminder) => void;
  onAdjustFrequency: (r: ActiveReminder) => void;
  onOpenCapture: (r: ActiveReminder) => void;
}) {
  const primary = primaryAction(reminder);
  const domain = domainLabel(reminder.rule.domain);
  const isOverdue = reminder.lifecycle === 'overdue';
  // For non-task kinds, trim the inline description; the drawer owns the full
  // explain rendering (whyNow / howTo / doneWhen / sources) per PO-REMI-011.
  const shortDescription = reminder.kind === 'task'
    ? reminder.rule.description
    : reminder.rule.explain?.whyNow ?? reminder.rule.description;
  const completeLabel = reminder.kind === 'task'
    ? i18nText('Reminders.action.complete')
    : i18nText('Reminders.action.acknowledged');
  const canComplete = canDirectlyCompleteReminder(reminder);

  return (
    <Surface material="glass-thin" tone="card" padding="none" className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5 cursor-pointer" onClick={() => onOpenDetail(reminder)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge tone={isOverdue ? 'danger' : 'info'}>{domain}</StatusBadge>
            <span className={cn('text-[12px]', textMutedClass)}>{statusLabel(reminder)}</span>
          </div>
          <button type="button" className={cn('text-left text-[16px] font-semibold', textPrimaryClass)}
            onClick={(event) => { event.stopPropagation(); onOpenDetail(reminder); }}>
            {reminder.rule.title}
          </button>
          <p className={cn('mt-2 text-[14px] leading-relaxed', textMutedClass)}>{shortDescription}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {primary.kind === 'capture' ? (
          <Button type="button" tone="primary" size="sm" onClick={(event) => { event.stopPropagation(); onOpenCapture(reminder); }}>
            {primary.label}
          </Button>
        ) : (
          <Button asChild tone="primary" size="sm">
            <Link to={primary.to} onClick={(event) => event.stopPropagation()}>{primary.label}</Link>
          </Button>
        )}
        {canComplete && (
          <Button type="button" tone="secondary" size="sm" onClick={(event) => { event.stopPropagation(); onComplete(reminder); }}>{completeLabel}</Button>
        )}
        <ReminderMoreMenu reminder={reminder}
          onSchedule={onSchedule}
          onNotApplicable={onNotApplicable}
          onAdjustFrequency={onAdjustFrequency} />
      </div>
    </Surface>
  );
}

/* ── Main page ── */

export default function RemindersPage() {
  const { activeChildId, children: childList } = useAppStore();
  const child = childList.find((item) => item.childId === activeChildId);
  const { states, loading, reload } = useReminderStates(activeChildId);
  const { todos: customTodos, loading: customTodosLoading, reload: reloadCustomTodos } = useCustomTodos(activeChildId);
  const [freqOverrides, setFreqOverrides] = useState<FreqOverrideMap>(new Map());
  const [freqModalReminder, setFreqModalReminder] = useState<ActiveReminder | null>(null);
  const [scheduleModalReminder, setScheduleModalReminder] = useState<ActiveReminder | null>(null);
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);
  const [captureSelection, setCaptureSelection] = useState<RecordDataReminderSelection | null>(null);
  const ageMonths = child ? computeAgeMonths(child.birthDate) : 0;
  const localToday = getLocalToday();
  const repeatableRuleIds = useMemo(() => REMINDER_RULES.filter((r) => r.repeatRule).map((r) => r.ruleId), []);

  const reloadFreqOverrides = useCallback(async () => {
    if (!child) { setFreqOverrides(new Map()); return; }
    const overrides = await loadAllFreqOverrides(child.childId, repeatableRuleIds);
    setFreqOverrides(overrides);
  }, [child, repeatableRuleIds]);

  useEffect(() => { void reloadFreqOverrides().catch(catchLogThen('reminders', 'action:load-freq-overrides-failed', () => setFreqOverrides(new Map()))); }, [reloadFreqOverrides]);

  const agendaResult = useMemo(() => {
    if (!child) return { kind: 'idle' as const };
    try {
      const agenda = buildReminderAgenda(REMINDER_RULES, { birthDate: child.birthDate, gender: child.gender, ageMonths, profileCreatedAt: child.createdAt, localToday, nurtureMode: child.nurtureMode, domainOverrides: child.nurtureModeOverrides }, states, freqOverrides);
      return { kind: 'ok' as const, agenda };
    } catch (error) {
      if (error instanceof UnknownReminderRuleError) {
        return { kind: 'unknown-rule' as const, ruleIds: error.ruleIds };
      }
      throw error;
    }
  }, [child, ageMonths, localToday, states, freqOverrides]);

  const agenda = agendaResult.kind === 'ok' ? agendaResult.agenda : null;

  useEffect(() => {
    if (!child || !agenda) return;
    persistAgendaPlan(child.childId, agenda, states).then((didPersist) => { if (didPersist) void reload(); }).catch(catchLog('reminders', 'action:persist-agenda-plan-failed'));
  }, [child, agenda, states, reload]);

  const handleAction = useCallback(async (reminder: ActiveReminder, action: ReminderActionType, extra?: string | null): Promise<boolean> => {
    if (!child) return false;
    const applied = await applyReminderAction({ childId: child.childId, reminder, state: reminder.state, action, scheduledDate: action === 'schedule' ? extra ?? null : undefined, snoozedUntil: action === 'snooze' ? extra ?? null : undefined })
      .then(() => true)
      .catch((error: unknown) => {
        catchLog('reminders', 'action:apply-reminder-action-failed')(error);
        nimiToast.danger(i18nText('Reminders.page.actionFailed', {
          message: error instanceof Error ? error.message : String(error),
        }));
        return false;
      });
    await reload();
    return applied;
  }, [child, reload]);

  const handleScheduleConfirm = useCallback((reminder: ActiveReminder, scheduledDate: string) => {
    void handleAction(reminder, 'schedule', scheduledDate).then((applied) => {
      if (applied) nimiToast.success(i18nText('Reminders.status.scheduledDate', { date: scheduledDate }));
    });
  }, [handleAction]);

  const openRecordDataCapture = useCallback((reminder: ActiveReminder) => {
    try {
      setCaptureSelection(getRecordDataReminderSelection(reminder));
    } catch (nextError) {
      setCaptureSelection(null);
      nimiToast.danger(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, []);

  const handleRestoreCustomTodo = useCallback(async (todoId: string) => {
    await uncompleteCustomTodo(todoId, isoNow()).catch((error: unknown) => {
      catchLog('reminders', 'action:restore-custom-todo-failed')(error);
      nimiToast.danger(i18nText('Reminders.page.restoreTodoFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
    });
    await reloadCustomTodos();
  }, [reloadCustomTodos]);

  const handleDeleteCustomTodo = useCallback(async (todoId: string) => {
    await deleteCustomTodo(todoId).catch((error: unknown) => {
      catchLog('reminders', 'action:delete-custom-todo-failed')(error);
      nimiToast.danger(i18nText('Reminders.page.deleteTodoFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
    });
    await reloadCustomTodos();
  }, [reloadCustomTodos]);

  const completedCustomTodos = useMemo(
    () => customTodos.filter((t) => Boolean(t.completedAt)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [customTodos],
  );

  const renderReminderRows = (items: ActiveReminder[], keyPrefix = '') => items.map((reminder) => (
    <ReminderRow key={`${keyPrefix}${reminder.rule.ruleId}-${reminder.repeatIndex}`} reminder={reminder}
      onOpenDetail={setActiveReminder}
      onComplete={(item) => void handleAction(item, item.kind === 'task' ? 'complete' : 'acknowledge')}
      onSchedule={(item) => setScheduleModalReminder(item)}
      onNotApplicable={(item) => void handleAction(item, 'mark_not_applicable')}
      onAdjustFrequency={(item) => setFreqModalReminder(item)}
      onOpenCapture={openRecordDataCapture} />
  ));

  if (!child) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <EmptyState
          title={i18nText('Reminders.page.noChildTitle')}
          description={i18nText('Reminders.page.noChildDescription')}
          action={(
            <Button asChild tone="secondary" size="sm">
              <Link to="/timeline">{i18nText('Reminders.action.backHome')}</Link>
            </Button>
          )}
        />
      </div>
    );
  }

  if (agendaResult.kind === 'unknown-rule') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <InlineAlert tone="danger" className="max-w-2xl">
          <p className="font-semibold">{i18nText('Reminders.page.unknownRuleTitle')}</p>
          <p className="mt-1 text-[14px]">
            {i18nText('Reminders.page.unknownRuleIds', { ruleIds: agendaResult.ruleIds.join(i18nText('Common.list.separator')) })}
          </p>
          <p className="mt-1 text-[14px]">
            {i18nText('Reminders.page.unknownRuleFailClose')}
          </p>
        </InlineAlert>
      </div>
    );
  }

  if (loading || customTodosLoading || !agenda) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className={cn('text-sm', textMutedClass)}>{i18nText('Reminders.page.loading')}</p>
      </div>
    );
  }

  const subtitleParts = [
    agenda.todayFocus.length > 0 ? i18nText('Reminders.page.subtitleToday', { count: agenda.todayFocus.length }) : null,
    agenda.upcoming.length > 0 ? i18nText('Reminders.page.subtitleUpcoming', { count: agenda.upcoming.length }) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="h-full overflow-y-auto hide-scrollbar">
      <div className="max-w-[920px] mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button asChild tone="ghost" size="sm" className="aspect-square px-0">
            <Link to="/timeline" aria-label={i18nText('Reminders.action.backHome')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </Link>
          </Button>
          <div>
            <h1 className={cn('text-[24px] font-semibold tracking-tight', textPrimaryClass)}>{i18nText('Reminders.page.title')}</h1>
            {subtitleParts.length > 0 && (
              <p className={cn('mt-1 text-[14px]', textMutedClass)}>
                {subtitleParts.join(i18nText('Common.list.separator'))}
              </p>
            )}
          </div>
        </div>

        {/* Today — full list always expanded; overflow and catch-up land as sub-groups */}
        <SectionCard count={agenda.todayFocus.length} title={i18nText('Reminders.page.section.today.title')} hint={i18nText('Reminders.page.section.today.hint')}>
          <div className="space-y-4">
            {agenda.todayFocus.length === 0 ? <p className={cn('text-[14px]', textMutedClass)}>{i18nText('Reminders.page.empty.today')}</p>
            : renderReminderRows(agenda.todayFocus)}
          </div>
          {agenda.p0Overflow.count > 0 && (
            <SubGroup label={i18nText('Reminders.page.section.p0Overflow.title')} count={agenda.p0Overflow.count}>
              {renderReminderRows(agenda.p0Overflow.items, 'p0-')}
            </SubGroup>
          )}
          {agenda.onboardingCatchup.count > 0 && (
            <SubGroup label={i18nText('Reminders.page.section.catchup.title')} count={agenda.onboardingCatchup.count}>
              {renderReminderRows(agenda.onboardingCatchup.items, 'cold-')}
            </SubGroup>
          )}
        </SectionCard>

        {/* Upcoming */}
        <SectionCard count={agenda.upcoming.length} title={i18nText('Reminders.page.section.upcoming.title')} hint={i18nText('Reminders.page.section.upcoming.hint')}>
          <div className="space-y-4">
            {agenda.upcoming.length === 0 ? <p className={cn('text-[14px]', textMutedClass)}>{i18nText('Reminders.page.empty.upcoming')}</p>
            : renderReminderRows(agenda.upcoming)}
          </div>
        </SectionCard>

        {/* History — reminder history plus completed custom todos, collapsed by default */}
        <SectionCard count={agenda.history.length + completedCustomTodos.length} title={i18nText('Reminders.page.section.history.title')} hint={i18nText('Reminders.page.section.history.hint')} collapsible defaultCollapsed>
          {agenda.history.length === 0 && completedCustomTodos.length === 0 ? (
            <p className={cn('text-[14px]', textMutedClass)}>{i18nText('Reminders.page.empty.history')}</p>
          ) : (
            <>
              {agenda.history.length > 0 && (
                <div className="space-y-3">
                  {agenda.history.map((item) => (
                    <Surface key={`${item.rule.ruleId}-${item.repeatIndex}`} material="glass-thin" tone="card" padding="none" className="flex items-center justify-between gap-3 rounded-2xl px-5 py-3.5">
                      <div className="min-w-0">
                        <p className={cn('truncate text-[14px] font-medium', textPrimaryClass)}>{item.rule.title}</p>
                        <p className={cn('mt-1 text-[13px]', textMutedClass)}>{historyLabel(item)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.historyType === 'completed' && (
                          <Button type="button" tone="secondary" size="sm" onClick={() => void handleAction(item, 'restore')}>{i18nText('Reminders.action.restoreTodo')}</Button>
                        )}
                        <StatusBadge tone="neutral">{domainLabel(item.rule.domain)}</StatusBadge>
                      </div>
                    </Surface>
                  ))}
                </div>
              )}
              {completedCustomTodos.length > 0 && (
                <SubGroup label={i18nText('Reminders.page.section.customTodos.title')} count={completedCustomTodos.length}>
                  {completedCustomTodos.map((todo) => (
                    <Surface key={todo.todoId} material="glass-thin" tone="card" padding="none" className="flex items-center justify-between gap-3 rounded-2xl px-5 py-3.5">
                      <div className="min-w-0">
                        <p className={cn('text-[14px] font-medium [overflow-wrap:anywhere]', textPrimaryClass)}>{todo.title}</p>
                        <p className={cn('mt-1 text-[13px]', textMutedClass)}>
                          {formatDateLabel(todo.completedAt)
                            ? i18nText('Reminders.page.customCompletedAt', { date: formatDateLabel(todo.completedAt) })
                            : i18nText('Reminders.page.customCompletedFallback')}
                          {todo.dueDate ? i18nText('Reminders.page.customDueDate', { date: todo.dueDate }) : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" tone="secondary" size="sm" onClick={() => void handleRestoreCustomTodo(todo.todoId)}>{i18nText('Reminders.action.restoreTodo')}</Button>
                        <Button type="button" tone="ghost" size="sm" onClick={() => void handleDeleteCustomTodo(todo.todoId)}>{i18nText('Reminders.action.delete')}</Button>
                      </div>
                    </Surface>
                  ))}
                </SubGroup>
              )}
            </>
          )}
        </SectionCard>
      </div>

      {child && captureSelection ? (
        <HealthCaptureModal
          open
          childId={child.childId}
          childBirthDate={child.birthDate}
          initialGroupId={captureSelection.groupId}
          initialMetricId={captureSelection.metricId ?? null}
          linkedReminder={captureSelection.linkedReminder}
          onClose={() => {
            setCaptureSelection(null);
          }}
          onSaved={() => {
            setCaptureSelection(null);
            void reload();
          }}
        />
      ) : null}

      {freqModalReminder && child && freqModalReminder.rule.repeatRule?.cadenceUnit === 'month' && (
        <FrequencyModal
          childId={child.childId} ruleId={freqModalReminder.rule.ruleId} ruleTitle={freqModalReminder.rule.title}
          currentIntervalMonths={freqModalReminder.rule.repeatRule.interval} existingOverride={null}
          canDisable={freqModalReminder.rule.priority !== 'P0'}
          onSaved={() => { void reload(); void reloadFreqOverrides(); }} onClose={() => setFreqModalReminder(null)} />
      )}

      {scheduleModalReminder ? (
        <ScheduleModal
          ruleTitle={scheduleModalReminder.rule.title}
          suggestedDate={scheduleModalReminder.state?.scheduledDate ?? localToday}
          minDate={localToday}
          onConfirm={(date) => {
            handleScheduleConfirm(scheduleModalReminder, date);
            setScheduleModalReminder(null);
          }}
          onClose={() => setScheduleModalReminder(null)}
        />
      ) : null}

      <ReminderExplainDrawer
        reminder={activeReminder}
        onClose={() => setActiveReminder(null)}
        onOpenCapture={openRecordDataCapture}
        onSchedule={(item) => setScheduleModalReminder(item)}
        onAction={(reminder, action, extra) => {
          void handleAction(reminder, action, extra);
        }}
      />
    </div>
  );
}
