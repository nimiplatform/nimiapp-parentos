import { Button, DatePicker, Surface, TextField } from '@nimiplatform/kit/ui';
import { Minus, Plus } from 'lucide-react';
import {
  ChipGroup,
  HealthRecordModalShell,
  InlineError,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '../profile/health-record-modal-shell.js';
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../app-shell/app-store.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import {
  getOutdoorRecords,
  getOutdoorGoal,
  setOutdoorGoal,
  insertOutdoorRecord,
  updateOutdoorRecord,
  deleteOutdoorRecord,
  type OutdoorRecordRow,
} from '../../bridge/sqlite-bridge.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { OutdoorGoalHero, OutdoorGoalIntro } from './outdoor-goal-onboarding.js';
import { OutdoorGoalSetup } from './outdoor-goal-setup.js';
import { OutdoorRecentWeeks } from './outdoor-recent-weeks.js';
import { OutdoorWeekHero } from './outdoor-week-hero.js';
import { OutdoorWeekJournal } from './outdoor-week-journal.js';
import { OutdoorWeekScene } from './outdoor-week-scene.js';
import { VisionSummaryCard } from './vision-summary-card.js';
import {
  getWeekStart,
  shiftWeek,
  computeWeekSummary,
  computeRecentWeeks,
  buildOutdoorMessage,
  fmtDate,
  parseDate,
  formatOutdoorDuration,
  stepRecordMinutes,
  DEFAULT_OUTDOOR_GOAL_MINUTES,
  DEFAULT_RECORD_MINUTES,
  DURATION_PRESETS,
  MAX_RECORD_MINUTES,
  OUTDOOR_TREND_WEEKS,
  type WeekSummary,
} from './outdoor-helpers.js';
import { i18nText } from '../../i18n/index.js';


/**
 * The day a "backfill" starts from: the latest day of the week, before today,
 * with nothing logged; failing that the latest day before today, or today
 * itself on a Monday.
 */
function suggestBackfillDate(summary: WeekSummary, todayStr: string): string {
  const past = summary.dailyBreakdown.filter((day) => day.date < todayStr).reverse();
  return past.find((day) => day.minutes === 0)?.date ?? past[0]?.date ?? todayStr;
}

// ── Outdoor Page ──────────────────────────────────────────

export function OutdoorPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId) ?? null;
  const childId = child?.childId ?? null;

  const [records, setRecords] = useState<OutdoorRecordRow[]>([]);
  const [goalMinutes, setGoalMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Week navigation state
  const todayStr = fmtDate(new Date());
  const currentWeekStart = getWeekStart(new Date());
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);

  // Record modal: the record being edited, or the date a new record starts on.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OutdoorRecordRow | null>(null);
  const [newRecordDate, setNewRecordDate] = useState(todayStr);

  // Goal setup state
  const [showGoalSetup, setShowGoalSetup] = useState(false);

  const load = useCallback(async () => {
    if (!childId) {
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [recs, goal] = await Promise.all([
        getOutdoorRecords(childId),
        getOutdoorGoal(childId),
      ]);
      setRecords(recs);
      setGoalMinutes(goal);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => { void load(); }, [load]);

  // Derived state
  const effectiveGoal = goalMinutes ?? DEFAULT_OUTDOOR_GOAL_MINUTES;
  const isCurrentWeek = selectedWeekStart === currentWeekStart;
  const isPastWeek = selectedWeekStart < currentWeekStart;

  const weekSummary = useMemo(
    () => computeWeekSummary(records, effectiveGoal, selectedWeekStart, todayStr),
    [records, effectiveGoal, selectedWeekStart, todayStr],
  );

  const recentWeeks = useMemo(
    () => computeRecentWeeks(records, effectiveGoal, OUTDOOR_TREND_WEEKS, todayStr).reverse(),
    [records, effectiveGoal, todayStr],
  );

  const message = useMemo(
    () => buildOutdoorMessage(weekSummary, isPastWeek),
    [weekSummary, isPastWeek],
  );

  // Week records for the selected week
  const weekRecords = useMemo(
    () => records.filter((r) => r.activityDate >= weekSummary.weekStart && r.activityDate <= weekSummary.weekEnd)
      .sort((a, b) => a.activityDate.localeCompare(b.activityDate) || a.createdAt.localeCompare(b.createdAt)),
    [records, weekSummary],
  );

  // ── Handlers ──

  const handleSaveGoal = useCallback(async (minutes: number) => {
    if (!childId) return;
    await setOutdoorGoal(childId, minutes, isoNow());
    setGoalMinutes(minutes);
    setShowGoalSetup(false);
  }, [childId]);

  const handleSaveRecord = useCallback(async (activityDate: string, durationMinutes: number, note: string) => {
    if (!childId) return;
    if (editingRecord) {
      await updateOutdoorRecord({
        recordId: editingRecord.recordId,
        activityDate,
        durationMinutes,
        note: note || null,
        now: isoNow(),
      });
    } else {
      await insertOutdoorRecord({
        recordId: ulid(),
        childId,
        activityDate,
        durationMinutes,
        note: note || null,
        now: isoNow(),
      });
    }
    setModalOpen(false);
    setEditingRecord(null);
    // Show the week the record landed in.
    setSelectedWeekStart(getWeekStart(parseDate(activityDate)));
    await load();
  }, [childId, editingRecord, load]);

  const handleDeleteRecord = useCallback(async (recordId: string) => {
    await deleteOutdoorRecord(recordId);
    setModalOpen(false);
    setEditingRecord(null);
    await load();
  }, [load]);

  const openNewRecord = useCallback((date: string) => {
    setEditingRecord(null);
    setNewRecordDate(date);
    setModalOpen(true);
  }, []);

  const openEditRecord = useCallback((record: OutdoorRecordRow) => {
    setEditingRecord(record);
    setModalOpen(true);
  }, []);

  const backLink = (
    <div className="flex items-center gap-2 mb-5">
      <Link to="/profile" className="text-[14px] hover:underline text-[var(--nimi-text-muted)]">{i18nText('Outdoor.page.backToProfile')}</Link>
    </div>
  );

  if (!child) {
    return <div className="max-w-3xl mx-auto px-6 pb-6 pt-[72px]">{backLink}<p className="text-[var(--nimi-text-muted)]">{i18nText('Outdoor.page.selectChildFirst')}</p></div>;
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto px-6 pb-6 pt-[72px]">{backLink}<p className="text-[var(--nimi-text-muted)]">{i18nText('Outdoor.page.loading')}</p></div>;
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-6 pb-6 pt-[72px]">
        {backLink}
        <Surface tone="card" material="glass-thick" elevation="raised" padding="lg" className="mx-auto max-w-lg">
          <h2 className="mb-3 text-[18px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Outdoor.page.loadError.title')}</h2>
          <p className="mb-5 text-[14px] leading-relaxed text-[var(--nimi-text-muted)]">{loadError}</p>
          <Button onClick={() => { void load(); }} tone="primary" size="md">
            {i18nText('Outdoor.page.loadError.retry')}
          </Button>
        </Surface>
      </div>
    );
  }

  // ── Goal not set, or being changed: illustrated guide → goal picker ──
  // Both steps share one hero, so moving between them keeps the art in place.

  if (goalMinutes === null || showGoalSetup) {
    return (
      <OutdoorGoalHero gender={child.gender}>
        {showGoalSetup ? (
          <OutdoorGoalSetup
            initialMinutes={effectiveGoal}
            onSave={handleSaveGoal}
            onCancel={goalMinutes !== null ? () => setShowGoalSetup(false) : undefined}
          />
        ) : (
          <OutdoorGoalIntro onSetGoal={() => setShowGoalSetup(true)} />
        )}
      </OutdoorGoalHero>
    );
  }

  // ── Weekly tracker: the week and its diary beside the scene, trend and vision ──
  // From 60rem the page is two columns (geometry shared with
  // `.parentos-outdoor-tracker` in styles.css). Narrower, both columns
  // dissolve into one stack, ordered: week, scene banner, diary, trend, vision.

  const backfill = () => openNewRecord(suggestBackfillDate(weekSummary, todayStr));
  const hasEarlierDay = weekSummary.dailyBreakdown.some((day) => day.date < todayStr);

  return (
    <div className="parentos-outdoor-tracker min-h-full">
      <div className="mx-auto grid w-full max-w-[1240px] px-5 pb-16 pt-[72px] sm:px-10 min-[60rem]:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] min-[60rem]:gap-x-10 min-[60rem]:pl-14 min-[60rem]:pr-10 min-[72rem]:grid-cols-[minmax(0,29rem)_minmax(0,1fr)] min-[72rem]:gap-x-12">
        <div className="contents min-[60rem]:flex min-[60rem]:min-w-0 min-[60rem]:flex-col">
          <OutdoorWeekHero
            summary={weekSummary}
            message={message}
            todayStr={todayStr}
            isCurrentWeek={isCurrentWeek}
            onPreviousWeek={() => setSelectedWeekStart(shiftWeek(selectedWeekStart, -1))}
            onNextWeek={isCurrentWeek ? undefined : () => setSelectedWeekStart(shiftWeek(selectedWeekStart, 1))}
            onThisWeek={() => setSelectedWeekStart(currentWeekStart)}
            onLogDay={openNewRecord}
            onLogToday={() => openNewRecord(todayStr)}
            onBackfill={backfill}
            onChangeGoal={() => setShowGoalSetup(true)}
          />
          <OutdoorWeekJournal
            records={weekRecords}
            isCurrentWeek={isCurrentWeek}
            onEdit={openEditRecord}
            className="order-2 mt-8 min-[60rem]:mt-16"
          />
        </div>

        <div className="contents min-[60rem]:relative min-[60rem]:isolate min-[60rem]:flex min-[60rem]:min-w-0 min-[60rem]:flex-col">
          <OutdoorWeekScene gender={child.gender} className="order-1" />
          <OutdoorRecentWeeks
            weeks={recentWeeks}
            goalMinutes={effectiveGoal}
            currentWeekStart={currentWeekStart}
            selectedWeekStart={selectedWeekStart}
            onSelectWeek={setSelectedWeekStart}
            onAdd={hasEarlierDay ? backfill : undefined}
            className="order-3 mt-12 min-[60rem]:mt-0"
          />
          <VisionSummaryCard childId={child.childId} className="order-4 mt-6" />
        </div>
      </div>

      {modalOpen && (
        <RecordModal
          defaultDate={editingRecord?.activityDate ?? newRecordDate}
          defaultMinutes={editingRecord?.durationMinutes ?? null}
          defaultNote={editingRecord?.note ?? ''}
          todayStr={todayStr}
          isEditing={editingRecord !== null}
          onSave={handleSaveRecord}
          onDelete={editingRecord ? () => handleDeleteRecord(editingRecord.recordId) : undefined}
          onClose={() => { setModalOpen(false); setEditingRecord(null); }}
        />
      )}
    </div>
  );
}

