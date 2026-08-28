import { Button, DatePicker, StatusBadge, Surface, TextareaField, TextField } from '@nimiplatform/kit/ui';
import {
  HealthRecordModalShell,
  InlineError,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore, computeAgeMonths, computeAgeMonthsAt, formatAge } from '../../app-shell/app-store.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';
import type { ReminderRule } from '../../knowledge-base/gen/reminder-rules.gen.js';
import { deleteVaccineRecord, getVaccineRecords, insertVaccineRecord, updateVaccineRecord } from '../../bridge/sqlite-bridge.js';
import type { VaccineRecordRow } from '../../bridge/sqlite-bridge.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { AISummaryCard } from './ai-summary-card.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { VaccineCaptureModal } from './vaccine-capture-form.js';
import { i18nText } from '../../i18n/index.js';


/* ── helpers ──────────────────────────────────────────────── */

function fmtDate(d: string) { return d.split('T')[0] ?? d; }

/* Optional-tagged vaccines are self-paid non-program vaccines; all others are program vaccines. */
function isOptionalVaccine(rule: ReminderRule) {
  return rule.tags?.includes('optional') ?? false;
}

function VaccineClassBadge({ rule }: { rule: ReminderRule }) {
  const optional = isOptionalVaccine(rule);
  return (
    <StatusBadge tone={optional ? 'warning' : 'info'} className="shrink-0 px-2 py-0.5 text-[11px]">
      {optional ? i18nText('Vaccine.badge.classTwo') : i18nText('Vaccine.badge.classOne')}
    </StatusBadge>
  );
}

/* ================================================================
   RECORD MODAL
   ================================================================ */

function VaccineRecordModal({ rule, childId, birthDate, existing, onSave, onClose }: {
  rule: ReminderRule; childId: string; birthDate: string;
  existing?: VaccineRecordRow | null;
  onSave: () => void | Promise<void>; onClose: () => void;
}) {
  const [date, setDate] = useState(existing ? fmtDate(existing.vaccinatedAt) : new Date().toISOString().slice(0, 10));
  const [batch, setBatch] = useState(existing?.batchNumber ?? '');
  const [hospital, setHospital] = useState(existing?.hospital ?? '');
  const [reaction, setReaction] = useState(existing?.adverseReaction ?? '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    if (!date) {
      setErrorMsg(i18nText('Vaccine.error.missingDate'));
      return;
    }
    if (date < birthDate.slice(0, 10)) {
      setErrorMsg(i18nText('Vaccine.error.dateBeforeBirth'));
      return;
    }
    if (date > new Date().toISOString().slice(0, 10)) {
      setErrorMsg(i18nText('Vaccine.error.dateInFuture'));
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      if (existing) {
        await updateVaccineRecord({
          recordId: existing.recordId,
          vaccinatedAt: date,
          ageMonths: computeAgeMonthsAt(birthDate, date),
          batchNumber: batch || null, hospital: hospital || null,
          adverseReaction: reaction || null,
        });
      } else {
        await insertVaccineRecord({
          recordId: ulid(), reminderStateId: ulid(), childId, ruleId: rule.ruleId,
          vaccineName: rule.title, vaccinatedAt: date,
          ageMonths: computeAgeMonthsAt(birthDate, date),
          batchNumber: batch || null, hospital: hospital || null,
          adverseReaction: reaction || null, photoPath: null, now: isoNow(),
        });
      }
      await onSave();
      onClose();
    } catch (error) {
      catchLog('vaccine', 'action:save-vaccine-record-failed')(error);
      setErrorMsg(i18nText('Vaccine.error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HealthRecordModalShell open size="S" onClose={onClose}>
      <ModalHeader title={rule.title} icon="💉" onClose={onClose} />
      <ModalContent>
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--nimi-text-muted)]">{rule.description}</p>
          <div>
            <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Vaccine.field.vaccinatedAt')}</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Vaccine.field.batchNumber')}</label>
              <TextField value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={i18nText('Vaccine.field.optional')} className="w-full" />
            </div>
            <div>
              <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Vaccine.field.hospital')}</label>
              <TextField value={hospital} onChange={(e) => setHospital(e.target.value)} placeholder={i18nText('Vaccine.field.optional')} className="w-full" />
            </div>
          </div>
          <div>
            <label className="text-[13px] mb-1 block text-[var(--nimi-text-muted)]">{i18nText('Vaccine.recordModal.adverseReaction')}</label>
            <TextareaField value={reaction} onChange={(e) => setReaction(e.target.value)}
              placeholder={i18nText('Vaccine.recordModal.adverseReactionPlaceholder')}
              className="w-full" rows={2} />
          </div>
          {errorMsg ? <InlineError>{errorMsg}</InlineError> : null}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button onClick={onClose} tone="ghost" size="md">{i18nText('Vaccine.recordModal.cancel')}</Button>
        <Button onClick={() => void handleSave()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('Vaccine.recordModal.saving') : i18nText('Vaccine.recordModal.save')}
        </Button>
      </ModalFooter>
    </HealthRecordModalShell>
  );
}

