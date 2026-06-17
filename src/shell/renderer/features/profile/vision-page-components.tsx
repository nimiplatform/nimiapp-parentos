import { Button, cn, DatePicker, StatusBadge, Surface, TextField } from '@nimiplatform/kit/ui';
import {
  HealthRecordModalShell,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import {
  clearVisionFollowupSettings,
  insertMedicalEvent,
  setVisionFollowupSettings,
  VISION_FOLLOWUP_CADENCE_DEFAULT,
  VISION_FOLLOWUP_CADENCE_MAX,
  VISION_FOLLOWUP_CADENCE_MIN,
} from '../../bridge/sqlite-bridge.js';
import type { MeasurementRow, VisionFollowupSettings } from '../../bridge/sqlite-bridge.js';
import { GROWTH_STANDARDS } from '../../knowledge-base/index.js';
import type { GrowthTypeId } from '../../knowledge-base/gen/growth-standards.gen.js';
import { AppSelect } from '../../app-shell/app-select.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import { buildReferenceBand, CHART_OPTIONS, describeReferenceStatus } from './vision-data.js';
import type { ReferencePoint } from './vision-data.js';
import { i18nText } from '../../i18n/index.js';


export const EARLY_SCREENING_MAX_AGE_MONTHS = 72;
export const VISION_SCREENING_PREFIX = 'vision:';

const SCREENING_TYPES = [
  { key: 'red-reflex', labelKey: 'redReflex', emoji: '🔴', desc: i18nText('Vision.screening.description.redReflex'), minAge: 0, maxAge: 12 },
  { key: 'fixation-tracking', labelKey: 'fixationTracking', emoji: '👁️', desc: i18nText('Vision.screening.description.fixationTracking'), minAge: 2, maxAge: 12 },
  { key: 'cover-test', labelKey: 'coverTest', emoji: '🫣', desc: i18nText('Vision.screening.description.coverTest'), minAge: 4, maxAge: EARLY_SCREENING_MAX_AGE_MONTHS },
  { key: 'photoscreener', labelKey: 'photoscreener', emoji: '📷', desc: i18nText('Vision.screening.description.photoscreener'), minAge: 6, maxAge: 48 },
  { key: 'tear-duct', labelKey: 'tearDuct', emoji: '💧', desc: i18nText('Vision.screening.description.tearDuct'), minAge: 0, maxAge: 24 },
  { key: 'eye-checkup', labelKey: 'eyeCheckup', emoji: '🩺', desc: i18nText('Vision.screening.description.eyeCheckup'), minAge: 0, maxAge: EARLY_SCREENING_MAX_AGE_MONTHS },
] as const;

const SCREENING_RESULT_OPTIONS = [
  { key: 'pass', labelKey: 'resultPass', tone: 'success' },
  { key: 'refer', labelKey: 'resultRefer', tone: 'danger' },
  { key: 'inconclusive', labelKey: 'resultInconclusive', tone: 'warning' },
] as const;

/* ── ScreeningModal — admit a new early screening to medical_events ─ */

export function ScreeningModal({
  childId,
  birthDate,
  ageMonths,
  onClose,
  onSave,
}: {
  childId: string;
  birthDate: string;
  ageMonths: number;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const availableTypes = SCREENING_TYPES.filter((t) => ageMonths >= t.minAge && ageMonths <= t.maxAge);
  const [formType, setFormType] = useState<string>(availableTypes[0]?.key ?? 'eye-checkup');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formResult, setFormResult] = useState('pass');
  const [formHospital, setFormHospital] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const handleSubmit = async () => {
    if (!formDate) return;
    const screeningMeta = SCREENING_TYPES.find((t) => t.key === formType);
    const screeningLabel = screeningMeta ? t(`Profile.rich.vision.screeningTypes.${screeningMeta.labelKey}`) : formType;
    const now = isoNow();
    await insertMedicalEvent({
      eventId: ulid(),
      childId,
      eventType: 'checkup',
      title: t('Profile.rich.vision.screeningTitle', { label: screeningLabel }),
      eventDate: formDate,
      endDate: null,
      ageMonths: computeAgeMonthsAt(birthDate, formDate),
      severity: null,
      result: formResult,
      hospital: formHospital || null,
      medication: null,
      dosage: null,
      notes: `${VISION_SCREENING_PREFIX}${formType}${formNotes ? `\n${formNotes}` : ''}`,
      photoPath: null,
      now,
    });
    onSave();
    onClose();
  };

  return (
    <HealthRecordModalShell open size="M" onClose={onClose}>
      <ModalHeader title={t('Profile.rich.vision.screeningModalTitle')} icon="👁️" onClose={onClose} />
      <ModalContent>
      <p className="text-[13px] mb-2 text-[var(--nimi-text-muted)]">{t('Profile.rich.vision.screeningItem')}</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {availableTypes.map((screeningType) => (
            <button
              key={screeningType.key}
              onClick={() => setFormType(screeningType.key)}
              className={cn(
                'flex items-center gap-1 rounded-2xl px-3 py-1.5 text-[13px] transition-all',
                formType === screeningType.key
                  ? 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]'
                  : 'bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]',
              )}
            >
              <span>{screeningType.emoji}</span> {t(`Profile.rich.vision.screeningTypes.${screeningType.labelKey}`)}
            </button>
          ))}
        </div>

        <p className="text-[13px] mb-2 text-[var(--nimi-text-muted)]">{t('Profile.rich.vision.screeningResult')}</p>
        <div className="flex gap-1.5 mb-4">
          {SCREENING_RESULT_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setFormResult(r.key)}
              className={cn(
                'rounded-2xl px-3 py-1.5 text-[13px] font-medium transition-all',
                formResult === r.key
                  ? {
                    success: 'bg-[var(--nimi-status-success)] text-[var(--nimi-action-primary-text)]',
                    danger: 'bg-[var(--nimi-status-danger)] text-[var(--nimi-action-primary-text)]',
                    warning: 'bg-[var(--nimi-status-warning)] text-[var(--nimi-action-primary-text)]',
                  }[r.tone]
                  : 'bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]',
              )}
            >
              {t(`Profile.rich.vision.${r.labelKey}`)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-[13px] mb-1 text-[var(--nimi-text-muted)]">{t('Profile.rich.common.date')}</p>
            <DatePicker value={formDate} onChange={setFormDate} />
          </div>
          <div>
            <p className="text-[13px] mb-1 text-[var(--nimi-text-muted)]">{t('Profile.rich.vision.hospitalOrClinic')}</p>
            <TextField
              type="text"
              value={formHospital}
              onChange={(e) => setFormHospital(e.target.value)}
              placeholder={t('Profile.rich.common.optional')}
              className="w-full"
            />
          </div>
        </div>

        <div className="mb-4">
          <p className="text-[13px] mb-1 text-[var(--nimi-text-muted)]">{t('Profile.rich.vision.notes')}</p>
          <TextField
            type="text"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder={t('Profile.rich.common.optional')}
            className="w-full"
          />
        </div>
      </ModalContent>
      <ModalFooter>
        <Button onClick={onClose} tone="ghost" size="md">
          {t('Profile.rich.common.cancel')}
        </Button>
        <Button onClick={() => void handleSubmit()} tone="primary" size="md">
          {t('Profile.rich.common.save')}
        </Button>
      </ModalFooter>
    </HealthRecordModalShell>
  );
}

/* ── Sources tooltip ─────────────────────────────────────────────── */

export function SourcesTooltip() {
  return (
    <div className="group relative">
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center cursor-help transition-colors text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      <div
        className="pointer-events-none absolute left-0 top-7 z-50 w-[340px] rounded-xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-overlay)] p-4 text-[13px] leading-relaxed text-[var(--nimi-text-secondary)] opacity-0 shadow-[var(--nimi-elevation-floating)] transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100"
      >
        <p className="text-[14px] font-semibold text-[var(--nimi-text-primary)] mb-2.5">{i18nText('Vision.sources.title')}</p>
        <ul className="space-y-2.5">
          <li>
            <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vision.sources.axialPercentile.title')}</span>
            <span className="block text-[12px] text-[var(--nimi-text-secondary)] mt-0.5">{i18nText('Vision.sources.axialPercentile.citation')}</span>
            <span className="block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Vision.sources.axialPercentile.journal')}</span>
          </li>
          <li>
            <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vision.sources.hyperopiaReserve.title')}</span>
            <span className="block text-[12px] text-[var(--nimi-text-secondary)] mt-0.5">{i18nText('Vision.sources.hyperopiaReserve.citation')}</span>
            <span className="block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Vision.sources.hyperopiaReserve.journal')}</span>
          </li>
          <li>
            <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vision.sources.axialManagement.title')}</span>
            <span className="block text-[12px] text-[var(--nimi-text-secondary)] mt-0.5">{i18nText('Vision.sources.axialManagement.citation')}</span>
          </li>
          <li>
            <span className="text-[var(--nimi-action-primary-bg)] font-medium">{i18nText('Vision.sources.myopiaPreventionGuide.title')}</span>
            <span className="block text-[12px] text-[var(--nimi-text-secondary)] mt-0.5">{i18nText('Vision.sources.myopiaPreventionGuide.citation')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ── Next-visit — projected follow-up + user-customised cadence ───── */

const CADENCE_PRESETS: Array<{ months: number }> = [
  { months: 1 },
  { months: 3 },
  { months: 6 },
  { months: 12 },
];

interface NextStepsResolved {
  /** ISO date the parent should schedule the next visit. */
  visitDate: string;
  /** True when the parent overrode the next visit with a manual date. */
  isCustomDate: boolean;
  /** Months between visits — either the user's setting or the default. */
  cadenceMonths: number;
  /** True when the user has saved any override (cadence or custom date). */
  isUserOverride: boolean;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthsUntil(iso: string, today: Date): number {
  const d = new Date(iso);
  const ms = d.getTime() - today.getTime();
  return Math.round(ms / (30 * 24 * 3600 * 1000));
}

function fmtRelative(iso: string, today: Date): string {
  const m = monthsUntil(iso, today);
  if (m < 0) return i18nText('Vision.followup.relative.pastMonths', { months: Math.abs(m) });
  if (m === 0) return i18nText('Vision.followup.relative.thisMonth');
  return i18nText('Vision.followup.relative.futureMonths', { months: m });
}

export function resolveNextVisit(
  latestExamDate: string | null,
  settings: VisionFollowupSettings | null,
): NextStepsResolved | null {
  const cadence = settings?.cadenceMonths ?? VISION_FOLLOWUP_CADENCE_DEFAULT;
  if (settings?.customNextDate) {
    return {
      visitDate: settings.customNextDate,
      isCustomDate: true,
      cadenceMonths: cadence,
      isUserOverride: true,
    };
  }
  if (!latestExamDate) return null;
  return {
    visitDate: addMonths(latestExamDate, cadence),
    isCustomDate: false,
    cadenceMonths: cadence,
    isUserOverride: settings != null,
  };
}

/**
 * Projected next-visit card — rendered as the single "future" entry at the
 * top of the exam timeline. Visually mirrors the orthodontic journey card:
 * emoji/icon chip, title, and projected badge.
 */
export function NextVisitCard({
  resolved,
  today,
}: {
  resolved: NextStepsResolved;
  today: Date;
}) {
  const { t } = useTranslation();
  return (
    <Surface
      as="article"
      tone="card"
      elevation="raised"
      padding="none"
      className="border-transparent p-5"
      style={{ opacity: 0.92 }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,transparent)] text-[var(--nimi-action-primary-bg)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--nimi-text-primary)]">
            <span>{t('Profile.rich.vision.nextReview')}</span>
            <StatusBadge tone="info" className="px-2 py-0.5 text-[10px] font-medium">
              {i18nText('Vision.followup.projectedBadge')}
            </StatusBadge>
            {resolved.isCustomDate && (
              <StatusBadge tone="neutral" className="px-1.5 py-0.5 text-[10px]">
                {t('Profile.rich.vision.custom')}
              </StatusBadge>
            )}
            {!resolved.isCustomDate && resolved.isUserOverride && (
              <StatusBadge tone="neutral" className="px-1.5 py-0.5 text-[10px]">
                {t('Profile.rich.vision.everyMonths', { months: resolved.cadenceMonths })}
              </StatusBadge>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[var(--nimi-text-muted)]">
            {resolved.visitDate} · {fmtRelative(resolved.visitDate, today)}
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function NextStepsEditor({
  childId,
  latestExamDate,
  settings,
  onClose,
  onSaved,
}: {
  childId: string;
  latestExamDate: string | null;
  settings: VisionFollowupSettings | null;
  onClose: () => void;
  onSaved: (next: VisionFollowupSettings | null) => void;
}) {
  const { t } = useTranslation();
  const [cadence, setCadence] = useState<number>(settings?.cadenceMonths ?? VISION_FOLLOWUP_CADENCE_DEFAULT);
  const [customDate, setCustomDate] = useState<string>(settings?.customNextDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomCadence = !CADENCE_PRESETS.some((p) => p.months === cadence);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (cadence < VISION_FOLLOWUP_CADENCE_MIN || cadence > VISION_FOLLOWUP_CADENCE_MAX) {
        setError(t('Profile.rich.vision.cadenceRangeError', { min: VISION_FOLLOWUP_CADENCE_MIN, max: VISION_FOLLOWUP_CADENCE_MAX }));
        return;
      }
      const trimmedDate = customDate.trim();
      const customNextDate = trimmedDate ? trimmedDate : null;
      if (customNextDate && !/^\d{4}-\d{2}-\d{2}$/.test(customNextDate)) {
        setError(t('Profile.rich.vision.customDateFormatError'));
        return;
      }
      await setVisionFollowupSettings({
        childId,
        cadenceMonths: cadence,
        customNextDate,
        now: isoNow(),
      });
      onSaved({
        childId,
        cadenceMonths: cadence,
        customNextDate,
        createdAt: settings?.createdAt ?? isoNow(),
        updatedAt: isoNow(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Profile.rich.vision.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetToSystem = async () => {
    setSaving(true);
    setError(null);
    try {
      await clearVisionFollowupSettings(childId);
      onSaved(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Profile.rich.vision.saveFailed'));
      setSaving(false);
    }
  };

  return (
    <Surface
      tone="panel"
      material="solid"
      elevation="base"
      padding="none"
      className="rounded-2xl mt-1 mb-1 mx-1 px-3.5 pb-3 pt-3.5"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2 text-[var(--nimi-text-muted)]">
        {t('Profile.rich.vision.followupFrequency')}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CADENCE_PRESETS.map((p) => (
          <button
            key={p.months}
            onClick={() => setCadence(p.months)}
            className={cn(
              'px-3 py-1.5 text-[12px] rounded-full border-0 cursor-pointer transition-all',
              cadence === p.months
                ? 'bg-[var(--nimi-accent)] text-[var(--nimi-action-primary-text)]'
                : 'bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-secondary)] hover:bg-[var(--nimi-action-ghost-hover)]',
            )}
          >
            {p.months} {t('Profile.rich.vision.monthsShort')}
          </button>
        ))}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
            isCustomCadence
              ? 'bg-[var(--nimi-accent-soft)] text-[var(--nimi-accent)]'
              : 'bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)]',
          )}
        >
          <span className="text-[12px]">{t('Profile.rich.vision.custom')}</span>
          <input
            type="number"
            min={VISION_FOLLOWUP_CADENCE_MIN}
            max={VISION_FOLLOWUP_CADENCE_MAX}
            value={cadence}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setCadence(Math.round(n));
            }}
            className="w-12 text-center bg-transparent border-0 outline-none text-[12px] tabular-nums font-mono"
            aria-label={i18nText('Vision.followup.aria.customCadence')}
          />
          <span className="text-[12px]">{t('Profile.rich.vision.monthsShort')}</span>
        </div>
      </div>

      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2 text-[var(--nimi-text-muted)]">
        {t('Profile.rich.vision.customNextDate')} <span className="font-normal normal-case lowercase text-[var(--nimi-field-placeholder)]">· {t('Profile.rich.vision.customNextDateHint')}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <DatePicker
          value={customDate}
          onChange={setCustomDate}
          className="flex-1 text-[13px] rounded-xl px-3 py-2 border-0 outline-none"
        />
        {customDate && (
          <button
            onClick={() => setCustomDate('')}
            className="text-[11px] px-2.5 py-1.5 rounded-full border-0 cursor-pointer bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]"
            aria-label={i18nText('Vision.followup.aria.clearCustomDate')}
          >
            {t('Profile.rich.vision.clear')}
          </button>
        )}
      </div>
      <div className="text-[11px] mb-3 text-[var(--nimi-field-placeholder)]">
        {latestExamDate
          ? t('Profile.rich.vision.cadenceSuggestion', { months: cadence, date: addMonths(latestExamDate, cadence) })
          : t('Profile.rich.vision.noAnchor')}
      </div>

      {error && (
        <div className="rounded-xl mb-2 px-3 py-2 text-[12px] bg-[color-mix(in_srgb,var(--nimi-status-danger)_12%,transparent)] text-[var(--nimi-status-danger)]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        {settings ? (
          <button
            onClick={() => void handleResetToSystem()}
            disabled={saving}
            className="text-[11px] cursor-pointer border-0 bg-transparent text-[var(--nimi-text-muted)] disabled:opacity-50"
          >
            {t('Profile.rich.vision.resetToSystem')}
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[12px] px-3 py-1.5 rounded-full border-0 cursor-pointer bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-secondary)] disabled:opacity-50 hover:bg-[var(--nimi-action-ghost-hover)]"
          >
            {t('Profile.rich.common.cancel')}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            aria-label={i18nText('Vision.followup.aria.save')}
            className="text-[12px] px-4 py-1.5 rounded-full border-0 cursor-pointer bg-[var(--nimi-accent)] text-[var(--nimi-action-primary-text)] disabled:opacity-50"
          >
            {saving ? t('Profile.rich.common.saving') : t('Profile.rich.common.save')}
          </button>
        </div>
      </div>
    </Surface>
  );
}

/* ── Trend chart card ────────────────────────────────────────────── */

export function TrendChartCard({
  measurements,
  chartType,
  gender,
  onChartTypeChange,
}: {
  measurements: MeasurementRow[];
  chartType: GrowthTypeId;
  gender: string;
  onChartTypeChange: (v: GrowthTypeId) => void;
}) {
  const { t } = useTranslation();
  const typeInfo = GROWTH_STANDARDS.find((s) => s.typeId === chartType);
  const chartData = measurements
    .filter((m) => m.typeId === chartType)
    .sort((a, b) => a.ageMonths - b.ageMonths)
    .map((m) => ({ age: m.ageMonths, value: m.value, date: m.measuredAt.split('T')[0] }));

  // Age-shaped reference overlay — a shaded normal band (vision /
  // hyperopia reserve) or P50/P75 lines (axial length). Reference
  // points share the measurement ages, so they merge by `age`.
  const reference = buildReferenceBand(chartType, gender, chartData.map((d) => d.age));
  const refByAge = new Map<number, ReferencePoint>();
  if (reference) {
    for (const point of reference.points) refByAge.set(point.age, point);
  }
  const mergedData = chartData.map((d) => {
    const ref = refByAge.get(d.age);
    return {
      ...d,
      band: ref?.bandLow != null && ref.bandHigh != null ? [ref.bandLow, ref.bandHigh] : undefined,
      median: ref?.median,
      critical: ref?.critical,
    };
  });
  const latestValue = chartData[chartData.length - 1]?.value ?? null;
  const refStatus = reference && latestValue != null
    ? describeReferenceStatus(reference, latestValue)
    : null;

  return (
    <Surface
      tone="card"
      material="glass-regular"
      elevation="raised"
      padding="none"
      className="rounded-3xl p-5"
    >
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">
            {t('Profile.rich.vision.curveTitle', { metric: typeInfo?.displayName ?? t('Profile.rich.vision.curveFallback') })}
          </div>
          <div className="text-[11px] mt-0.5 text-[var(--nimi-text-muted)]">
            {t('Profile.rich.vision.measurementCount', { count: chartData.length })}
          </div>
        </div>
        <AppSelect
          value={chartType}
          onChange={(v) => onChartTypeChange(v as GrowthTypeId)}
          options={CHART_OPTIONS.map((o) => ({ value: o.typeId, label: o.label }))}
          aria-label={t('Profile.rich.vision.curveFallback')}
          className="w-36 shrink-0"
        />
      </div>
      {chartData.length === 0 ? (
        <div className="p-8 text-center text-[var(--nimi-text-muted)]">
          <span className="text-[13px]">{t('Profile.rich.vision.emptyMetric', { metric: typeInfo?.displayName ?? '' })}</span>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={mergedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 10 }}
                label={{ value: i18nText('Vision.chart.ageMonthsAxis'), position: 'insideBottom', offset: -4, fontSize: 10 }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{ value: typeInfo?.unit ?? '', angle: -90, position: 'insideLeft', fontSize: 10 }}
              />
              <Tooltip
                formatter={(v, name) => {
                  const text = Array.isArray(v) ? `${v[0]}~${v[1]}` : `${v}`;
                  return [`${text}${typeInfo?.unit ? ` ${typeInfo.unit}` : ''}`, name];
                }}
                labelFormatter={(a) => i18nText('Vision.chart.ageMonthsTooltip', { months: a })}
              />
              {reference?.kind === 'band' && (
                <Area
                  type="monotone"
                  dataKey="band"
                  name={i18nText('Vision.chart.sameAgeReferenceRange')}
                  stroke="none"
                  fill="var(--nimi-accent)"
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {reference?.kind === 'percentile' && (
                <Line
                  type="monotone"
                  dataKey="median"
                  name={i18nText('Vision.chart.sameAgeMedianP50')}
                  stroke="var(--nimi-text-muted)"
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {reference?.kind === 'percentile' && (
                <Line
                  type="monotone"
                  dataKey="critical"
                  name={i18nText('Vision.chart.sameAgeCriticalP75')}
                  stroke="var(--nimi-status-warning)"
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                name={typeInfo?.displayName ?? i18nText('Vision.chart.valueFallback')}
                stroke="var(--nimi-accent)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--nimi-accent)' }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          {reference && (reference.caption || refStatus) && (
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--nimi-text-muted)]">
              {reference.caption && <span>{reference.caption}</span>}
              {refStatus && <span className="text-[var(--nimi-text-secondary)]">· {refStatus}</span>}
            </div>
          )}
        </>
      )}
    </Surface>
  );
}
