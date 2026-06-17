import { Button, DashedAddButton, DatePicker, Surface, TextField } from '@nimiplatform/kit/ui';
import { useState, useEffect, useMemo } from 'react';
import { computeAgeMonthsAt, useAppStore } from '../../app-shell/app-store.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { insertMeasurement, getMeasurements, saveAttachment, getAttachments, deleteAttachment } from '../../bridge/sqlite-bridge.js';
import type { MeasurementRow, AttachmentRow } from '../../bridge/sqlite-bridge.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import { GROWTH_STANDARDS } from '../../knowledge-base/index.js';
import { catchLog, catchLogThen } from '../../infra/telemetry/catch-log.js';
import {
  analyzeCheckupSheetOCR,
  getCheckupOCRDisplayMessage,
  hasCheckupOCRRuntime,
  readImageFileAsDataUrl,
  type OCRMeasurementCandidate,
} from './checkup-ocr.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { i18nText } from '../../i18n/index.js';


type Status = 'idle' | 'analyzing' | 'review' | 'importing' | 'done';
type ReportMeasurementCategory = 'lab' | 'eye' | 'boneAge' | 'growth';

const TYPE_EMOJI: Record<string, string> = {
  height: '📏', weight: '⚖️', 'head-circumference': '📐', bmi: '🏃',
  'vision-left': '👁️', 'vision-right': '👁️',
  'corrected-vision-left': '👓', 'corrected-vision-right': '👓',
  'refraction-sph-left': '🔬', 'refraction-sph-right': '🔬',
  'refraction-cyl-left': '🔬', 'refraction-cyl-right': '🔬',
  'axial-length-left': '🔬', 'axial-length-right': '🔬',
  'lab-vitamin-d': '🧪', 'lab-ferritin': '🩸', 'lab-hemoglobin': '🩸',
  'lab-calcium': '🧪', 'lab-zinc': '🧪',
  'bone-age': '🦴',
};

const OWNER_TABLE_LABELS: Record<string, { labelKey: string; emoji: string }> = {
  dental_records: { labelKey: 'ReportUpload.ownerTable.dentalRecords', emoji: '🦷' },
  health_record_events: { labelKey: 'ReportUpload.ownerTable.healthRecordEvents', emoji: '📄' },
  medical_events: { labelKey: 'ReportUpload.ownerTable.medicalEvents', emoji: '🏥' },
  vaccine_records: { labelKey: 'ReportUpload.ownerTable.vaccineRecords', emoji: '💉' },
  milestone_records: { labelKey: 'ReportUpload.ownerTable.milestoneRecords', emoji: '🎯' },
};

const REPORT_CATEGORY_META: Record<ReportMeasurementCategory, { labelKey: string; emoji: string }> = {
  lab: { labelKey: 'ReportUpload.category.lab', emoji: '🧪' },
  eye: { labelKey: 'ReportUpload.category.eye', emoji: '👁️' },
  boneAge: { labelKey: 'ReportUpload.category.boneAge', emoji: '🦴' },
  growth: { labelKey: 'ReportUpload.category.growth', emoji: '📏' },
};

function getDisplayInfo(typeId: string) {
  const std = GROWTH_STANDARDS.find((s) => s.typeId === typeId);
  return { name: std?.displayName ?? typeId, unit: std?.unit ?? '', emoji: TYPE_EMOJI[typeId] ?? '📋' };
}

function ownerTableLabel(ownerTable: string): string {
  const meta = OWNER_TABLE_LABELS[ownerTable];
  return meta ? `${meta.emoji} ${i18nText(meta.labelKey)}` : ownerTable;
}

function formatAgeMonths(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (ageMonths < 24) return i18nText('Common.age.months', { months: ageMonths });
  if (months > 0) return i18nText('Common.age.yearsMonths', { years, months });
  return i18nText('Common.age.years', { years });
}

function measurementCategory(typeId: string): ReportMeasurementCategory {
  if (typeId.startsWith('lab-')) return 'lab';
  if (
    typeId.includes('vision')
    || typeId.includes('axial')
    || typeId.includes('refraction')
    || typeId.includes('corneal')
    || typeId.includes('iop')
    || typeId.includes('acd')
    || typeId.includes('lt-')
  ) {
    return 'eye';
  }
  if (typeId === 'bone-age') return 'boneAge';
  return 'growth';
}

