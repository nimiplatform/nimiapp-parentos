import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { convertFileSrc } from '../../bridge/shell-command.js';
import { Button, DatePicker, Surface, TextField, SelectField, cn } from '@nimiplatform/kit/ui';
import { useAppStore, type NurtureMode } from '../../app-shell/app-store.js';
import { createChild, createFamily, deleteChild, getChildren, updateChild } from '../../bridge/sqlite-bridge.js';
import { saveChildAvatar } from '../../bridge/child-avatar-bridge.js';
import { mapChildRow } from '../../bridge/mappers.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { fileToBase64 } from '../journal/journal-page-helpers.js';
import { clearJournalLocalDraft } from '../journal/journal-page-local-draft.js';
import { AvatarCropModal } from './avatar-crop-modal.js';
import { ChildAvatar } from '../../shared/child-avatar.js';
import { i18nText } from '../../i18n/index.js';


/** Convert a local filesystem path to a Tauri 2 asset URL */
function assetUrl(path: string): string {
  try { return convertFileSrc(path); } catch { return path; }
}

/* ── recorder presets ────────────────────────────────────── */

interface RecorderProfile {
  id: string;
  name: string;
  emoji: string;
}

const RECORDER_PRESET_SPECS: Array<{ nameKey: string; emoji: string }> = [
  { nameKey: 'Children.recorder.mother', emoji: '👩' },
  { nameKey: 'Children.recorder.father', emoji: '👨' },
  { nameKey: 'Children.recorder.grandmaPaternal', emoji: '👵' },
  { nameKey: 'Children.recorder.grandpaPaternal', emoji: '👴' },
  { nameKey: 'Children.recorder.grandmaMaternal', emoji: '👵' },
  { nameKey: 'Children.recorder.grandpaMaternal', emoji: '👴' },
];

function recorderPresets(): Array<{ name: string; emoji: string }> {
  return RECORDER_PRESET_SPECS.map((preset) => ({
    ...preset,
    name: i18nText(preset.nameKey),
  }));
}

function defaultRecorder(): RecorderProfile {
  const preset = recorderPresets()[0] ?? { name: i18nText('Children.recorder.mother'), emoji: '👩' };
  return { id: ulid(), name: preset.name, emoji: preset.emoji };
}

function recorderEmoji(name: string): string {
  return recorderPresets().find((p) => p.name === name)?.emoji ?? '👤';
}

/* ── form state ──────────────────────────────────────────── */

interface FormState {
  displayName: string;
  gender: 'male' | 'female';
  birthDate: string;
  birthWeightKg: string;
  birthHeightCm: string;
  birthHeadCircCm: string;
  nurtureMode: NurtureMode;
  allergies: string;
  medicalNotes: string;
  recorder: RecorderProfile;
  customRecorderName: string;
  avatarFile: File | null;
  avatarPreview: string | null;
}

function createEmptyForm(): FormState {
  return {
    displayName: '', gender: 'male', birthDate: '', birthWeightKg: '', birthHeightCm: '',
    birthHeadCircCm: '', nurtureMode: 'balanced', allergies: '', medicalNotes: '',
    recorder: defaultRecorder(),
    customRecorderName: '',
    avatarFile: null, avatarPreview: null,
  };
}

function parseCsvList(value: string) {
  const items = value.split(',').map((i) => i.trim()).filter(Boolean);
  return items.length > 0 ? JSON.stringify(items) : null;
}

function serializeRecorder(recorder: RecorderProfile) {
  const name = recorder.name.trim();
  return name ? JSON.stringify([{ id: recorder.id, name }]) : null;
}

const MODE_LABEL_KEYS: Record<string, string> = {
  relaxed: 'Children.nurtureMode.relaxed',
  balanced: 'Children.nurtureMode.balanced',
  advanced: 'Children.nurtureMode.advanced',
};

function nurtureModeLabel(mode: string): string {
  const key = MODE_LABEL_KEYS[mode];
  return key ? i18nText(key) : mode;
}

type ChildrenSettingsLocationState = {
  from?: 'profile';
  intent?: 'add-child';
} | null;

/* ── page ─────────────────────────────────────────────────── */

