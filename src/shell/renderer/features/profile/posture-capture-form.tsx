import { X } from 'lucide-react';
import { Button, DashedAddButton, DatePicker, StatusBadge, TextField, TextareaField } from '@nimiplatform/kit/ui';
import { useRef, useState } from 'react';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertPostureAssessment } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { getLocalToday } from '../../engine/reminder-engine.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { readImageFileAsDataUrl } from './checkup-ocr.js';
import type { LinkedHealthRecordReminder } from './health-capture-orchestrator.js';
import {
  ChipGroup,
  FormField,
  FormGrid,
  HealthRecordModalShell,
  InlineError,
  ModalContent,
  ModalFooter,
  ModalHeader,
  SectionCard,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const SOURCE_OPTIONS = [
  { value: 'parent', label: i18nText('PostureCapture.source.parent') },
  { value: 'checkup', label: i18nText('PostureCapture.source.checkup') },
  { value: 'doctor', label: i18nText('PostureCapture.source.doctor') },
] as const;

const SHOULDER_OPTIONS = [
  { value: '0', label: i18nText('PostureCapture.option.symmetric'), normal: true },
  { value: '1', label: i18nText('PostureCapture.option.leftShoulderHigh'), normal: false },
  { value: '2', label: i18nText('PostureCapture.option.rightShoulderHigh'), normal: false },
] as const;

const SCAPULA_OPTIONS = [
  { value: 'symmetric', label: i18nText('PostureCapture.option.symmetric'), normal: true },
  { value: 'left-wing', label: i18nText('PostureCapture.option.leftProminent'), normal: false },
  { value: 'right-wing', label: i18nText('PostureCapture.option.rightProminent'), normal: false },
] as const;

const HIP_OPTIONS = [
  { value: 'equal', label: i18nText('PostureCapture.option.equalHeight'), normal: true },
  { value: 'left-high', label: i18nText('PostureCapture.option.leftHigh'), normal: false },
  { value: 'right-high', label: i18nText('PostureCapture.option.rightHigh'), normal: false },
] as const;

const LEG_OPTIONS = [
  { value: 'straight', label: i18nText('PostureCapture.option.straightLegs'), normal: true },
  { value: 'o-leg', label: i18nText('PostureCapture.option.oLeg'), normal: false },
  { value: 'x-leg', label: i18nText('PostureCapture.option.xLeg'), normal: false },
] as const;

const HEEL_OPTIONS = [
  { value: 'normal', label: i18nText('PostureCapture.option.vertical'), normal: true },
  { value: 'valgus', label: i18nText('PostureCapture.option.valgus'), normal: false },
  { value: 'varus', label: i18nText('PostureCapture.option.varus'), normal: false },
] as const;

const NECK_OPTIONS = [
  { value: 'normal', label: i18nText('PostureCapture.option.normal'), normal: true },
  { value: 'mild-forward', label: i18nText('PostureCapture.option.mildForward'), normal: false },
  { value: 'obvious-forward', label: i18nText('PostureCapture.option.obviousForward'), normal: false },
] as const;

const PELVIS_OPTIONS = [
  { value: 'normal', label: i18nText('PostureCapture.option.normal'), normal: true },
  { value: 'anterior-tilt', label: i18nText('PostureCapture.option.anteriorTilt'), normal: false },
] as const;

const KNEE_OPTIONS = [
  { value: 'normal', label: i18nText('PostureCapture.option.normal'), normal: true },
  { value: 'hyperextension', label: i18nText('PostureCapture.option.hyperextension'), normal: false },
] as const;

const ADAM_OPTIONS = [
  { value: 'normal', label: i18nText('PostureCapture.option.bothSidesLevel'), normal: true },
  { value: 'mild', label: i18nText('PostureCapture.option.mildAsymmetry'), normal: false },
  { value: 'obvious', label: i18nText('PostureCapture.option.obviousProminence'), normal: false },
] as const;

const POSTURE_TABS = [
  { key: 'back', label: i18nText('PostureCapture.tab.back'), emoji: '🧍', photoKey: 'back' },
  { key: 'side', label: i18nText('PostureCapture.tab.side'), emoji: '🧍‍♂️', photoKey: 'side' },
  { key: 'forward-bend', label: i18nText('PostureCapture.tab.forwardBend'), emoji: '🙇', photoKey: 'adam' },
] as const;

type PostureTab = (typeof POSTURE_TABS)[number]['key'];

const COBB_LEVELS = [
  { max: 10, labelKey: 'Posture.cobbLevel.normal', tone: 'success' },
  { max: 25, labelKey: 'Posture.cobbLevel.monitor', tone: 'warning' },
  { max: 40, labelKey: 'Posture.cobbLevel.brace', tone: 'danger' },
  { max: Infinity, labelKey: 'Posture.cobbLevel.surgicalAssessment', tone: 'danger' },
] as const;

function cobbLevel(angle: number) {
  return COBB_LEVELS.find((l) => angle <= l.max) ?? COBB_LEVELS[COBB_LEVELS.length - 1]!;
}

type PostureCaptureChild = {
  childId: string;
  birthDate: string;
};

type PostureCaptureProps = {
  child: PostureCaptureChild;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  /**
   * Set when the form is opened from a record_data posture reminder
   * (PO-REM-POS-003/004). The insert threads these ids into
   * insert_posture_assessment so the Rust side persists the assessment and
   * completes the bound reminder in one transaction (PO-CAPT-005).
   */
  linkedReminder?: LinkedHealthRecordReminder | null;
};

// @nimi-authority: rule.parentos.capt.r005
export function PostureCaptureContent({ child, onSaved, onClose, linkedReminder }: PostureCaptureProps) {
  const [formDate, setFormDate] = useState(getLocalToday);
  const [formSource, setFormSource] = useState<string>('parent');
  const [formShoulder, setFormShoulder] = useState('');
  const [formScapula, setFormScapula] = useState('');
  const [formAdam, setFormAdam] = useState('');
  const [formCobb, setFormCobb] = useState('');
  const [formHip, setFormHip] = useState('');
  const [formLeg, setFormLeg] = useState('');
  const [formHeel, setFormHeel] = useState('');
  const [formNeck, setFormNeck] = useState('');
  const [formPelvis, setFormPelvis] = useState('');
  const [formKnee, setFormKnee] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotos, setFormPhotos] = useState<Record<string, string>>({});
  const [postureTab, setPostureTab] = useState<PostureTab>('back');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoSlotRef = useRef<string | null>(null);
  const isMedical = formSource === 'checkup' || formSource === 'doctor';

  const handleSubmit = async () => {
    if (!formDate) {
      setErrorMsg(i18nText('PostureCapture.error.missingDate'));
      return;
    }

    const photoValues = Object.values(formPhotos);
    const hasAnyField =
      Boolean(formShoulder || formScapula || formAdam || formHip || formLeg || formHeel
        || formNeck || formPelvis || formKnee)
      || formCobb.trim().length > 0
      || formNotes.trim().length > 0
      || photoValues.length > 0;
    if (!hasAnyField) {
      setErrorMsg(i18nText('PostureCapture.error.missingAssessment'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await insertPostureAssessment({
        assessmentId: ulid(),
        childId: child.childId,
        assessedAt: formDate,
        ageMonths: computeAgeMonthsAt(child.birthDate, formDate),
        source: formSource || null,
        shoulder: formShoulder || null,
        scapula: formScapula || null,
        hip: formHip || null,
        leg: formLeg || null,
        heel: formHeel || null,
        neck: formNeck || null,
        pelvis: formPelvis || null,
        knee: formKnee || null,
        adam: formAdam || null,
        cobbAngle: formCobb.trim() ? parseFloat(formCobb) : null,
        notes: formNotes.trim() || null,
        photoPaths: photoValues.length > 0 ? JSON.stringify(photoValues) : null,
        now: isoNow(),
        // Reminder-linked capture: the Rust insert completes the bound reminder
        // in the same transaction. stateId falls back to a fresh ULID because the
        // reminder_states row may not exist yet (upsert INSERT branch needs a PK).
        linkedReminderStateId: linkedReminder ? (linkedReminder.stateId ?? ulid()) : null,
        linkedReminderRuleId: linkedReminder?.ruleId ?? null,
        linkedReminderRepeatIndex: linkedReminder ? (linkedReminder.repeatIndex ?? 0) : null,
      });
      await onSaved();
      onClose();
    } catch (error) {
      catchLog('posture-capture', 'action:submit-failed')(error);
      setErrorMsg(error instanceof Error ? error.message : i18nText('PostureCapture.error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const currentPhotoKey = POSTURE_TABS.find((t) => t.key === postureTab)?.photoKey ?? 'back';
  const currentPhotoUrl = formPhotos[currentPhotoKey];

  const chipActiveColorFor = (selected: boolean, normal: boolean): string | undefined => {
    if (!selected) return undefined;
    return normal ? 'var(--nimi-status-success)' : 'var(--nimi-status-info)';
  };

  type ChipOpt = { value: string; label: string; normal: boolean };
  const renderChips = (opts: readonly ChipOpt[], value: string, onChange: (v: string) => void) => {
    const selectedOpt = opts.find((o) => o.value === value);
    const activeColor = selectedOpt ? chipActiveColorFor(true, selectedOpt.normal) : undefined;
    return (
      <ChipGroup
        layout="fill"
        size="sm"
        clearable
        activeColor={activeColor}
        options={opts.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        onChange={(next) => onChange(next === value ? '' : next)}
      />
    );
  };

  return (
    <>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          const slot = photoSlotRef.current;
          event.target.value = '';
          if (!file || !slot) return;
          try {
            const dataUrl = await readImageFileAsDataUrl(file);
            setFormPhotos((p) => ({ ...p, [slot]: dataUrl }));
          } catch (error) {
            catchLog('posture-capture', 'action:read-photo-failed')(error);
          }
        }}
      />

      <ModalHeader title={i18nText('PostureCapture.title')} icon="🧍" onClose={onClose} />
      <ModalContent>
        <div className="space-y-4">
          <SectionCard title={i18nText('PostureCapture.section.basic')}>
            <FormGrid cols={2}>
              <FormField label={i18nText('PostureCapture.field.assessedAt')}>
                <DatePicker value={formDate} onChange={setFormDate} className="h-12" />
              </FormField>
              <FormField label={i18nText('PostureCapture.field.source')}>
                <ChipGroup
                  layout="fill"
                  size="sm"
                  options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  value={formSource}
                  onChange={(next) => setFormSource(next)}
                />
              </FormField>
            </FormGrid>
          </SectionCard>

          <SectionCard variant="plain">
            <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)]">
              {POSTURE_TABS.map((tab) => {
                const active = postureTab === tab.key;
                const hasPhoto = !!formPhotos[tab.photoKey];
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPostureTab(tab.key)}
                    className={`relative flex flex-col items-center gap-1.5 border-b-2 py-3 transition-colors ${
                      active
                        ? 'border-[var(--nimi-action-primary-bg)] bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))]'
                        : 'border-transparent bg-[var(--nimi-surface-panel)] hover:bg-[var(--nimi-action-ghost-hover)]'
                    }`}
                  >
                    <span className="text-[18px]">{tab.emoji}</span>
                    <span
                      className={`text-[12.5px] font-medium ${
                        active ? 'text-[var(--nimi-action-primary-bg)]' : 'text-[var(--nimi-text-muted)]'
                      }`}
                    >
                      {tab.label}
                    </span>
                    <span
                      className={`absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                        hasPhoto
                          ? 'bg-[color-mix(in_srgb,var(--nimi-status-success)_15%,transparent)] text-[var(--nimi-status-success)]'
                          : 'bg-[var(--nimi-surface-muted)] text-[var(--nimi-text-muted)]'
                      }`}
                    >
                      {hasPhoto ? '✓' : '📷'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-3">
              {currentPhotoUrl ? (
                <div className="relative">
                  <img src={currentPhotoUrl} alt={i18nText('PostureCapture.photo.previewAlt')} className="h-28 w-full rounded-2xl object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setFormPhotos((p) => {
                        const next = { ...p };
                        delete next[currentPhotoKey];
                        return next;
                      })
                    }
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[color-mix(in_srgb,var(--nimi-text-primary)_50%,transparent)] text-[var(--nimi-action-primary-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--nimi-text-primary)_70%,transparent)]"
                    aria-label={i18nText('PostureCapture.photo.remove')}
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                <DashedAddButton
                  shape="tile"
                  onClick={() => {
                    photoSlotRef.current = currentPhotoKey;
                    photoInputRef.current?.click();
                  }}
                  label={i18nText('PostureCapture.photo.uploadLabel', { label: POSTURE_TABS.find((t) => t.key === postureTab)?.label })}
                />
              )}

              {postureTab === 'back' && (
                <div className="space-y-3">
                  <FormField label={i18nText('PostureCapture.field.shoulder')}>
                    {renderChips(SHOULDER_OPTIONS as readonly ChipOpt[], formShoulder, setFormShoulder)}
                  </FormField>
                  <FormField label={i18nText('PostureCapture.field.scapula')}>
                    {renderChips(SCAPULA_OPTIONS as readonly ChipOpt[], formScapula, setFormScapula)}
                  </FormField>
                  <FormField label={i18nText('PostureCapture.field.hip')}>
                    {renderChips(HIP_OPTIONS as readonly ChipOpt[], formHip, setFormHip)}
                  </FormField>
                  <FormField label={i18nText('PostureCapture.field.legShape')}>
                    {renderChips(LEG_OPTIONS as readonly ChipOpt[], formLeg, setFormLeg)}
                  </FormField>
                  <FormField label={i18nText('PostureCapture.field.heelAlignment')}>
                    {renderChips(HEEL_OPTIONS as readonly ChipOpt[], formHeel, setFormHeel)}
                  </FormField>
                </div>
              )}
              {postureTab === 'side' && (
                <div className="space-y-3">
                  <FormField label={i18nText('PostureCapture.field.neckHead')}>
                    {renderChips(NECK_OPTIONS as readonly ChipOpt[], formNeck, setFormNeck)}
                  </FormField>
                  <FormField label={i18nText('PostureCapture.field.pelvis')}>
                    {renderChips(PELVIS_OPTIONS as readonly ChipOpt[], formPelvis, setFormPelvis)}
                  </FormField>
                  <FormField label={i18nText('PostureCapture.field.knee')}>
                    {renderChips(KNEE_OPTIONS as readonly ChipOpt[], formKnee, setFormKnee)}
                  </FormField>
                </div>
              )}
              {postureTab === 'forward-bend' && (
                <div className="space-y-3">
                  <FormField label={i18nText('PostureCapture.field.adamTest')}>
                    {renderChips(ADAM_OPTIONS as readonly ChipOpt[], formAdam, setFormAdam)}
                  </FormField>
                  {formAdam === 'obvious' && (
                    <div className="rounded-xl border border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-3 py-2.5">
                      <p className="text-[12.5px] font-medium text-[var(--nimi-status-danger)]">
                        {i18nText('PostureCapture.adamWarning')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={i18nText('PostureCapture.section.medical')}
            trailing={
              isMedical ? null : (
                <span
                  className="rounded-full bg-[var(--nimi-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--nimi-text-muted)]"
                >
                  {i18nText('PostureCapture.section.medicalDisabledHint')}
                </span>
              )
            }
          >
            <FormField label={i18nText('PostureCapture.field.cobbAngle')} hint={i18nText('PostureCapture.field.cobbAngleHint')}>
              <div className="flex items-center gap-3">
                <TextField
                  type="number"
                  step="1"
                  min="0"
                  max="90"
                  value={formCobb}
                  onChange={(e) => setFormCobb(e.target.value)}
                  disabled={!isMedical}
                  placeholder="--"
                  className="w-full min-h-12"
                  inputClassName="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                {formCobb && parseFloat(formCobb) > 0 ? (() => {
                  const level = cobbLevel(parseFloat(formCobb));
                  return (
                    <StatusBadge tone={level.tone} className="shrink-0 py-1 text-[12.5px]">
                      {i18nText(level.labelKey)}
                    </StatusBadge>
                  );
                })() : null}
              </div>
            </FormField>
          </SectionCard>

          <FormField label={i18nText('PostureCapture.field.notes')}>
            <TextareaField
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder={i18nText('PostureCapture.field.notesPlaceholder')}
              className="w-full"
            />
          </FormField>

          {errorMsg ? <InlineError>{errorMsg}</InlineError> : null}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('PostureCapture.action.cancel')}</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('PostureCapture.action.saving') : i18nText('PostureCapture.action.save')}
        </Button>
      </ModalFooter>
    </>
  );
}

/**
 * Sidebar-less modal wrapper for the posture detail page add-record action.
 * Sized M (720) so the form pane matches the width of the posture pane inside
 * the `/profile` health-data capture modal (L 920 - 200 sidebar = 720).
 */
export function PostureCaptureModal(props: PostureCaptureProps) {
  return (
    <HealthRecordModalShell open size="M" onClose={props.onClose}>
      <PostureCaptureContent {...props} />
    </HealthRecordModalShell>
  );
}
