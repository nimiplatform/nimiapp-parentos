// Relocated from growth-curve-add-record-modal.tsx during parent topic
// 2026-05-18-parentos-growth-curve-page-redesign wave-D (history-and-capture-
// migration). The Add CTA on the growth detail surface now mounts
// HealthCaptureModal with initialGroupId='growth'; HealthCaptureModal renders
// this GrowthAddRecordContent as the per-group form body (capture-orchestrator-
// contract.md PO-CAPT-006). The body is byte-equivalent to the post-wave-0b
// state of GrowthAddRecordContent (commit 29b797559) — calls
// saveHealthRecordCapture (canonical-API) per
// .nimi/spec/parentos/kernel/tables/local-storage.yaml#growth_measurement_canonical_migration.
import { useState } from 'react';
import { Button, cn, DatePicker, TextField, TextareaField } from '@nimiplatform/kit/ui';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { saveAttachment, saveHealthRecordCapture } from '../../bridge/sqlite-bridge.js';
import type { SaveHealthRecordCaptureInput } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { bmiLabel, computeBMI } from './growth-curve-page-shared.js';
import type { LinkedHealthRecordReminder } from './health-capture-orchestrator.js';
import { PhotoGrid, type PendingPhoto } from './photo-grid.js';
import {
  FormField,
  FormGrid,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const NUMBER_INPUT_CLASS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

type GrowthAddRecordContentProps = {
  childId: string;
  birthDate: string;
  isUnder6: boolean;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  linkedReminder?: LinkedHealthRecordReminder | null;
};

export function GrowthAddRecordContent({
  childId,
  birthDate,
  isUnder6,
  onSaved,
  onClose,
  linkedReminder,
}: GrowthAddRecordContentProps) {
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formHeight, setFormHeight] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formHeadCirc, setFormHeadCirc] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotos, setFormPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const height = formHeight ? parseFloat(formHeight) : NaN;
  const weight = formWeight ? parseFloat(formWeight) : NaN;
  const hasBMI = height > 0 && weight > 0;
  const bmi = hasBMI ? computeBMI(height, weight) : null;
  const bmiMeta = bmi != null ? bmiLabel(bmi) : null;

  const handleSave = async () => {
    if (!formDate) return;
    const h = formHeight ? parseFloat(formHeight) : null;
    const w = formWeight ? parseFloat(formWeight) : null;
    const hc = formHeadCirc ? parseFloat(formHeadCirc) : null;
    if (h === null && w === null && hc === null) return;

    const age = computeAgeMonthsAt(birthDate, formDate);
    const now = isoNow();
    const notes = formNotes.trim() || null;

    setSaving(true);
    const linkedReminderStateId = linkedReminder?.stateId ?? null;
    const linkedReminderRuleId = linkedReminder?.ruleId ?? null;

    type CanonicalMetricSpec = {
      metricId: string;
      protocolId: string;
      unit: string;
      value: number;
    };
    const metricsToWrite: CanonicalMetricSpec[] = [];
    if (h != null) {
      metricsToWrite.push({ metricId: 'growth.height', protocolId: 'growth-child-quarterly', unit: 'cm', value: h });
    }
    if (w != null) {
      metricsToWrite.push({ metricId: 'growth.weight', protocolId: 'growth-child-quarterly', unit: 'kg', value: w });
    }
    if (hc != null) {
      metricsToWrite.push({ metricId: 'growth.head_circumference', protocolId: 'growth-infant-monthly', unit: 'cm', value: hc });
    }

    const recordKind: SaveHealthRecordCaptureInput['recordKind'] = linkedReminderStateId
      ? 'reminder_linked'
      : 'manual';
    const sourceSurface: SaveHealthRecordCaptureInput['sourceSurface'] = linkedReminderStateId
      ? 'reminder'
      : 'profile_detail';

    try {
      let firstEventId: string | null = null;
      for (const metric of metricsToWrite) {
        const eventId = ulid();
        const valueId = ulid();
        const input: SaveHealthRecordCaptureInput = {
          eventId,
          childId,
          protocolId: metric.protocolId,
          groupId: 'growth',
          recordKind,
          sourceSurface,
          recordedAt: now,
          effectiveDate: formDate,
          ageMonths: age,
          recorderId: null,
          linkedReminderStateId,
          linkedReminderRuleId,
          notes,
          metadataJson: null,
          now,
          values: [
            {
              valueId,
              metricId: metric.metricId,
              valueNumber: metric.value,
              valueText: null,
              valueJson: null,
              unit: metric.unit,
              qualifier: null,
              recordKind: 'measured',
              sourceValueIds: null,
            },
          ],
        };
        await saveHealthRecordCapture(input);
        firstEventId = firstEventId ?? eventId;
      }

      if (firstEventId && formPhotos.length > 0) {
        for (const photo of formPhotos) {
          await saveAttachment({
            attachmentId: ulid(),
            childId,
            ownerTable: 'health_record_events',
            ownerId: firstEventId,
            fileName: photo.fileName,
            mimeType: photo.mimeType,
            imageBase64: photo.base64,
            caption: null,
            now,
          });
        }
      }

      await onSaved();
      onClose();
    } catch {
      /* bridge unavailable */
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title={i18nText('GrowthCurve.capture.title')} icon="📏" onClose={onClose} />
      <ModalContent>
        <div className="space-y-5">
          <FormField label={i18nText('GrowthCurve.capture.measuredAt')}>
            <DatePicker value={formDate} onChange={setFormDate} className="h-12" />
          </FormField>

          <FormGrid cols={isUnder6 ? 3 : 2}>
            <FormField label={i18nText('GrowthCurve.capture.heightCm')}>
              <TextField
                type="number"
                step="0.1"
                placeholder="120.5"
                value={formHeight}
                onChange={(event) => setFormHeight(event.target.value)}
                className="w-full min-h-12"
                inputClassName={NUMBER_INPUT_CLASS}
              />
            </FormField>
            <FormField label={i18nText('GrowthCurve.capture.weightKg')}>
              <TextField
                type="number"
                step="0.01"
                placeholder="22.5"
                value={formWeight}
                onChange={(event) => setFormWeight(event.target.value)}
                className="w-full min-h-12"
                inputClassName={NUMBER_INPUT_CLASS}
              />
            </FormField>
            {isUnder6 ? (
              <FormField label={i18nText('GrowthCurve.capture.headCircumferenceCm')}>
                <TextField
                  type="number"
                  step="0.1"
                  placeholder="48.0"
                  value={formHeadCirc}
                  onChange={(event) => setFormHeadCirc(event.target.value)}
                  className="w-full min-h-12"
                  inputClassName={NUMBER_INPUT_CLASS}
                />
              </FormField>
            ) : null}
          </FormGrid>

          <div
            className={cn(
              'flex min-h-[44px] items-center gap-2 rounded-2xl border px-4 transition-colors',
              hasBMI
                ? 'border-[color-mix(in_srgb,var(--nimi-status-success)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-success)_8%,var(--nimi-surface-card))]'
                : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)]',
            )}
          >
            <span className="text-[13px] font-medium text-[var(--nimi-text-muted)]">
              {i18nText('GrowthCurve.capture.bmiAuto')}
            </span>
            {hasBMI && bmi != null && bmiMeta ? (
              <>
                <span className={`ml-auto text-[16px] font-bold ${bmiToneClassName(bmiMeta.tone)}`}>
                  {bmi}
                </span>
                <span className={`text-[13px] font-medium ${bmiToneClassName(bmiMeta.tone)}`}>
                  {bmiMeta.tag}
                </span>
              </>
            ) : (
              <span className="ml-auto text-[14px] text-[var(--nimi-text-muted)]">
                --
              </span>
            )}
          </div>

          <FormField label={i18nText('GrowthCurve.capture.notes')}>
            <TextareaField
              rows={2}
              value={formNotes}
              onChange={(event) => setFormNotes(event.target.value)}
              placeholder={i18nText('GrowthCurve.capture.notesPlaceholder')}
              className="w-full"
            />
          </FormField>

          <FormField label={i18nText('GrowthCurve.capture.photos', { countSuffix: formPhotos.length > 0 ? ` (${formPhotos.length}/9)` : '' })}>
            <div className="space-y-2">
              <PhotoGrid
                photos={formPhotos}
                maxPhotos={9}
                hint={i18nText('GrowthCurve.capture.photoHint')}
                onChange={setFormPhotos}
              />
            </div>
          </FormField>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('GrowthCurve.capture.cancel')}</Button>
        <Button type="button" onClick={() => void handleSave()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('GrowthCurve.capture.saving') : i18nText('GrowthCurve.capture.save')}
        </Button>
      </ModalFooter>
    </>
  );
}

function bmiToneClassName(tone: ReturnType<typeof bmiLabel>['tone']): string {
  if (tone === 'info') return 'text-[var(--nimi-status-info)]';
  if (tone === 'success') return 'text-[var(--nimi-status-success)]';
  if (tone === 'warning') return 'text-[var(--nimi-status-warning)]';
  return 'text-[var(--nimi-status-danger)]';
}