/* ================================================================
   HISTORICAL COLLAPSIBLE SECTION
   ================================================================ */

function HistoricalSection({ rules, onRecord }: {
  rules: ReminderRule[]; onRecord: (ruleId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Surface tone="card" material="glass-regular" elevation="base" padding="none" className="mb-5 overflow-hidden rounded-3xl">
      {/* Collapsed header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[var(--nimi-action-ghost-hover)]">
        <div className="flex items-center gap-2">
          <span className="text-[16px]">📋</span>
          <span className="text-[14px] font-medium text-[var(--nimi-text-muted)]">
            {i18nText('Vaccine.history.pendingTitle', { count: rules.length })}
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={'var(--nimi-text-muted)'} strokeWidth="2" strokeLinecap="round"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-4">
          <p className="text-[12px] mb-3 text-[var(--nimi-text-muted)]">
            {i18nText('Vaccine.history.hint')}
          </p>
          <div className="space-y-1.5">
            {rules.map((r) => (
              <div key={r.ruleId} className="group flex items-center gap-2.5 rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] p-2.5">
                <span className="flex-1 text-[13px] text-[var(--nimi-text-primary)]">{r.title}</span>
                <VaccineClassBadge rule={r} />
                <Button onClick={() => onRecord(r.ruleId)} tone="ghost" size="sm">
                  {i18nText('Vaccine.history.backfill')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function VaccinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [records, setRecords] = useState<VaccineRecordRow[]>([]);
  const [recordingRuleId, setRecordingRuleId] = useState<string | null>(() => searchParams.get('ruleId'));
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'list'>('timeline');

  useEffect(() => {
    if (activeChildId) getVaccineRecords(activeChildId).then(setRecords).catch(catchLog('vaccine', 'action:load-vaccine-records-failed'));
  }, [activeChildId]);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Vaccine.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);
  const vaccineRules = REMINDER_RULES.filter((r) => r.domain === 'vaccine');
  const recordedRuleIds = new Set(records.map((r) => r.ruleId));
  /* Progress is measured against vaccines whose window has already opened
     (startMonths <= current age), not against the full 0-18y catalog — the
     all-rules denominator made the bar meaningless for infants and capped
     families skipping optional class-2 vaccines below 100% forever. */
  const dueRules = vaccineRules.filter((r) => r.triggerAge.startMonths <= ageMonths);
  const dueDone = dueRules.filter((r) => recordedRuleIds.has(r.ruleId)).length;
  const pct = dueRules.length > 0 ? Math.round((dueDone / dueRules.length) * 100) : 0;

  const dueClass1Rules = dueRules.filter((r) => !isOptionalVaccine(r));
  const dueClass2Rules = dueRules.filter((r) => isOptionalVaccine(r));
  const class1Done = dueClass1Rules.filter((r) => recordedRuleIds.has(r.ruleId)).length;
  const class2Done = dueClass2Rules.filter((r) => recordedRuleIds.has(r.ruleId)).length;

  /* List view still groups the full catalog by vaccine class. */
  const class1Rules = vaccineRules.filter((r) => !isOptionalVaccine(r));
  const class2Rules = vaccineRules.filter((r) => isOptionalVaccine(r));
  const class1Total = class1Rules.filter((r) => recordedRuleIds.has(r.ruleId)).length;
  const class2Total = class2Rules.filter((r) => recordedRuleIds.has(r.ruleId)).length;

  const reload = () => { getVaccineRecords(child.childId).then(setRecords).catch(catchLog('vaccine', 'action:reload-vaccine-records-failed')); };

  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteRecord = async (ruleId: string) => {
    const rec = records.find((x) => x.ruleId === ruleId);
    if (!rec) return;
    setDeleteError(null);
    try {
      await deleteVaccineRecord(rec.recordId, isoNow());
      setDeletingRuleId(null);
      reload();
    } catch (error) {
      catchLog('vaccine', 'action:delete-vaccine-record-failed')(error);
      setDeleteError(i18nText('Vaccine.error.deleteFailed'));
    }
  };

  const clearRuleSearch = () => {
    if (!searchParams.has('ruleId')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('ruleId');
    setSearchParams(next, { replace: true });
  };

  /* Upcoming vaccines: only current window or recently overdue. */
  const upcoming = useMemo(() =>
    vaccineRules.filter((r) => {
      if (recordedRuleIds.has(r.ruleId)) return false;
      const end = r.triggerAge.endMonths === -1 ? 999 : r.triggerAge.endMonths;
      // In current window or up to 12 months past the end
      return ageMonths >= r.triggerAge.startMonths - 1 && ageMonths <= end + 12;
    }).slice(0, 5),
  [ageMonths, recordedRuleIds, vaccineRules]);

  /* Historical unrecorded: overdue by more than 12 months, likely not entered. */
  const historicalUnrecorded = useMemo(() =>
    vaccineRules.filter((r) => {
      if (recordedRuleIds.has(r.ruleId)) return false;
      const end = r.triggerAge.endMonths === -1 ? 999 : r.triggerAge.endMonths;
      return ageMonths > end + 12;
    }),
  [ageMonths, recordedRuleIds, vaccineRules]);

  /* ── Timeline: group by age buckets ────────────────────── */
  const ageBuckets = useMemo(() => {
    const buckets: Array<{ startMonth: number; endMonth: number; label: string; rules: ReminderRule[] }> = [];
    const ranges: Array<[number, number, string]> = [
      [0, 1, i18nText('Vaccine.ageBucket.birth')],
      [2, 3, i18nText('Vaccine.ageBucket.m2_3')],
      [4, 6, i18nText('Vaccine.ageBucket.m4_6')],
      [7, 9, i18nText('Vaccine.ageBucket.m7_9')],
      [10, 12, i18nText('Vaccine.ageBucket.m10_12')],
      [13, 18, i18nText('Vaccine.ageBucket.m13_18')],
      [19, 24, i18nText('Vaccine.ageBucket.m19_24')],
      [25, 36, i18nText('Vaccine.ageBucket.y2_3')],
      [37, 48, i18nText('Vaccine.ageBucket.y3_4')],
      [49, 72, i18nText('Vaccine.ageBucket.y4_6')],
      [73, 144, i18nText('Vaccine.ageBucket.y6_12')],
      [145, 216, i18nText('Vaccine.ageBucket.y12_18')],
    ];
    for (const [s, e, lbl] of ranges) {
      const rs = vaccineRules.filter((r) => r.triggerAge.startMonths >= s && r.triggerAge.startMonths <= e);
      if (rs.length > 0) buckets.push({ startMonth: s, endMonth: e, label: lbl, rules: rs });
    }
    return buckets; // chronological: birth first, so the child's current stage is never buried below future stages
  }, [vaccineRules]);

  /* Auto-scroll the timeline so the current stage is visible on entry. */
  const currentBucketRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeTab === 'timeline') {
      currentBucketRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [activeTab, activeChildId]);

  const recordingRule = recordingRuleId ? vaccineRules.find((r) => r.ruleId === recordingRuleId) : null;

  return (
    <ProfileDetailShell
      title={
        <span className="flex items-center gap-2">
          <span>{i18nText('Vaccine.page.title')}</span>
          <span className="group relative inline-flex">
            <span className="w-[18px] h-[18px] rounded-full inline-flex items-center justify-center cursor-help transition-colors hover:bg-[var(--nimi-action-ghost-hover)] text-[var(--nimi-text-muted)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <span className="pointer-events-none absolute left-0 top-7 z-50 w-[360px] rounded-xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-overlay)] p-4 text-[13px] leading-relaxed text-[var(--nimi-text-secondary)] opacity-0 shadow-[var(--nimi-elevation-floating)] transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
              <span className="block text-[14px] font-semibold text-[var(--nimi-text-primary)] mb-2.5">{i18nText('Vaccine.sources.title')}</span>
              <ul className="space-y-2.5">
                <li>
                  <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vaccine.sources.program')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)] mt-0.5">{i18nText('Vaccine.sources.programDetail')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Vaccine.sources.programDocument')}</span>
                </li>
                <li>
                  <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vaccine.sources.nonProgram')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)] mt-0.5">{i18nText('Vaccine.sources.nonProgramDetail')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Vaccine.sources.nonProgramJournal')}</span>
                </li>
                <li>
                  <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vaccine.sources.who')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)] mt-0.5">{i18nText('Vaccine.sources.whoDetail')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Vaccine.sources.whoCoverage')}</span>
                </li>
              </ul>
              <span className="block text-[12px] mt-2.5 pt-2 border-t border-[var(--nimi-border-subtle)] text-[var(--nimi-text-muted)]">{i18nText('Vaccine.sources.note')}</span>
            </span>
          </span>
        </span>
      }
      actions={
        <>
          <Button onClick={() => setShowCustomModal(true)} tone="primary" size="sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {i18nText('Vaccine.page.addRecord')}
          </Button>
          <span className="text-[14px] px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
            {dueDone}/{dueRules.length} · {pct}%
          </span>
        </>
      }
      aiSummary={
        <AISummaryCard domain="vaccine" childName={child.displayName} childId={child.childId}
          ageLabel={i18nText('Vaccine.summary.ageYearsMonths', {
            years: Math.floor(ageMonths / 12),
            months: ageMonths % 12,
          })} gender={child.gender}
          dataContext={dueDone > 0 ? i18nText('Vaccine.summary.context', {
            completed: dueDone,
            total: dueRules.length,
            pct,
            pending: upcoming.length > 0
              ? i18nText('Vaccine.summary.pending', { items: upcoming.map((r) => r.title).join(i18nText('Common.list.separator')) })
              : i18nText('Vaccine.summary.allComplete'),
          }) : ''} />
      }
    >
      {/* Progress bar */}
      <Surface tone="card" material="glass-regular" elevation="raised" padding="md" className="mb-5 rounded-3xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{i18nText('Vaccine.page.progressTitle')}</span>
          <span className="text-[14px] font-bold text-[var(--nimi-action-primary-bg)]">{pct}%</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--nimi-border-subtle)]">
          <div className="h-full rounded-full bg-[var(--nimi-action-primary-bg)] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--nimi-text-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--nimi-status-info)]" />
            {i18nText('Vaccine.page.classOneProgress')}<span className="font-medium text-[var(--nimi-text-primary)]">{class1Done}/{dueClass1Rules.length}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--nimi-text-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--nimi-status-warning)]" />
            {i18nText('Vaccine.page.classTwoProgress')}<span className="font-medium text-[var(--nimi-text-primary)]">{class2Done}/{dueClass2Rules.length}</span>
          </span>
        </div>
      </Surface>

      {/* Upcoming vaccines. */}
      {upcoming.length > 0 && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="mb-5 rounded-3xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[16px]">🔔</span>
            <h3 className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Vaccine.page.upcomingTitle')}</h3>
          </div>
          <div className="space-y-2">
            {upcoming.map((r) => {
              const isOverdue = ageMonths > r.triggerAge.endMonths && r.triggerAge.endMonths !== -1;
              return (
                <div key={r.ruleId} className={`flex items-center gap-3 rounded-2xl border p-3 ${isOverdue ? 'border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))]' : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)]'}`}>
                  <div className={`w-[32px] h-[32px] rounded-lg flex items-center justify-center text-[16px] shrink-0 ${isOverdue ? 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_14%,transparent)]' : 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)]'}`}>
                    {isOverdue ? '⚠️' : '💉'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-medium truncate text-[var(--nimi-text-primary)]">{r.title}</p>
                      <VaccineClassBadge rule={r} />
                    </div>
                    <p className={`text-[12px] ${isOverdue ? 'text-[var(--nimi-status-danger)]' : 'text-[var(--nimi-text-muted)]'}`}>
                      {isOverdue ? i18nText('Vaccine.page.overdueWindow', { start: formatAge(r.triggerAge.startMonths), end: formatAge(r.triggerAge.endMonths) }) : i18nText('Vaccine.page.recommendedWindow', { start: formatAge(r.triggerAge.startMonths), end: r.triggerAge.endMonths === -1 ? i18nText('Vaccine.page.noUpperLimit') : formatAge(r.triggerAge.endMonths) })}
                    </p>
                  </div>
                  <Button onClick={() => setRecordingRuleId(r.ruleId)} tone="primary" size="sm">{i18nText('Vaccine.page.record')}</Button>
                </div>
              );
            })}
          </div>
        </Surface>
      )}

      {/* ── Historical unrecorded — collapsible ──────────── */}
      {historicalUnrecorded.length > 0 && (
        <HistoricalSection rules={historicalUnrecorded}
          onRecord={(id) => setRecordingRuleId(id)} />
      )}

      {/* ── View toggle ──────────────────────────────────────── */}
      {deleteError ? (
        <p className="text-[12px] mb-3 text-[var(--nimi-status-danger)]">{deleteError}</p>
      ) : null}
      <div className="flex gap-1 rounded-full bg-[var(--nimi-action-ghost-hover)] p-1 mb-5 w-fit">
        {([['timeline', i18nText('Vaccine.tab.timeline')], ['list', i18nText('Vaccine.tab.list')]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all ${activeTab === k ? 'bg-[var(--nimi-surface-card)] text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)]' : 'text-[var(--nimi-text-muted)]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Timeline view ────────────────────────────────────── */}
      {activeTab === 'timeline' && (
        <div className="relative">
          <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-[var(--nimi-border-subtle)]" />

          {ageBuckets.map((bucket) => {
            const isCurrent = ageMonths >= bucket.startMonth && ageMonths <= bucket.endMonth;
            const isFuture = ageMonths < bucket.startMonth;
            const bucketComplete = bucket.rules.every((r) => recordedRuleIds.has(r.ruleId));

            return (
              <div key={bucket.label} ref={isCurrent ? currentBucketRef : undefined} className={`relative pl-10 pb-6 ${isFuture ? 'opacity-40' : ''}`}>
                <div className={`absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center ${bucketComplete ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]' : isCurrent ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-card)]' : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-action-ghost-hover)]'}`}>
                  {bucketComplete && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
                  {isCurrent && !bucketComplete && <div className="w-[6px] h-[6px] rounded-full bg-[var(--nimi-action-primary-bg)]" />}
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[14px] font-bold ${isCurrent ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]'}`}>{bucket.label}</span>
                  {isCurrent && <span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]">{i18nText('Vaccine.page.currentStage')}</span>}
                  {bucketComplete && <span className="text-[12px] px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">{i18nText('Vaccine.page.stageComplete')}</span>}
                </div>

                <div className="space-y-1.5">
                  {bucket.rules.map((r) => {
                    const done = recordedRuleIds.has(r.ruleId);
                    const rec = records.find((x) => x.ruleId === r.ruleId);

                    return (
                      <div key={r.ruleId}
                        className={`flex items-center gap-2.5 rounded-2xl border p-2.5 transition-all duration-150 ${done ? 'border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_34%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))]' : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'}`}>
                        {done ? (
                          <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]">
                            <svg viewBox="0 0 12 12" className="w-3.5 h-3.5"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
                          </div>
                        ) : (
                          <div className="w-[28px] h-[28px] rounded-lg flex items-center justify-center text-[16px] shrink-0 bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)]">💉</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-[14px] font-medium truncate ${done ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]'}`}>{r.title}</p>
                            <VaccineClassBadge rule={r} />
                          </div>
                          <p className="text-[12px] truncate text-[var(--nimi-text-muted)]">
                            {done && rec ? i18nText('Vaccine.page.vaccinatedRecord', { date: fmtDate(rec.vaccinatedAt), hospital: rec.hospital ? ` · ${rec.hospital}` : '' }) : r.description}
                          </p>
                          {done && rec?.adverseReaction ? (
                            <p className="text-[12px] truncate text-[var(--nimi-status-warning)]">
                              {i18nText('Vaccine.page.reactionLabel', { text: rec.adverseReaction })}
                            </p>
                          ) : null}
                        </div>
                        {done ? (
                          deletingRuleId === r.ruleId ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[12px] text-[var(--nimi-status-danger)]">{i18nText('Vaccine.page.deletePrompt')}</span>
                              <Button onClick={() => void handleDeleteRecord(r.ruleId)} tone="danger" size="sm">{i18nText('Vaccine.page.deleteConfirm')}</Button>
                              <Button onClick={() => { setDeletingRuleId(null); setDeleteError(null); }} tone="ghost" size="sm">{i18nText('Vaccine.recordModal.cancel')}</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button onClick={() => setRecordingRuleId(r.ruleId)} tone="ghost" size="sm">{i18nText('Vaccine.page.change')}</Button>
                              <Button onClick={() => { setDeletingRuleId(r.ruleId); setDeleteError(null); }} tone="ghost" size="sm">{i18nText('Vaccine.page.delete')}</Button>
                            </div>
                          )
                        ) : (
                          <Button onClick={() => setRecordingRuleId(r.ruleId)} tone="ghost" size="sm" className="shrink-0">{i18nText('Vaccine.page.record')}</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view grouped by vaccine class. */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {([
            { label: i18nText('Vaccine.page.classOneTitle'), sub: i18nText('Vaccine.classOneSub'), rules: class1Rules, done: class1Total },
            { label: i18nText('Vaccine.page.classTwoTitle'), sub: i18nText('Vaccine.classTwoSub'), rules: class2Rules, done: class2Total },
          ] as const).map((group) => (
            <div key={group.label}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{group.label}</span>
                <span className="text-[12px] text-[var(--nimi-text-muted)]">{group.sub}</span>
                <span className="ml-auto text-[12px] text-[var(--nimi-text-muted)]">{group.done}/{group.rules.length}</span>
              </div>
              <div className="space-y-2">
                {group.rules.map((r) => {
                  const done = recordedRuleIds.has(r.ruleId);
                  const rec = records.find((x) => x.ruleId === r.ruleId);
                  const isOverdue = !done && ageMonths > r.triggerAge.endMonths && r.triggerAge.endMonths !== -1;

                  return (
                    <div key={r.ruleId} className={`flex items-center gap-3 rounded-2xl border p-3 ${done ? 'border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_34%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))]' : isOverdue ? 'border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))]' : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]'}`}>
                      {done ? (
                        <div className="w-[24px] h-[24px] rounded-full flex items-center justify-center shrink-0 bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]">
                          <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
                        </div>
                      ) : (
                        <div className={`w-[24px] h-[24px] rounded-full border-[1.5px] shrink-0 ${isOverdue ? 'border-[color-mix(in_srgb,var(--nimi-status-danger)_42%,var(--nimi-border-subtle))]' : 'border-[var(--nimi-border-subtle)]'}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[14px] font-medium truncate ${done ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-primary)]'}`}>{r.title}</p>
                          <VaccineClassBadge rule={r} />
                        </div>
                        <p className="text-[12px] text-[var(--nimi-text-muted)]">
                          {done && rec ? fmtDate(rec.vaccinatedAt) : `${formatAge(r.triggerAge.startMonths)}-${r.triggerAge.endMonths === -1 ? i18nText('Vaccine.page.noUpperLimit') : formatAge(r.triggerAge.endMonths)}`}
                          {isOverdue && i18nText('Vaccine.page.expiredSuffix')}
                        </p>
                        {done && rec?.adverseReaction ? (
                          <p className="text-[12px] truncate text-[var(--nimi-status-warning)]">
                            {i18nText('Vaccine.page.reactionLabel', { text: rec.adverseReaction })}
                          </p>
                        ) : null}
                      </div>
                      {done ? (
                        deletingRuleId === r.ruleId ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[12px] text-[var(--nimi-status-danger)]">{i18nText('Vaccine.page.deletePrompt')}</span>
                            <Button onClick={() => void handleDeleteRecord(r.ruleId)} tone="danger" size="sm">{i18nText('Vaccine.page.deleteConfirm')}</Button>
                            <Button onClick={() => { setDeletingRuleId(null); setDeleteError(null); }} tone="ghost" size="sm">{i18nText('Vaccine.recordModal.cancel')}</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button onClick={() => setRecordingRuleId(r.ruleId)} tone="ghost" size="sm">{i18nText('Vaccine.page.change')}</Button>
                            <Button onClick={() => { setDeletingRuleId(r.ruleId); setDeleteError(null); }} tone="ghost" size="sm">{i18nText('Vaccine.page.delete')}</Button>
                          </div>
                        )
                      ) : (
                        <Button onClick={() => setRecordingRuleId(r.ruleId)} tone="primary" size="sm">{i18nText('Vaccine.page.record')}</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Record modal ─────────────────────────────────────── */}
      {recordingRule && (
        <VaccineRecordModal
          rule={recordingRule}
          childId={child.childId}
          birthDate={child.birthDate}
          existing={records.find((x) => x.ruleId === recordingRule.ruleId) ?? null}
          onSave={async () => {
            await getVaccineRecords(child.childId).then(setRecords);
            clearRuleSearch();
          }}
          onClose={() => {
            setRecordingRuleId(null);
            clearRuleSearch();
          }}
        />
      )}

      {/* ── Custom vaccine modal ─────────────────────────────── */}
      {showCustomModal && (
        <VaccineCaptureModal
          child={{ childId: child.childId, birthDate: child.birthDate }}
          onSaved={reload}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </ProfileDetailShell>
  );
}
