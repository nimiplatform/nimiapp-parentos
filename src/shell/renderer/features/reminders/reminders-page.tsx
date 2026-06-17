import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, InlineAlert, StatusBadge, Surface, cn } from '@nimiplatform/kit/ui';
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
import { ReminderExplainDrawer } from './reminder-explain-drawer.js';
import { domainDetailRoute } from './reminder-detail-route.js';
import {
  applyReminderAction,
  canMarkNotApplicable,
  defaultSnoozeUntil,
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
  return { label: reminder.rule.actionType === 'go_hospital' ? i18nText('Reminders.action.viewDetails') : i18nText('Reminders.action.viewProfile'), to: domainDetailRoute(reminder.rule.domain) };
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

/* ── Glass summary tile ── */

type SummaryTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

function SummaryTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: SummaryTone }) {
  return (
    <Surface material="glass-thin" tone="card" padding="none" className="rounded-2xl p-5">
      <StatusBadge tone={tone} shape="dot">{label}</StatusBadge>
      <p className={cn('mt-3 text-[24px] font-semibold leading-none tracking-tight', textPrimaryClass)}>{value}</p>
      <p className={cn('mt-2 text-[13px] leading-relaxed', textMutedClass)}>{hint}</p>
    </Surface>
  );
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

/* ── Today hero ── */

function TodayHero({
  reminder,
  onComplete,
  onOpenCapture,
}: {
  reminder: ActiveReminder | null;
  onComplete: (r: ActiveReminder) => void;
  onOpenCapture: (r: ActiveReminder) => void;
}) {
  if (!reminder) {
    return (
      <Surface material="glass-thin" tone="card" padding="none" className="rounded-2xl p-6">
        <StatusBadge tone="success" shape="dot">{i18nText('Reminders.page.todayBadge')}</StatusBadge>
        <h2 className={cn('mt-3 text-[24px] font-semibold tracking-tight', textPrimaryClass)}>{i18nText('Reminders.page.noTodayTitle')}</h2>
        <p className={cn('mt-2 text-[14px] leading-relaxed', textMutedClass)}>{i18nText('Reminders.page.noTodayDescription')}</p>
      </Surface>
    );
  }
  const primary = primaryAction(reminder);
  const canComplete = canDirectlyCompleteReminder(reminder);
  return (
    <Surface material="glass-thin" tone="card" padding="none" className="rounded-2xl p-6">
      <StatusBadge tone="success" shape="dot">{i18nText('Reminders.page.todayBadge')}</StatusBadge>
      <h2 className={cn('mt-3 text-[24px] font-semibold tracking-tight', textPrimaryClass)}>{reminder.rule.title}</h2>
      <p className={cn('mt-2 text-[14px] leading-relaxed', textMutedClass)}>{statusLabel(reminder)}</p>
      <div className="flex flex-wrap items-center gap-2 mt-5">
        {primary.kind === 'capture' ? (
          <Button type="button" tone="primary" size="md" onClick={() => onOpenCapture(reminder)}>
            {primary.label}
          </Button>
        ) : (
          <Button asChild tone="primary" size="md">
            <Link to={primary.to}>{primary.label}</Link>
          </Button>
        )}
        {canComplete && (
          <Button type="button" tone="secondary" size="md" onClick={() => onComplete(reminder)}>{i18nText('Reminders.action.markComplete')}</Button>
        )}
      </div>
    </Surface>
  );
}

/* ── Reminder row ── */

function ReminderRow({ reminder, onOpenDetail, onComplete, onSnooze, onSchedule, onNotApplicable, onAdjustFrequency, onOpenCapture }: {
  reminder: ActiveReminder;
  onOpenDetail: (r: ActiveReminder) => void;
  onComplete: (r: ActiveReminder) => void;
  onSnooze: (r: ActiveReminder) => void;
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
    <Surface material="glass-thin" tone="card" padding="none" className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge tone={isOverdue ? 'danger' : 'info'}>{domain}</StatusBadge>
            <span className={cn('text-[12px]', textMutedClass)}>{statusLabel(reminder)}</span>
          </div>
          <p className={cn('text-[16px] font-semibold', textPrimaryClass)}>{reminder.rule.title}</p>
          <p className={cn('mt-2 text-[14px] leading-relaxed', textMutedClass)}>{shortDescription}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button type="button" tone="primary" size="sm" onClick={() => onOpenDetail(reminder)}>
          {i18nText('Reminders.action.viewDetails')}
        </Button>
        {primary.kind === 'capture' ? (
          <Button type="button" tone="secondary" size="sm" onClick={() => onOpenCapture(reminder)}>
            {primary.label}
          </Button>
        ) : (
          <Button asChild tone="secondary" size="sm">
            <Link to={primary.to}>{primary.label}</Link>
          </Button>
        )}
        {canComplete && (
          <Button type="button" tone="secondary" size="sm" onClick={() => onComplete(reminder)}>{completeLabel}</Button>
        )}
        <Button type="button" tone="ghost" size="sm" onClick={() => onSnooze(reminder)}>{i18nText('Reminders.action.snooze')}</Button>
        {reminder.kind === 'task' && (
          <Button type="button" tone="ghost" size="sm" onClick={() => onSchedule(reminder)}>{i18nText('Reminders.action.schedule')}</Button>
        )}
        {canMarkNotApplicable(reminder) && (
          <Button type="button" tone="danger" size="sm" onClick={() => onNotApplicable(reminder)}>{i18nText('Reminders.action.notApplicable')}</Button>
        )}
        {reminder.rule.repeatRule && (
          <Button type="button" tone="ghost" size="sm" onClick={() => onAdjustFrequency(reminder)}>{i18nText('Reminders.action.adjust')}</Button>
        )}
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
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);
  const [captureSelection, setCaptureSelection] = useState<RecordDataReminderSelection | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
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

  const handleAction = useCallback(async (reminder: ActiveReminder, action: ReminderActionType, extra?: string | null) => {
    if (!child) return;
    await applyReminderAction({ childId: child.childId, reminder, state: reminder.state, action, scheduledDate: action === 'schedule' ? extra ?? null : undefined, snoozedUntil: action === 'snooze' ? extra ?? null : undefined }).catch(catchLog('reminders', 'action:apply-reminder-action-failed'));
    await reload();
  }, [child, reload]);

  const openRecordDataCapture = useCallback((reminder: ActiveReminder) => {
    try {
      setCaptureError(null);
      setCaptureSelection(getRecordDataReminderSelection(reminder));
    } catch (nextError) {
      setCaptureSelection(null);
      setCaptureError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, []);

  const handleSchedule = useCallback((reminder: ActiveReminder) => {
    const suggestion = reminder.state?.scheduledDate ?? localToday;
    const scheduledDate = window.prompt(i18nText('Reminders.page.schedulePrompt'), suggestion);
    if (!scheduledDate) return;
    void handleAction(reminder, 'schedule', scheduledDate);
  }, [handleAction, localToday]);

  const handleRestoreCustomTodo = useCallback(async (todoId: string) => {
    await uncompleteCustomTodo(todoId, isoNow()).catch(catchLog('reminders', 'action:restore-custom-todo-failed'));
    await reloadCustomTodos();
  }, [reloadCustomTodos]);

  const handleDeleteCustomTodo = useCallback(async (todoId: string) => {
    await deleteCustomTodo(todoId).catch(catchLog('reminders', 'action:delete-custom-todo-failed'));
    await reloadCustomTodos();
  }, [reloadCustomTodos]);

  const completedCustomTodos = useMemo(
    () => customTodos.filter((t) => Boolean(t.completedAt)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [customTodos],
  );

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
            <p className={cn('mt-1 text-[14px]', textMutedClass)}>
              {i18nText('Reminders.page.subtitle', { today: agenda.todayFocus.length, upcoming: agenda.upcoming.length, history: agenda.history.length })}
            </p>
          </div>
        </div>

        {/* Hero section — glass card */}
        <Surface as="section" material="glass-thick" padding="none" tone="card" className="rounded-3xl p-7">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-5 items-stretch">
            <TodayHero
              reminder={agenda.todayFocus[0] ?? null}
              onComplete={(item) => void handleAction(item, item.kind === 'task' ? 'complete' : 'acknowledge')}
              onOpenCapture={openRecordDataCapture}
            />
            <div className="grid grid-cols-1 gap-4">
              {agenda.p0Overflow.count > 0 && <SummaryTile label={i18nText('Reminders.page.summary.p0Overflow.label')} value={String(agenda.p0Overflow.count)} hint={i18nText('Reminders.page.summary.p0Overflow.hint')} tone="warning" />}
              {agenda.onboardingCatchup.count > 0 && <SummaryTile label={i18nText('Reminders.page.summary.catchup.label')} value={String(agenda.onboardingCatchup.count)} hint={i18nText('Reminders.page.summary.catchup.hint')} tone="info" />}
              <SummaryTile label={i18nText('Reminders.page.summary.today.label')} value={String(agenda.todayFocus.length)} hint={i18nText('Reminders.page.summary.today.hint')} tone="success" />
              <SummaryTile label={i18nText('Reminders.page.summary.upcoming.label')} value={String(agenda.upcoming.length)} hint={i18nText('Reminders.page.summary.upcoming.hint')} tone="info" />
              <SummaryTile label={i18nText('Reminders.page.summary.overdue.label')} value={String(agenda.overdueSummary.count)} hint={i18nText('Reminders.page.summary.overdue.hint')} tone="danger" />
            </div>
          </div>
        </Surface>

        {/* Today */}
        <SectionCard count={agenda.todayFocus.length} title={i18nText('Reminders.page.section.today.title')} hint={i18nText('Reminders.page.section.today.hint')} collapsible defaultCollapsed>
          <div className="space-y-4">
            {agenda.todayFocus.length === 0 ? <p className={cn('text-[14px]', textMutedClass)}>{i18nText('Reminders.page.empty.today')}</p>
            : agenda.todayFocus.map((r) => (
              <ReminderRow key={`${r.rule.ruleId}-${r.repeatIndex}`} reminder={r}
                onOpenDetail={setActiveReminder}
                onComplete={(i) => void handleAction(i, i.kind === 'task' ? 'complete' : 'acknowledge')}
                onSnooze={(i) => void handleAction(i, 'snooze', defaultSnoozeUntil(i.kind, localToday))}
                onSchedule={handleSchedule} onNotApplicable={(i) => void handleAction(i, 'mark_not_applicable')} onAdjustFrequency={(i) => setFreqModalReminder(i)} onOpenCapture={openRecordDataCapture} />
            ))}
          </div>
        </SectionCard>

        {agenda.p0Overflow.count > 0 && (
          <SectionCard count={agenda.p0Overflow.count} title={i18nText('Reminders.page.section.p0Overflow.title')} hint={i18nText('Reminders.page.section.p0Overflow.hint')}>
            <div className="space-y-4">
              {agenda.p0Overflow.items.map((r) => (
                <ReminderRow key={`p0-${r.rule.ruleId}-${r.repeatIndex}`} reminder={r}
                  onOpenDetail={setActiveReminder}
                  onComplete={(i) => void handleAction(i, i.kind === 'task' ? 'complete' : 'acknowledge')}
                  onSnooze={(i) => void handleAction(i, 'snooze', defaultSnoozeUntil(i.kind, localToday))}
                  onSchedule={handleSchedule} onNotApplicable={(i) => void handleAction(i, 'mark_not_applicable')} onAdjustFrequency={(i) => setFreqModalReminder(i)} onOpenCapture={openRecordDataCapture} />
              ))}
            </div>
          </SectionCard>
        )}

        {agenda.onboardingCatchup.count > 0 && (
          <SectionCard count={agenda.onboardingCatchup.count} title={i18nText('Reminders.page.section.catchup.title')} hint={i18nText('Reminders.page.section.catchup.hint')}>
            <div className="space-y-4">
              {agenda.onboardingCatchup.items.map((r) => (
                <ReminderRow key={`cold-${r.rule.ruleId}-${r.repeatIndex}`} reminder={r}
                  onOpenDetail={setActiveReminder}
                  onComplete={(i) => void handleAction(i, i.kind === 'task' ? 'complete' : 'acknowledge')}
                  onSnooze={(i) => void handleAction(i, 'snooze', defaultSnoozeUntil(i.kind, localToday))}
                  onSchedule={handleSchedule} onNotApplicable={(i) => void handleAction(i, 'mark_not_applicable')} onAdjustFrequency={(i) => setFreqModalReminder(i)} onOpenCapture={openRecordDataCapture} />
              ))}
            </div>
          </SectionCard>
        )}

        {/* Upcoming */}
        <SectionCard count={agenda.upcoming.length} title={i18nText('Reminders.page.section.upcoming.title')} hint={i18nText('Reminders.page.section.upcoming.hint')}>
          <div className="space-y-4">
            {agenda.upcoming.length === 0 ? <p className={cn('text-[14px]', textMutedClass)}>{i18nText('Reminders.page.empty.upcoming')}</p>
            : agenda.upcoming.map((r) => (
              <ReminderRow key={`${r.rule.ruleId}-${r.repeatIndex}`} reminder={r}
                onOpenDetail={setActiveReminder}
                onComplete={(i) => void handleAction(i, i.kind === 'task' ? 'complete' : 'acknowledge')}
                onSnooze={(i) => void handleAction(i, 'snooze', defaultSnoozeUntil(i.kind, localToday))}
                onSchedule={handleSchedule} onNotApplicable={(i) => void handleAction(i, 'mark_not_applicable')} onAdjustFrequency={(i) => setFreqModalReminder(i)} onOpenCapture={openRecordDataCapture} />
            ))}
          </div>
        </SectionCard>

        {/* History */}
        <SectionCard count={agenda.history.length} title={i18nText('Reminders.page.section.history.title')} hint={i18nText('Reminders.page.section.history.hint')}>
          <div className="space-y-3">
            {agenda.history.length === 0 ? <p className={cn('text-[14px]', textMutedClass)}>{i18nText('Reminders.page.empty.history')}</p>
            : agenda.history.map((item) => (
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
        </SectionCard>

        {/* Custom todos history */}
        {completedCustomTodos.length > 0 && (
          <SectionCard count={completedCustomTodos.length} title={i18nText('Reminders.page.section.customTodos.title')} hint={i18nText('Reminders.page.section.customTodos.hint')}>
            <div className="space-y-3">
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
            </div>
          </SectionCard>
        )}

        {captureError ? (
          <InlineAlert tone="danger">
            {captureError}
          </InlineAlert>
        ) : null}
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

      <ReminderExplainDrawer
        reminder={activeReminder}
        onClose={() => setActiveReminder(null)}
        onOpenCapture={openRecordDataCapture}
        onAction={(reminder, action, extra) => {
          void handleAction(reminder, action, extra);
        }}
      />
    </div>
  );
}