// ── Record Modal ──────────────────────────────────────────

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

/** Digits only, no leading zeros, capped at the minutes in a day. */
function normalizeMinutesDraft(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits === '' ? '' : String(Math.min(MAX_RECORD_MINUTES, Number(digits)));
}

function shiftDate(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

function RecordModal({
  defaultDate,
  defaultMinutes,
  defaultNote,
  todayStr,
  isEditing,
  onSave,
  onDelete,
  onClose,
}: {
  defaultDate: string;
  defaultMinutes: number | null;
  defaultNote: string;
  todayStr: string;
  isEditing: boolean;
  onSave: (date: string, minutes: number, note: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const noteId = useId();
  const [date, setDate] = useState(defaultDate);
  const initialMinutes = defaultMinutes ?? DEFAULT_RECORD_MINUTES;
  const [draft, setDraft] = useState(String(initialMinutes));
  // Last valid duration, restored when the field is left empty.
  const [lastValid, setLastValid] = useState(initialMinutes);
  const [note, setNote] = useState(defaultNote);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const minutes = draft === '' ? 0 : Number(draft);
  const valid = minutes > 0;
  const current = valid ? minutes : lastValid;
  const canSave = Boolean(date) && date <= todayStr && valid;

  const changeDraft = (next: string) => {
    setDraft(next);
    if (Number(next) > 0) setLastValid(Number(next));
    setSaveFailed(false);
  };
  const step = (direction: 1 | -1) => changeDraft(String(stepRecordMinutes(current, direction)));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    step(event.key === 'ArrowUp' ? 1 : -1);
  };

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await action();
    } catch (error) {
      catchLog('outdoor', 'action:save-record-failed')(error);
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!canSave || saving) return;
    void run(() => onSave(date, minutes, note.trim()));
  };

  const quickDays = [
    { value: todayStr, label: i18nText('Outdoor.page.recordModal.today') },
    { value: shiftDate(todayStr, -1), label: i18nText('Outdoor.page.recordModal.yesterday') },
    { value: shiftDate(todayStr, -2), label: i18nText('Outdoor.page.recordModal.dayBeforeYesterday') },
  ];
  const presets = DURATION_PRESETS.map((preset) => ({ value: String(preset), label: formatOutdoorDuration(preset) }));

  return (
    <HealthRecordModalShell open size="S" onClose={onClose} ariaLabel={isEditing ? i18nText('Outdoor.page.recordModal.editTitle') : i18nText('Outdoor.page.recordModal.createTitle')}>
      <ModalHeader
        title={isEditing ? i18nText('Outdoor.page.recordModal.editTitle') : i18nText('Outdoor.page.recordModal.createTitle')}
        icon="☀️"
        onClose={onClose}
      />
      <ModalContent>
        <div className="flex flex-col gap-6">
          <div role="group" aria-label={i18nText('Outdoor.page.recordModal.date')}>
            <FieldLabel>{i18nText('Outdoor.page.recordModal.date')}</FieldLabel>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ChipGroup options={quickDays} value={date} onChange={(value) => { setDate(value); setSaveFailed(false); }} size="sm" />
              <DatePicker
                value={date}
                onValueChange={(value) => { if (value) { setDate(value); setSaveFailed(false); } }}
                maxDate={todayStr}
                allowClear={false}
                size="sm"
                className="w-[152px]"
              />
            </div>
          </div>

          <div role="group" aria-label={i18nText('Outdoor.page.recordModal.duration')}>
            <FieldLabel>{i18nText('Outdoor.page.recordModal.duration')}</FieldLabel>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-full bg-[var(--nimi-surface-panel)] p-1.5 shadow-[inset_0_0_0_1px_var(--nimi-border-subtle)] transition-shadow has-[input:focus]:shadow-[inset_0_0_0_1px_var(--nimi-field-focus),0_0_0_3px_var(--nimi-focus-ring-color)]">
                <StepButton label={i18nText('Outdoor.page.recordModal.decrease')} disabled={stepRecordMinutes(current, -1) === current} onClick={() => step(-1)}>
                  <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
                </StepButton>
                <input
                  value={draft}
                  onChange={(event) => changeDraft(normalizeMinutesDraft(event.target.value))}
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={() => { if (!valid) setDraft(String(lastValid)); }}
                  onKeyDown={handleKeyDown}
                  inputMode="numeric"
                  autoComplete="off"
                  role="spinbutton"
                  aria-label={i18nText('Outdoor.page.recordModal.durationMinutes')}
                  aria-valuemin={1}
                  aria-valuemax={MAX_RECORD_MINUTES}
                  aria-valuenow={valid ? minutes : undefined}
                  style={{ width: `${Math.max(3, draft.length) + 0.8}ch` }}
                  className="bg-transparent text-center text-[30px] font-bold leading-none tracking-[-0.01em] tabular-nums text-[var(--nimi-text-primary)] caret-[var(--nimi-action-primary-bg)] outline-none"
                />
                <StepButton label={i18nText('Outdoor.page.recordModal.increase')} disabled={stepRecordMinutes(current, 1) === current} onClick={() => step(1)}>
                  <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
                </StepButton>
              </div>
              <span className="text-[14px] text-[var(--nimi-text-muted)]">{i18nText('Outdoor.page.minuteUnit')}</span>
            </div>
            <div className="mt-3">
              <ChipGroup options={presets} value={draft} onChange={changeDraft} size="sm" />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor={noteId}>{i18nText('Outdoor.page.recordModal.noteOptional')}</FieldLabel>
            <TextField
              id={noteId}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={i18nText('Outdoor.page.recordModal.notePlaceholder')}
              className="mt-2 w-full"
            />
          </div>

          {saveFailed ? <InlineError>{i18nText('Outdoor.page.recordModal.saveFailed')}</InlineError> : null}
        </div>
      </ModalContent>
      <ModalFooter
        leading={
          isEditing && onDelete ? (
            <Button
              onClick={() => {
                if (confirmingDelete) {
                  void run(onDelete);
                } else {
                  setConfirmingDelete(true);
                }
              }}
              disabled={saving}
              tone="danger"
              size="md"
            >
              {confirmingDelete ? i18nText('Outdoor.page.recordModal.confirmDelete') : i18nText('Outdoor.page.recordModal.delete')}
            </Button>
          ) : null
        }
      >
        <Button
          onClick={confirmingDelete ? () => setConfirmingDelete(false) : onClose}
          tone="ghost"
          size="md"
        >
          {confirmingDelete ? i18nText('Outdoor.page.recordModal.keep') : i18nText('Outdoor.page.recordModal.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={!canSave || saving || confirmingDelete} tone="primary" size="md">
          {saving ? i18nText('Outdoor.page.recordModal.saving') : i18nText('Outdoor.page.recordModal.save')}
        </Button>
      </ModalFooter>
    </HealthRecordModalShell>
  );
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const className = 'block text-[13px] font-medium text-[var(--nimi-text-muted)]';
  return htmlFor
    ? <label htmlFor={htmlFor} className={className}>{children}</label>
    : <span className={className}>{children}</span>;
}

function StepButton({ label, disabled, onClick, children }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--nimi-surface-card)] text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_84%,var(--nimi-text-primary))] shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-[background-color,transform,opacity] duration-150 hover:bg-[var(--nimi-accent-soft)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-[var(--nimi-surface-card)] ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