export default function ReportUploadPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);

  const [runtimeAvailable, setRuntimeAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Array<OCRMeasurementCandidate & { selected: boolean }>>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [allMeasurements, setAllMeasurements] = useState<MeasurementRow[]>([]);
  const [reportAttachments, setReportAttachments] = useState<Map<string, AttachmentRow>>(new Map());
  const [allAttachments, setAllAttachments] = useState<AttachmentRow[]>([]);
  const [attachFilter, setAttachFilter] = useState<string>('all');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'upload' | 'library' | 'attachments'>('upload');

  useEffect(() => {
    hasCheckupOCRRuntime().then(setRuntimeAvailable).catch(catchLogThen('report-upload', 'action:check-ocr-runtime-failed', () => setRuntimeAvailable(false)));
  }, []);

  useEffect(() => {
    if (!activeChildId) return;
    getMeasurements(activeChildId).then(setAllMeasurements).catch(catchLog('report-upload', 'action:load-measurements-failed'));
    loadAllAttachments(activeChildId);
  }, [activeChildId]);

  const loadAllAttachments = (childId: string) => {
    getAttachments(childId).then((all) => {
      setAllAttachments(all);
      const m = new Map<string, AttachmentRow>();
      for (const a of all) {
        if (a.ownerTable === 'health_record_events' && a.ownerId.startsWith('detail-measurement:')) {
          m.set(a.ownerId.slice('detail-measurement:'.length), a);
        }
      }
      setReportAttachments(m);
    }).catch(catchLog('report-upload', 'action:load-attachments-failed'));
  };

  const reloadMeasurements = () => {
    if (!activeChildId) return;
    getMeasurements(activeChildId).then(setAllMeasurements).catch(catchLog('report-upload', 'action:load-measurements-failed'));
    loadAllAttachments(activeChildId);
  };

  // Group OCR-sourced measurements by date for report library
  const reportGroups = useMemo(() => {
    const ocrItems = allMeasurements.filter((m) => m.source === 'ocr');
    const groups = new Map<string, MeasurementRow[]>();
    for (const m of ocrItems) {
      const date = m.measuredAt.split('T')[0] ?? m.measuredAt;
      const existing = groups.get(date);
      if (existing) existing.push(m);
      else groups.set(date, [m]);
    }
    return [...groups.entries()]
      .map(([date, items]) => ({ date, items, ageMonths: items[0]?.ageMonths ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allMeasurements]);

  // Attachments view data
  const filteredAttachments = useMemo(
    () => attachFilter === 'all' ? allAttachments : allAttachments.filter((a) => a.ownerTable === attachFilter),
    [allAttachments, attachFilter],
  );
  const attachGroups = useMemo(() => {
    const m = new Map<string, AttachmentRow[]>();
    for (const a of filteredAttachments) {
      const date = a.createdAt.split('T')[0] ?? a.createdAt;
      const existing = m.get(date);
      if (existing) existing.push(a);
      else m.set(date, [a]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredAttachments]);
  const attachOwnerTables = useMemo(
    () => [...new Set(allAttachments.map((a) => a.ownerTable))],
    [allAttachments],
  );

  const handleDeleteAttachment = async (id: string) => {
    try {
      await deleteAttachment(id);
      setAllAttachments((prev) => prev.filter((a) => a.attachmentId !== id));
    } catch { /* ignore */ }
  };

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('ReportUpload.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setImagePreview(dataUrl);
      setImageName(file.name);
      setStatus('idle');
      setCandidates([]);
    } catch (_error) {
      setError(i18nText('ReportUpload.error.readImageFailed'));
    }
  };

  const handleAnalyze = async () => {
    if (!imagePreview) return;
    setStatus('analyzing');
    setError(null);
    try {
      const result = await analyzeCheckupSheetOCR({ imageUrl: imagePreview });
      if (result.measurements.length === 0) {
        setError(i18nText('ReportUpload.error.noSupportedMeasurements'));
        setStatus('idle');
        return;
      }
      setCandidates(result.measurements.map((c) => ({ ...c, selected: true })));
      setStatus('review');
    } catch (error) {
      setError(getCheckupOCRDisplayMessage(error));
      setStatus('idle');
    }
  };

  const toggleCandidate = (idx: number) => {
    setCandidates((prev) => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  };

  const updateCandidate = (idx: number, field: 'value' | 'measuredAt', val: string) => {
    setCandidates((prev) => prev.map((c, i) =>
      i === idx ? { ...c, [field]: field === 'value' ? Number(val) : val } : c,
    ));
  };

  const handleImport = async () => {
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) { setError(i18nText('ReportUpload.error.selectAtLeastOne')); return; }

    setStatus('importing');
    setError(null);
    let count = 0;
    let firstMeasurementId: string | null = null;
    try {
      for (const c of selected) {
        const now = isoNow();
        const measurementId = ulid();
        if (!firstMeasurementId) firstMeasurementId = measurementId;
        await insertMeasurement({
          measurementId,
          childId: child.childId,
          typeId: c.typeId,
          value: c.value,
          measuredAt: c.measuredAt,
          ageMonths: computeAgeMonthsAt(child.birthDate, c.measuredAt),
          percentile: null,
          source: 'ocr',
          notes: c.notes,
          now,
        });
        count++;
      }

      // Save original report image as attachment
      if (imagePreview && firstMeasurementId) {
        try {
          const [header, base64] = imagePreview.split(',');
          const mimeMatch = header?.match(/data:([^;]+)/);
          const mimeType = mimeMatch?.[1] ?? 'image/jpeg';
          await saveAttachment({
            attachmentId: ulid(), childId: child.childId,
            ownerTable: 'health_record_events', ownerId: `detail-measurement:${firstMeasurementId}`,
            fileName: imageName ?? 'report.jpg', mimeType,
            imageBase64: base64 ?? '', caption: null, now: isoNow(),
          });
        } catch { /* attachment save failed, non-critical */ }
      }

      setImportedCount(count);
      setStatus('done');
      reloadMeasurements();
    } catch {
      setError(i18nText('ReportUpload.error.partialImportFailed', { count }));
      setStatus('review');
    }
  };

  const reset = () => {
    setStatus('idle');
    setImagePreview(null);
    setImageName(null);
    setCandidates([]);
    setError(null);
    setImportedCount(0);
  };

  return (
    <ProfileDetailShell
      title={i18nText('ReportUpload.title')}
      actions={
        <>
          {reportGroups.length > 0 && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] px-2.5 py-0.5 text-[13px] text-[var(--nimi-action-primary-bg)]">
              {i18nText('ReportUpload.badge.reportCount', { count: reportGroups.length })}
            </span>
          )}
          {allAttachments.length > 0 && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,var(--nimi-surface-card))] px-2.5 py-0.5 text-[13px] text-[var(--nimi-status-info)]">
              {i18nText('ReportUpload.badge.imageCount', { count: allAttachments.length })}
            </span>
          )}
        </>
      }
      subnav={
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-[var(--nimi-text-muted)]">
            {i18nText('ReportUpload.subtitle')}
          </p>
          <div className="flex gap-1 rounded-full bg-[var(--nimi-action-ghost-hover)] p-1 w-fit">
            {([
              ['upload', i18nText('ReportUpload.tab.upload')],
              ['library', i18nText('ReportUpload.tab.library')],
              ['attachments', i18nText('ReportUpload.tab.attachments')],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setActiveView(k)}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all ${activeView === k ? 'bg-[var(--nimi-surface-card)] text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)]' : 'text-[var(--nimi-text-muted)]'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {/* ════════════════════════════════════════════════════════
         UPLOAD VIEW
         ════════════════════════════════════════════════════════ */}
      {activeView === 'upload' && <>

      {/* ── Step 1: Upload ──────────────────────────────────── */}
      {status !== 'done' && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="mb-4 rounded-3xl">
          {!imagePreview ? (
            <DashedAddButton
              shape="dropzone"
              icon={<span className="text-[36px]">📄</span>}
              label={i18nText('ReportUpload.upload.dropzoneLabel')}
              description={i18nText('ReportUpload.upload.dropzoneDescription')}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = () => void handleFileSelect(input.files?.[0] ?? null);
                input.click();
              }}
            />
          ) : (
            /* Preview + analyze */
            <div className="flex gap-4">
              <img src={imagePreview} alt={i18nText('ReportUpload.upload.previewAlt')}
                className="w-[160px] h-[200px] rounded-2xl border border-[var(--nimi-border-subtle)] object-cover" />
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{imageName}</p>
                  <p className="text-[13px] mt-1 text-[var(--nimi-text-muted)]">
                    {status === 'analyzing' ? i18nText('ReportUpload.upload.analyzingHint') : i18nText('ReportUpload.upload.readyHint')}
                  </p>
                  {runtimeAvailable === false && (
                    <p className="text-[13px] mt-2 text-amber-600">{i18nText('ReportUpload.error.ocrRuntimeUnavailable')}</p>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button onClick={() => void handleAnalyze()}
                    disabled={status === 'analyzing' || runtimeAvailable === false}
                    tone="primary"
                    size="md">
                    {status === 'analyzing' ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3.5 h-3.5 border-2 border-[color-mix(in_srgb,var(--nimi-action-primary-text)_30%,transparent)] border-t-[var(--nimi-action-primary-text)] rounded-full animate-spin" />
                        {i18nText('ReportUpload.action.recognizing')}
                      </span>
                    ) : i18nText('ReportUpload.action.startRecognition')}
                  </Button>
                  <Button onClick={reset} tone="ghost" size="md">{i18nText('ReportUpload.action.reselect')}</Button>
                </div>
              </div>
            </div>
          )}
        </Surface>
      )}

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-2xl border border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-4 py-3 text-[14px] text-[var(--nimi-status-danger)]">
          {error}
        </div>
      )}

      {/* ── Step 2: Review candidates ──────────────────────── */}
      {status === 'review' && candidates.length > 0 && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="mb-4 rounded-3xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">
                {i18nText('ReportUpload.review.title', { count: candidates.length })}
              </h3>
              <p className="text-[13px] mt-0.5 text-[var(--nimi-text-muted)]">
                {i18nText('ReportUpload.review.hint')}
              </p>
            </div>
            <span className="rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] px-2 py-0.5 text-[13px] text-[var(--nimi-action-primary-bg)]">
              {i18nText('ReportUpload.review.selectedCount', { selected: candidates.filter((c) => c.selected).length, total: candidates.length })}
            </span>
          </div>

          <div className="space-y-2">
            {candidates.map((c, i) => {
              const info = getDisplayInfo(c.typeId);
              return (
                <div key={i}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-all ${c.selected ? 'border-[var(--nimi-action-primary-bg)] bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_8%,var(--nimi-surface-card))]' : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] opacity-50'}`}
                  onClick={() => toggleCandidate(i)}>
                  {/* Checkbox */}
                  <div className={`w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all ${c.selected ? 'border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]' : 'border-[var(--nimi-border-strong)]'}`}>
                    {c.selected && <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
                  </div>
                  {/* Icon + name */}
                  <span className="text-[18px]">{info.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{info.name}</p>
                    {c.notes && <p className="text-[12px] truncate text-[var(--nimi-text-muted)]">{c.notes}</p>}
                  </div>
                  {/* Value (editable) */}
                  <TextField type="number" value={c.value}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateCandidate(i, 'value', e.target.value)}
                    className="w-20"
                    inputClassName="text-right text-[16px] font-bold text-[var(--nimi-text-primary)]" />
                  <span className="text-[12px] w-12 text-[var(--nimi-text-muted)]">{info.unit}</span>
                  {/* Date */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <DatePicker
                      value={c.measuredAt}
                      onChange={(nextDate) => updateCandidate(i, 'measuredAt', nextDate)}
                      className="text-[13px]"
                      size="small"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={() => void handleImport()}
              disabled={candidates.filter((c) => c.selected).length === 0}
              tone="primary"
              size="md"
              fullWidth>
              {i18nText('ReportUpload.action.confirmImport', { count: candidates.filter((c) => c.selected).length })}
            </Button>
            <Button onClick={reset} tone="ghost" size="md">{i18nText('ReportUpload.action.cancel')}</Button>
          </div>
        </Surface>
      )}

      {/* ── Importing spinner ──────────────────────────────── */}
      {status === 'importing' && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="flex flex-col items-center rounded-3xl p-8">
          <span className="inline-block w-8 h-8 border-3 border-[var(--nimi-border-subtle)] border-t-[var(--nimi-text-primary)] rounded-full animate-spin mb-3" />
          <p className="text-[14px] text-[var(--nimi-text-primary)]">{i18nText('ReportUpload.importing')}</p>
        </Surface>
      )}

      {/* ── Step 3: Success ────────────────────────────────── */}
      {status === 'done' && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="flex flex-col items-center rounded-3xl p-8">
          <span className="text-[48px] mb-3">🎉</span>
          <h3 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('ReportUpload.success.title')}</h3>
          <p className="text-[14px] mt-1 mb-5 text-[var(--nimi-text-muted)]">
            {i18nText('ReportUpload.success.description', { count: importedCount, childName: child.displayName })}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => { reset(); setActiveView('library'); }} tone="primary" size="md">{i18nText('ReportUpload.action.viewLibrary')}</Button>
            <Button onClick={reset} tone="ghost" size="md">{i18nText('ReportUpload.action.continueUpload')}</Button>
          </div>
        </Surface>
      )}

      </>}

      {/* ════════════════════════════════════════════════════════
         REPORT LIBRARY VIEW
         ════════════════════════════════════════════════════════ */}
      {activeView === 'library' && (
        <div>
          {reportGroups.length === 0 ? (
            <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="rounded-3xl p-10 text-center">
              <span className="text-[36px]">📂</span>
              <p className="text-[16px] font-medium mt-3 text-[var(--nimi-text-primary)]">{i18nText('ReportUpload.library.emptyTitle')}</p>
              <p className="text-[13px] mt-1 text-[var(--nimi-text-muted)]">{i18nText('ReportUpload.library.emptyDescription')}</p>
            </Surface>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-[var(--nimi-border-subtle)]" />

              {reportGroups.map((group) => {
                const ageStr = formatAgeMonths(group.ageMonths);

                // Categorize items
                const categories = new Map<ReportMeasurementCategory, MeasurementRow[]>();
                for (const item of group.items) {
                  const cat = measurementCategory(item.typeId);
                  const existing = categories.get(cat);
                  if (existing) existing.push(item);
                  else categories.set(cat, [item]);
                }

                return (
                  <div key={group.date} className="relative pl-10 pb-5">
                    {/* Timeline dot */}
                    <div className="absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-card)] flex items-center justify-center">
                      <div className="w-[6px] h-[6px] rounded-full bg-[var(--nimi-action-primary-bg)]" />
                    </div>

                    {/* Date header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{group.date}</span>
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] px-2 py-0.5 text-[12px] text-[var(--nimi-action-primary-bg)]">{ageStr}</span>
                      <span className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('ReportUpload.library.dataItemCount', { count: group.items.length })}</span>
                    </div>

                    {/* Report card */}
                    <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="overflow-hidden rounded-3xl">
                      {[...categories.entries()].map(([cat, items]) => (
                        <div key={cat}>
                          <div className="bg-[var(--nimi-surface-panel)] px-4 py-2 text-[12px] font-medium text-[var(--nimi-text-muted)]">
                            {REPORT_CATEGORY_META[cat].emoji} {i18nText(REPORT_CATEGORY_META[cat].labelKey)}
                          </div>
                          {items.map((item) => {
                            const info = getDisplayInfo(item.typeId);
                            return (
                              <div key={item.measurementId} className="flex items-center justify-between border-t border-[var(--nimi-border-subtle)] px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[14px]">{info.emoji}</span>
                                  <span className="text-[13px] text-[var(--nimi-text-primary)]">{info.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{item.value}</span>
                                  <span className="text-[12px] text-[var(--nimi-text-muted)]">{info.unit}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {/* Original report image thumbnail */}
                      {(() => {
                        const att = group.items.map((m) => reportAttachments.get(m.measurementId)).find(Boolean);
                        return att ? (
                          <div className="flex items-center gap-2 border-t border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-2.5">
                            <img src={convertFileSrc(att.filePath)} alt={att.fileName}
                              className="h-16 w-12 rounded-2xl border border-[var(--nimi-border-subtle)] object-cover" />
                            <div>
                              <p className="text-[12px] font-medium text-[var(--nimi-text-muted)]">{i18nText('ReportUpload.library.originalReport')}</p>
                              <p className="text-[12px] text-[var(--nimi-text-muted)]">{att.fileName}</p>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </Surface>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         ATTACHMENTS VIEW
         ════════════════════════════════════════════════════════ */}
      {activeView === 'attachments' && (
        <div>
          {/* Source filter */}
          {attachOwnerTables.length > 1 && (
            <div className="flex gap-1 rounded-full bg-[var(--nimi-action-ghost-hover)] p-1 mb-4 w-fit">
              <button onClick={() => setAttachFilter('all')}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${attachFilter === 'all' ? 'bg-[var(--nimi-surface-card)] text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)]' : 'text-[var(--nimi-text-muted)]'}`}>
                {i18nText('ReportUpload.attachments.allFilter')}
              </button>
              {attachOwnerTables.map((ot) => {
                return (
                  <button key={ot} onClick={() => setAttachFilter(ot)}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${attachFilter === ot ? 'bg-[var(--nimi-surface-card)] text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)]' : 'text-[var(--nimi-text-muted)]'}`}>
                    {ownerTableLabel(ot)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {allAttachments.length === 0 && (
            <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="rounded-3xl p-10 text-center">
              <span className="text-[36px]">📂</span>
              <p className="text-[16px] font-medium mt-3 text-[var(--nimi-text-primary)]">{i18nText('ReportUpload.attachments.emptyTitle')}</p>
              <p className="text-[13px] mt-1 text-[var(--nimi-text-muted)]">{i18nText('ReportUpload.attachments.emptyDescription')}</p>
            </Surface>
          )}

          {/* Timeline grid */}
          {attachGroups.length > 0 && (
            <div className="relative">
              <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-[var(--nimi-border-subtle)]" />

              {attachGroups.map(([date, items]) => (
                <div key={date} className="relative pl-10 pb-5">
                  <div className="absolute left-[11px] top-1 w-[16px] h-[16px] rounded-full border-[2px] border-[var(--nimi-action-primary-bg)] bg-[var(--nimi-surface-card)] flex items-center justify-center">
                    <div className="w-[6px] h-[6px] rounded-full bg-[var(--nimi-action-primary-bg)]" />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{date}</span>
                    <span className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('ReportUpload.attachments.imageItemCount', { count: items.length })}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {items.map((a) => {
                      return (
                        <Surface key={a.attachmentId} tone="card" material="glass-regular" elevation="raised" padding="none" className="group relative overflow-hidden rounded-3xl">
                          <img
                            src={convertFileSrc(a.filePath)}
                            alt={a.fileName}
                            className="w-full h-28 object-cover cursor-pointer"
                            onClick={() => setPreviewUrl(convertFileSrc(a.filePath))}
                          />
                          <div className="px-2.5 py-2">
                            <p className="text-[12px] truncate text-[var(--nimi-text-primary)]">{a.fileName}</p>
                            <p className="text-[12px] mt-0.5 text-[var(--nimi-text-muted)]">
                              {ownerTableLabel(a.ownerTable)}
                            </p>
                          </div>
                          <button
                            onClick={() => void handleDeleteAttachment(a.attachmentId)}
                            className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--nimi-surface-overlay)] text-[12px] text-[var(--nimi-text-primary)] opacity-0 shadow-[var(--nimi-elevation-base)] transition-opacity group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        </Surface>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fullscreen preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nimi-scrim-modal)]"
          onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt={i18nText('ReportUpload.attachments.previewAlt')} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
          <button onClick={() => setPreviewUrl(null)}
            className="absolute top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nimi-surface-overlay)] text-[16px] text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-floating)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]">
            ✕
          </button>
        </div>
      )}
    </ProfileDetailShell>
  );
}
