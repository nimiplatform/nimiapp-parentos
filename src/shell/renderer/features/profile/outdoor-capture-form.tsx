import { useState } from 'react';
import { Button, DatePicker, TextField, TextareaField } from '@nimiplatform/kit/ui';
import { insertOutdoorRecord } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import type { LinkedHealthRecordReminder } from './health-capture-orchestrator.js';
import {
  ChipGroup,
  FormField,
  InlineError,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120] as const;

type OutdoorCaptureProps = {
  child: { childId: string };
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  linkedReminder?: LinkedHealthRecordReminder | null;
};

export function OutdoorCaptureContent({ child, onSaved, onClose, linkedReminder }: OutdoorCaptureProps) {
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!activityDate) return;
    const minutes = parseInt(durationMinutes, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError(i18nText('Outdoor.capture.invalidDuration'));
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await insertOutdoorRecord({
        recordId: ulid(),
        childId: child.childId,
        activityDate,
        durationMinutes: minutes,
        note: note.trim() || null,
        now: isoNow(),
        linkedReminderStateId: linkedReminder?.stateId ?? null,
        linkedReminderRuleId: linkedReminder?.ruleId ?? null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : i18nText('Outdoor.capture.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const presetOptions = PRESET_DURATIONS.map((preset) => ({
    value: String(preset),
    label: i18nText('Outdoor.capture.durationPreset', { minutes: preset }),
  }));

  return (
    <>
      <ModalHeader title={i18nText('Outdoor.capture.title')} icon="☀️" onClose={onClose} />
      <ModalContent>
        <div className="space-y-5">
          <FormField label={i18nText('Outdoor.capture.activityDate')}>
            <DatePicker value={activityDate} onChange={setActivityDate} className="h-12" />
          </FormField>

          <FormField label={i18nText('Outdoor.capture.durationMinutes')}>
            <TextField
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              className="w-full min-h-12"
              inputClassName="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <div className="mt-2">
              <ChipGroup
                options={presetOptions}
                value={durationMinutes}
                onChange={(value) => setDurationMinutes(value)}
                size="sm"
              />
            </div>
          </FormField>

          <FormField label={i18nText('Outdoor.capture.notes')}>
            <TextareaField
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={i18nText('Outdoor.capture.notesPlaceholder')}
              className="w-full"
            />
          </FormField>

          {error ? <InlineError>{error}</InlineError> : null}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Outdoor.capture.cancel')}</Button>
        <Button type="button" onClick={() => void handleSave()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('Outdoor.capture.saving') : i18nText('Outdoor.capture.save')}
        </Button>
      </ModalFooter>
    </>
  );
}
