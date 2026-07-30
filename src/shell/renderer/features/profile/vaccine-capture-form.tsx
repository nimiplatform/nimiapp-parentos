import { useState } from 'react';
import { Button, DatePicker, SelectField, TextField } from '@nimiplatform/kit/ui';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertVaccineRecord } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import {
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

const VACCINE_RULES = REMINDER_RULES
  .filter((rule) => rule.domain === 'vaccine')
  .sort((left, right) => left.triggerAge.startMonths - right.triggerAge.startMonths || left.ruleId.localeCompare(right.ruleId));

type VaccineCaptureChild = {
  childId: string;
  birthDate: string;
};

export type VaccineCaptureProps = {
  child: VaccineCaptureChild;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
};

/**
 * Rule-backed vaccine capture form. Vaccines are a retained-owner stateful
 * domain (rule.parentos.hrec.r007): actual vaccination
 * records land in `vaccine_records`, not `health_record_events`.
 */
export function VaccineCaptureContent({ child, onSaved, onClose }: VaccineCaptureProps) {
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batch, setBatch] = useState('');
  const [hospital, setHospital] = useState('');
  const [reaction, setReaction] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const selectedRule = VACCINE_RULES.find((rule) => rule.ruleId === selectedRuleId) ?? null;

  const handleSubmit = async () => {
    if (!selectedRule) {
      setErrorMsg(i18nText('Vaccine.capture.error.missingRule'));
      return;
    }
    if (!date) {
      setErrorMsg(i18nText('Vaccine.capture.error.missingDate'));
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const now = isoNow();
      await insertVaccineRecord({
        recordId: ulid(),
        childId: child.childId,
        ruleId: selectedRule.ruleId,
        vaccineName: selectedRule.title,
        vaccinatedAt: date,
        ageMonths: computeAgeMonthsAt(child.birthDate, date),
        batchNumber: batch || null,
        hospital: hospital || null,
        adverseReaction: reaction || null,
        photoPath: null,
        now,
      });
      await onSaved();
      onClose();
    } catch (error) {
      catchLog('vaccine-capture', 'action:submit-failed')(error);
      setErrorMsg(error instanceof Error ? error.message : i18nText('Vaccine.capture.error.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title={i18nText('Vaccine.capture.title')} subtitle={i18nText('Vaccine.capture.subtitle')} icon="💉" onClose={onClose} />
      <ModalContent>
        <div className="space-y-4">
          <SectionCard title={i18nText('Vaccine.capture.section.vaccination')}>
            <div className="space-y-3">
              <FormField label={i18nText('Vaccine.capture.field.name')} required>
                <SelectField
                  value={selectedRuleId}
                  onValueChange={setSelectedRuleId}
                  options={VACCINE_RULES.map((rule) => ({ value: rule.ruleId, label: rule.title }))}
                  placeholder={i18nText('Vaccine.capture.field.rulePlaceholder')}
                  className="w-full min-h-12"
                />
              </FormField>
              {selectedRule ? (
                <p className="text-[12px] leading-5 text-[var(--nimi-text-muted)]">{selectedRule.description}</p>
              ) : null}
              <FormGrid cols={2}>
                <FormField label={i18nText('Vaccine.field.vaccinatedAt')} required>
                  <DatePicker value={date} onChange={setDate} className="h-12" />
                </FormField>
                <FormField label={i18nText('Vaccine.field.hospital')}>
                  <TextField
                    value={hospital}
                    onChange={(e) => setHospital(e.target.value)}
                    placeholder={i18nText('Vaccine.field.optional')}
                    className="w-full min-h-12"
                  />
                </FormField>
                <FormField label={i18nText('Vaccine.field.batchNumber')}>
                  <TextField
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder={i18nText('Vaccine.field.optional')}
                    className="w-full min-h-12"
                  />
                </FormField>
                <FormField label={i18nText('Vaccine.capture.field.reaction')}>
                  <TextField
                    value={reaction}
                    onChange={(e) => setReaction(e.target.value)}
                    placeholder={i18nText('Vaccine.capture.field.reactionPlaceholder')}
                    className="w-full min-h-12"
                  />
                </FormField>
              </FormGrid>
            </div>
          </SectionCard>

          {errorMsg ? <InlineError>{errorMsg}</InlineError> : null}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Vaccine.capture.cancel')}</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving} tone="primary" size="md">
          {saving ? i18nText('Vaccine.capture.saving') : i18nText('Vaccine.capture.save')}
        </Button>
      </ModalFooter>
    </>
  );
}

export function VaccineCaptureModal(props: VaccineCaptureProps) {
  return (
    <HealthRecordModalShell open size="M" onClose={props.onClose}>
      <VaccineCaptureContent {...props} />
    </HealthRecordModalShell>
  );
}