export default function ChildrenSettingsPage() {
  const { activeChildId, children, familyId, setActiveChildId, setChildren, setFamilyId } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ChildrenSettingsLocationState;
  const fromProfile = locationState?.from === 'profile';
  const openAddForm = locationState?.intent === 'add-child';
  const [showForm, setShowForm] = useState(openAddForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingChildId, setDeletingChildId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const initialOpenHandledRef = useRef(false);

  const resetForm = () => {
    setForm(createEmptyForm());
    setShowForm(false);
    setEditingId(null);
    if (fromProfile) navigate('/profile');
  };

  useEffect(() => {
    if (!openAddForm) return;
    setForm(createEmptyForm());
    setEditingId(null);
    setDeletingChildId(null);
    setShowForm(true);
  }, [openAddForm, location.key]);

  const refreshChildren = async (fid: string | null) => {
    if (!fid) return;
    try { const rows = await getChildren(fid); setChildren(rows.map(mapChildRow)); } catch { /* bridge */ }
  };

  const uploadAvatar = async (childId: string): Promise<string | null> => {
    if (!form.avatarFile) return null;
    try {
      const base64 = await fileToBase64(form.avatarFile);
      const result = await saveChildAvatar({ childId, mimeType: form.avatarFile.type, imageBase64: base64 });
      return result.path;
    } catch { return null; }
  };

  const handleAdd = async () => {
    if (!form.displayName || !form.birthDate) return;
    const now = isoNow();
    const childId = ulid();
    const shouldEnterDashboard = !fromProfile && (openAddForm || children.length === 0);
    try {
      let fid = familyId;
      if (!fid) { fid = ulid(); await createFamily(fid, i18nText('Children.defaultFamilyName'), now); setFamilyId(fid); }
      const avatarPath = await uploadAvatar(childId);
      await createChild({
        childId, familyId: fid, displayName: form.displayName, gender: form.gender,
        birthDate: form.birthDate, birthWeightKg: form.birthWeightKg ? parseFloat(form.birthWeightKg) : null,
        birthHeightCm: form.birthHeightCm ? parseFloat(form.birthHeightCm) : null,
        birthHeadCircCm: form.birthHeadCircCm ? parseFloat(form.birthHeadCircCm) : null,
        avatarPath, nurtureMode: form.nurtureMode, nurtureModeOverrides: null,
        allergies: parseCsvList(form.allergies), medicalNotes: parseCsvList(form.medicalNotes),
        recorderProfiles: serializeRecorder(form.recorder), now,
      });
      setActiveChildId(childId);
      await refreshChildren(fid); resetForm();
      if (shouldEnterDashboard) navigate('/timeline', { replace: true });
    } catch { /* bridge */ }
  };

  const handleUpdate = async () => {
    if (!editingId || !form.displayName || !form.birthDate) return;
    const existing = children.find((c) => c.childId === editingId);
    if (!existing) return;
    try {
      const avatarPath = form.avatarFile ? await uploadAvatar(editingId) : existing.avatarPath;
      await updateChild({
        childId: editingId, displayName: form.displayName, gender: form.gender,
        birthDate: form.birthDate, birthWeightKg: form.birthWeightKg ? parseFloat(form.birthWeightKg) : null,
        birthHeightCm: form.birthHeightCm ? parseFloat(form.birthHeightCm) : null,
        birthHeadCircCm: form.birthHeadCircCm ? parseFloat(form.birthHeadCircCm) : null,
        avatarPath: avatarPath ?? null, nurtureMode: form.nurtureMode,
        nurtureModeOverrides: existing.nurtureModeOverrides ? JSON.stringify(existing.nurtureModeOverrides) : null,
        allergies: parseCsvList(form.allergies), medicalNotes: parseCsvList(form.medicalNotes),
        recorderProfiles: serializeRecorder(form.recorder), now: isoNow(),
      });
      await refreshChildren(existing.familyId); resetForm();
    } catch { /* bridge */ }
  };

  const handleDelete = async (childId: string) => {
    try {
      await deleteChild(childId);
      clearJournalLocalDraft(childId);
      if (activeChildId === childId) setActiveChildId(null);
      setDeletingChildId(null);
      await refreshChildren(familyId);
    } catch { /* bridge */ }
  };

  const startEdit = (childId: string) => {
    const c = children.find((i) => i.childId === childId);
    if (!c) return;
    setForm({
      displayName: c.displayName, gender: c.gender, birthDate: c.birthDate,
      birthWeightKg: c.birthWeightKg?.toString() ?? '', birthHeightCm: c.birthHeightCm?.toString() ?? '',
      birthHeadCircCm: c.birthHeadCircCm?.toString() ?? '', nurtureMode: c.nurtureMode,
      allergies: c.allergies?.join(', ') ?? '', medicalNotes: c.medicalNotes?.join(', ') ?? '',
      recorder: c.recorderProfiles?.[0]
        ? { ...c.recorderProfiles[0], emoji: recorderEmoji(c.recorderProfiles[0].name) }
        : defaultRecorder(),
      customRecorderName: (() => {
        const first = c.recorderProfiles?.[0];
        return first && !recorderPresets().some((p) => p.name === first.name) ? first.name : '';
      })(),
      avatarFile: null, avatarPreview: c.avatarPath ? assetUrl(c.avatarPath) : null,
    });
    setEditingId(childId); setShowForm(true);
  };

  useEffect(() => {
    if (initialOpenHandledRef.current) return;
    if (!fromProfile) return;
    if (!activeChildId) return;
    if (!children.find((c) => c.childId === activeChildId)) return;
    startEdit(activeChildId);
    initialOpenHandledRef.current = true;
  }, [fromProfile, activeChildId, children]);

  const handleAvatarSelect = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setCropImageUrl(previewUrl);
  };

  const handleCropConfirm = (croppedFile: File) => {
    const previewUrl = URL.createObjectURL(croppedFile);
    setForm((prev) => ({ ...prev, avatarFile: croppedFile, avatarPreview: previewUrl }));
    setCropImageUrl(null);
  };

  const handleCropCancel = () => {
    setCropImageUrl(null);
  };

  const selectRecorder = (preset: { name: string; emoji: string }) => {
    setForm((prev) => ({ ...prev, recorder: { ...prev.recorder, name: preset.name, emoji: preset.emoji }, customRecorderName: '' }));
  };

  const selectCustomRecorder = () => {
    setForm((prev) => ({ ...prev, recorder: { ...prev.recorder, name: prev.customRecorderName || '', emoji: '👤' } }));
  };

  /** For number inputs: seed from placeholder on first arrow click, then let native step take over */
  const numChange = (field: 'birthWeightKg' | 'birthHeightCm' | 'birthHeadCircCm', placeholder: string, step: number) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;
      if (!form[field] && v !== '') {
        // First interaction via spinner arrows on an empty field: native browser steps from 0.
        // Detect that and seed from placeholder instead.
        const parsed = parseFloat(v);
        if (parsed === step || parsed === -step) {
          v = String(Math.round((parseFloat(placeholder) + (parsed > 0 ? step : -step)) * 100) / 100);
        }
      }
      setForm({ ...form, [field]: v });
    };

  const isCustom = !recorderPresets().some((p) => p.name === form.recorder.name);
  const canSubmitChildForm = form.displayName.trim().length > 0 && form.birthDate.trim().length > 0;

  return (
    <div className="min-h-full bg-transparent p-6">
      <div className="mx-auto max-w-3xl">
        {/* Back link */}
        <Link to={fromProfile ? '/profile' : '/settings'} className="mb-5 inline-flex items-center gap-1 text-[14px] text-[var(--nimi-text-muted)] hover:underline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          {fromProfile ? i18nText('Children.settings.backToProfile') : i18nText('Children.settings.backToSettings')}
        </Link>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--nimi-text-primary)]">{i18nText('Children.settings.title')}</h1>
            <p className="mt-0.5 text-[14px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.subtitle')}</p>
          </div>
          {!showForm && (
            <Button onClick={() => { setForm(createEmptyForm()); setShowForm(true); }} tone="primary" size="md" className="text-[14px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              {i18nText('Children.settings.action.addChild')}
            </Button>
          )}
        </div>

        {/* Empty state */}
        {children.length === 0 && !showForm && (
          <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--nimi-action-secondary-bg)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--nimi-text-muted)]" strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </div>
            <p className="text-[16px] font-medium text-[var(--nimi-text-primary)]">{i18nText('Children.settings.emptyTitle')}</p>
            <p className="mt-1 text-[14px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.emptyDescription')}</p>
          </Surface>
        )}

        {/* Child list */}
        {!showForm && children.map((child) => {
          const isActive = activeChildId === child.childId;
          return (
            <Surface
              key={child.childId}
              tone="card"
              material="solid"
              elevation="base"
              padding="lg"
              className={cn(
                'mb-4 parentos-radius-xl border-l-[3px] transition-all duration-200 hover:shadow-[var(--nimi-elevation-raised)]',
                isActive ? 'border-l-[var(--nimi-action-primary-bg)]' : 'border-l-transparent',
              )}
            >
              <div className="flex items-center gap-4">
                <ChildAvatar
                  child={child}
                  className={cn(
                    'w-12 h-12 rounded-full object-cover shrink-0',
                    isActive ? 'parentos-child-avatar-outline-active' : 'parentos-child-avatar-outline-idle',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">{child.displayName}</h3>
                    {isActive && <span className="rounded-full bg-[var(--nimi-action-primary-bg)] px-2 py-0.5 text-[12px] text-[var(--nimi-action-primary-text)]">{i18nText('Children.settings.activeBadge')}</span>}
                  </div>
                  <p className="mt-0.5 text-[14px] text-[var(--nimi-text-muted)]">
                    {child.gender === 'male' ? i18nText('Children.gender.male') : i18nText('Children.gender.female')} · {child.birthDate} · {nurtureModeLabel(child.nurtureMode)}
                  </p>
                  {child.recorderProfiles && child.recorderProfiles.length > 0 && (
                    <div className="mt-1 flex items-center gap-1.5">
                      {child.recorderProfiles.map((r) => (
                        <span key={r.id} className="inline-flex items-center gap-0.5 rounded-full bg-[var(--nimi-action-secondary-bg)] px-2 py-0.5 text-[13px] text-[var(--nimi-text-muted)]">
                          <span>{recorderEmoji(r.name)}</span> {r.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {!isActive && (
                    <Button onClick={() => setActiveChildId(child.childId)} tone="secondary" size="sm" className="text-[13px]">
                      {i18nText('Children.settings.action.setActive')}
                    </Button>
                  )}
                  <Button onClick={() => startEdit(child.childId)} tone="secondary" size="sm" className="text-[13px]">
                    {i18nText('Children.settings.action.edit')}
                  </Button>
                  <Button onClick={() => setDeletingChildId(child.childId)} tone="danger" size="sm" className="text-[13px]">
                    {i18nText('Children.settings.action.delete')}
                  </Button>
                </div>
              </div>
              {deletingChildId === child.childId && (
                <div className="mt-4 parentos-radius-lg border border-[color-mix(in_srgb,var(--nimi-status-danger)_25%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] p-4">
                  <p className="mb-3 text-[14px] text-[var(--nimi-status-danger)]">
                    {i18nText('Children.settings.deleteConfirmation', { childName: child.displayName })}
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => void handleDelete(child.childId)} tone="danger" size="sm" className="bg-[var(--nimi-status-danger)] text-[13px] text-[var(--nimi-action-primary-text)]">
                      {i18nText('Children.settings.action.confirmDelete')}
                    </Button>
                    <Button onClick={() => setDeletingChildId(null)} tone="secondary" size="sm" className="text-[13px]">
                      {i18nText('Children.settings.action.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </Surface>
          );
        })}

        {/* ── Add / Edit form ── */}
        {showForm && (
          <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl">
            <h3 className="mb-5 text-[16px] font-semibold text-[var(--nimi-text-primary)]">
              {editingId ? i18nText('Children.settings.form.editTitle') : i18nText('Children.settings.action.addChild')}
            </h3>

            {/* Avatar upload */}
            <div className="flex items-center gap-5 mb-6">
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => handleAvatarSelect(e.target.files)} />
              <button onClick={() => avatarInputRef.current?.click()} className="relative group shrink-0">
                {form.avatarPreview ? (
                  <img src={form.avatarPreview} alt="" className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <ChildAvatar
                    child={{ avatarPath: null, birthDate: form.birthDate, gender: form.gender }}
                    className="w-20 h-20"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--nimi-scrim-modal)] opacity-0 transition-opacity group-hover:opacity-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--nimi-action-primary-text)]" strokeWidth="2" strokeLinecap="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              </button>
              <div>
                <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">
                  {form.avatarPreview ? i18nText('Children.settings.avatar.change') : i18nText('Children.settings.avatar.upload')}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.avatar.hint')}</p>
              </div>
            </div>

            {/* Basic info */}
            <p className="mb-3 text-[14px] font-semibold text-[var(--nimi-text-muted)]">{i18nText('Children.settings.section.basicInfo')}</p>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.name')}</label>
                <TextField value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="w-full" inputClassName="text-[14px]" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.gender')}</label>
                <SelectField value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as 'male' | 'female' })}
                  options={[{ value: 'male', label: i18nText('Children.gender.male') }, { value: 'female', label: i18nText('Children.gender.female') }]} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.birthDate')}</label>
                <DatePicker value={form.birthDate} onChange={(v) => setForm({ ...form, birthDate: v })}
                  maxDate={new Date().toISOString().slice(0, 10)} size="small" className="parentos-child-birth-date" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.nurtureMode')}</label>
                <SelectField value={form.nurtureMode} onValueChange={(v) => setForm({ ...form, nurtureMode: v as NurtureMode })}
                  options={[{ value: 'relaxed', label: nurtureModeLabel('relaxed') }, { value: 'balanced', label: nurtureModeLabel('balanced') }, { value: 'advanced', label: nurtureModeLabel('advanced') }]} />
              </div>
            </div>

            {/* Birth measurements */}
            <p className="mb-3 text-[14px] font-semibold text-[var(--nimi-text-muted)]">{i18nText('Children.settings.section.birthMeasurements')}</p>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.birthWeight')}</label>
                <TextField type="number" step="0.01" value={form.birthWeightKg}
                  onChange={numChange('birthWeightKg', '3.50', 0.01)}
                  className="w-full" inputClassName="text-[14px]" placeholder="3.50" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.birthHeight')}</label>
                <TextField type="number" step="0.1" value={form.birthHeightCm}
                  onChange={numChange('birthHeightCm', '50.0', 0.1)}
                  className="w-full" inputClassName="text-[14px]" placeholder="50.0" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.birthHeadCirc')}</label>
                <TextField type="number" step="0.1" value={form.birthHeadCircCm}
                  onChange={numChange('birthHeadCircCm', '34.0', 0.1)}
                  className="w-full" inputClassName="text-[14px]" placeholder="34.0" />
              </div>
            </div>

            {/* Medical info */}
            <p className="mb-3 text-[14px] font-semibold text-[var(--nimi-text-muted)]">{i18nText('Children.settings.section.healthInfo')}</p>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.allergies')}</label>
                <TextField value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                  className="w-full" inputClassName="text-[14px]" placeholder={i18nText('Children.settings.placeholder.allergies')} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Children.settings.field.medicalNotes')}</label>
                <TextField value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
                  className="w-full" inputClassName="text-[14px]" placeholder={i18nText('Children.settings.placeholder.medicalNotes')} />
              </div>
            </div>

            {/* Recorder profile (single select) */}
            <p className="mb-3 text-[14px] font-semibold text-[var(--nimi-text-muted)]">{i18nText('Children.settings.section.recorder')}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {recorderPresets().map((p) => {
                const active = form.recorder.name === p.name;
                return (
                  <button key={p.name} onClick={() => selectRecorder(p)}
                    className={cn(
                      'flex items-center gap-1.5 parentos-radius-lg px-3.5 py-2 text-[14px] transition-all',
                      active
                        ? 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)] shadow-[var(--nimi-elevation-base)]'
                        : 'bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-primary)] hover:bg-[var(--nimi-action-ghost-hover)]',
                    )}>
                    <span>{p.emoji}</span> {p.name}
                  </button>
                );
              })}
              <button onClick={selectCustomRecorder}
                className={cn(
                  'flex items-center gap-1 parentos-radius-lg px-3.5 py-2 text-[14px] transition-all',
                  isCustom
                    ? 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)] shadow-[var(--nimi-elevation-base)]'
                    : 'bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]',
                )}>
                {i18nText('Children.settings.recorder.custom')}
              </button>
            </div>
            {isCustom && (
              <TextField value={form.customRecorderName}
                onChange={(e) => setForm((prev) => ({ ...prev, customRecorderName: e.target.value, recorder: { ...prev.recorder, name: e.target.value, emoji: '👤' } }))}
                className="w-full" inputClassName="text-[14px]" placeholder={i18nText('Children.settings.recorder.customPlaceholder')} />
            )}
            <div className="mb-5" />

            {/* Actions */}
            <div className="flex gap-3 border-t border-[var(--nimi-border-subtle)] pt-2">
              <Button
                onClick={() => void (editingId ? handleUpdate() : handleAdd())}
                tone="primary"
                size="md"
                disabled={!canSubmitChildForm}
                className="px-6 text-[14px]"
              >
                {editingId ? i18nText('Children.settings.action.save') : i18nText('Children.settings.action.add')}
              </Button>
              <Button onClick={resetForm} tone="secondary" size="md" className="px-6 text-[14px]">
                {i18nText('Children.settings.action.cancel')}
              </Button>
            </div>
          </Surface>
        )}
      </div>

      {/* Avatar crop modal */}
      {cropImageUrl && (
        <AvatarCropModal imageUrl={cropImageUrl} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
