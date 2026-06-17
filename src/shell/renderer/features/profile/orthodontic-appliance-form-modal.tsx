import { Button, cn, DatePicker, SelectField, TextField, TextareaField } from '@nimiplatform/kit/ui';
import { useState } from 'react';
import {
  insertOrthodonticAppliance,
  type OrthodonticApplianceType,
} from '../../bridge/sqlite-bridge.js';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { APPLIANCE_PHASES } from './orthodontic-derive.js';
import { applianceRequiresPrescribedHours } from './orthodontic-modal-domain.js';
import {
  FormField,
  HealthRecordModalShell,
  InlineError,
  ModalContent,
  ModalFooter as ShellModalFooter,
  ModalHeader,
} from './health-record-modal-shell.js';
import { i18nText } from '../../i18n/index.js';


const NUMBER_INPUT_CLASS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const DANGER_DATE_FIELD_CLASS = 'border-[var(--nimi-status-danger)] ring-[length:var(--nimi-focus-ring-width)] ring-[var(--nimi-status-danger)]';

export function ApplianceFormModal({
  caseId,
  childId,
  childBirthDate,
  eligibleTypes,
  onClose,
  onSaved,
  onError,
}: {
  caseId: string;
  childId: string;
  childBirthDate: string;
  eligibleTypes: { value: OrthodonticApplianceType; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [applianceType, setApplianceType] = useState<OrthodonticApplianceType>(
    eligibleTypes[0]?.value ?? 'clear-aligner',
  );
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [prescribedHours, setPrescribedHours] = useState<string>('');
  const [prescribedActivations, setPrescribedActivations] = useState<string>('');
  const [activationInterval, setActivationInterval] = useState<string>('');
  const [totalAligners, setTotalAligners] = useState<string>('');
  const [daysPerAligner, setDaysPerAligner] = useState<string>('');
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [reviewIntervalDays, setReviewIntervalDays] = useState<string>('');
  const [nextReviewAgenda, setNextReviewAgenda] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const needsPrescribedHours = applianceRequiresPrescribedHours(applianceType);
  const isClearAligner = applianceType === 'clear-aligner';
  const isExpander = applianceType === 'expander';
  // Phase options are type-specific (PO-ORTHO-013) — reset the picked phase
  // whenever the appliance type changes so an invalid phaseId can't carry over.
  const handleTypeChange = (next: OrthodonticApplianceType) => {
    setApplianceType(next);
    setCurrentPhase('');
  };
  const activationIntervalValid =
    !isExpander || activationInterval === ''
      ? true
      : Number.isInteger(Number(activationInterval)) && Number(activationInterval) > 0;
  const totalAlignersValid = isClearAligner
    ? Number.isInteger(Number(totalAligners)) && Number(totalAligners) > 0
    : true;
  const daysPerAlignerValid = isClearAligner
    ? Number.isInteger(Number(daysPerAligner)) && Number(daysPerAligner) > 0
    : true;

  const handleSubmit = async () => {
    if (!startedAt) return;
    if (needsPrescribedHours && !prescribedHours.trim()) {
      const msg = i18nText('Orthodontic.modal.appliance.prescribedHoursRequired');
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (isClearAligner && (!totalAlignersValid || !daysPerAlignerValid)) {
      const msg = i18nText('Orthodontic.modal.appliance.alignerPlanRequired');
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (!activationIntervalValid) {
      const msg = i18nText('Orthodontic.modal.appliance.activationIntervalInvalid');
      setLocalError(msg);
      onError(msg);
      return;
    }
    try {
      onError(null);
      setLocalError(null);
      await insertOrthodonticAppliance({
        applianceId: ulid(),
        caseId,
        childId,
        childBirthDate,
        applianceType,
        status: 'active',
        startedAt,
        prescribedHoursPerDay: prescribedHours ? Number(prescribedHours) : null,
        prescribedActivations: prescribedActivations ? Number(prescribedActivations) : null,
        activationIntervalDays:
          isExpander && activationInterval !== '' ? Number(activationInterval) : null,
        totalAligners: isClearAligner ? Number(totalAligners) : null,
        daysPerAligner: isClearAligner ? Number(daysPerAligner) : null,
        // currentPhase + phaseStartedAt are paired: both set when the parent
        // picks an initial phase, both NULL otherwise (PO-ORTHO-013).
        currentPhase: currentPhase === '' ? null : currentPhase,
        phaseStartedAt: currentPhase === '' ? null : startedAt,
        reviewIntervalDays: reviewIntervalDays ? Number(reviewIntervalDays) : null,
        nextReviewAgenda: nextReviewAgenda.trim() === '' ? null : nextReviewAgenda.trim(),
        notes: null,
        now: isoNow(),
      });
      await onSaved();
    } catch (error) {
      catchLog('ortho', 'action:insert-appliance-failed')(error);
      const msg = error instanceof Error ? error.message : String(error);
      setLocalError(msg);
      onError(msg);
    }
  };

  const dateIsBeforeBirth = startedAt && childBirthDate && startedAt < childBirthDate;
  const startedAgeMonths = startedAt && childBirthDate
    ? computeAgeMonthsAt(childBirthDate, startedAt)
    : 0;

  return (
    <HealthRecordModalShell open size="S" onClose={onClose} ariaLabel={i18nText('Orthodontic.modal.appliance.createTitle')}>
      <ModalHeader title={i18nText('Orthodontic.modal.appliance.createTitle')} icon="🦷" onClose={onClose} />
      <ModalContent>
        <div className="space-y-4">
          {localError && <InlineError>{localError}</InlineError>}
          {eligibleTypes.length === 0 && (
            <InlineError>{i18nText('Orthodontic.modal.appliance.noEligibleTypes')}</InlineError>
          )}
          <FormField label={i18nText('Orthodontic.modal.appliance.typeLabel')}>
            <SelectField
              value={applianceType}
              onValueChange={(v) => handleTypeChange(v as OrthodonticApplianceType)}
              options={eligibleTypes.map((o) => ({ value: o.value, label: o.label }))}
              className="min-h-12"
            />
          </FormField>
          <FormField
            label={i18nText('Orthodontic.modal.appliance.startDate')}
            error={dateIsBeforeBirth ? i18nText('Orthodontic.modal.appliance.startDateBeforeBirth') : undefined}
          >
            <DatePicker
              value={startedAt}
              onChange={setStartedAt}
              className={cn('h-12', dateIsBeforeBirth && DANGER_DATE_FIELD_CLASS)}
            />
          </FormField>
          <FormField label={i18nText('Orthodontic.modal.appliance.prescribedHoursPerDayLabel')} required={needsPrescribedHours}>
            <TextField type="number" value={prescribedHours} onChange={(event) => setPrescribedHours(event.target.value)} className="w-full min-h-12" inputClassName={NUMBER_INPUT_CLASS} />
          </FormField>
          {isExpander && (
            <>
              <FormField label={i18nText('Orthodontic.modal.appliance.prescribedActivationsLabel')}>
                <TextField type="number" value={prescribedActivations} onChange={(event) => setPrescribedActivations(event.target.value)} className="w-full min-h-12" inputClassName={NUMBER_INPUT_CLASS} />
              </FormField>
              <FormField
                label={i18nText('Orthodontic.modal.appliance.activationIntervalLabel')}
                error={!activationIntervalValid ? i18nText('Orthodontic.modal.appliance.activationIntervalInvalid') : undefined}
              >
                <TextField
                  type="number"
                  tone={activationIntervalValid ? 'default' : 'danger'}
                  value={activationInterval}
                  onChange={(event) => setActivationInterval(event.target.value)}
                  placeholder={i18nText('Orthodontic.modal.appliance.activationIntervalPlaceholder')}
                  className="w-full min-h-12"
                  inputClassName={NUMBER_INPUT_CLASS}
                />
              </FormField>
            </>
          )}
          {isClearAligner && (
            <>
              <FormField
                label={i18nText('Orthodontic.modal.appliance.totalAlignersLabel')}
                error={!totalAlignersValid ? i18nText('Orthodontic.modal.appliance.totalAlignersInvalid') : undefined}
              >
                <TextField
                  type="number"
                  tone={totalAlignersValid ? 'default' : 'danger'}
                  value={totalAligners}
                  onChange={(event) => setTotalAligners(event.target.value)}
                  placeholder={i18nText('Orthodontic.modal.appliance.totalAlignersPlaceholder')}
                  className="w-full min-h-12"
                  inputClassName={NUMBER_INPUT_CLASS}
                />
              </FormField>
              <FormField
                label={i18nText('Orthodontic.modal.appliance.daysPerAlignerLabel')}
                error={!daysPerAlignerValid ? i18nText('Orthodontic.modal.appliance.daysPerAlignerInvalid') : undefined}
              >
                <TextField
                  type="number"
                  tone={daysPerAlignerValid ? 'default' : 'danger'}
                  value={daysPerAligner}
                  onChange={(event) => setDaysPerAligner(event.target.value)}
                  placeholder={i18nText('Orthodontic.modal.appliance.daysPerAlignerPlaceholder')}
                  className="w-full min-h-12"
                  inputClassName={NUMBER_INPUT_CLASS}
                />
              </FormField>
            </>
          )}
          <FormField label={i18nText('Orthodontic.modal.appliance.reviewIntervalDays')}>
            <TextField type="number" value={reviewIntervalDays} onChange={(event) => setReviewIntervalDays(event.target.value)} className="w-full min-h-12" inputClassName={NUMBER_INPUT_CLASS} />
          </FormField>
          <FormField label={i18nText('Orthodontic.modal.appliance.initialPhase')}>
            <SelectField
              value={currentPhase}
              onValueChange={setCurrentPhase}
              placeholder={i18nText('Orthodontic.modal.appliance.initialPhasePlaceholder')}
              options={APPLIANCE_PHASES[applianceType].map((p) => ({ value: p.phaseId, label: p.label }))}
              className="min-h-12"
            />
          </FormField>
          <FormField label={i18nText('Orthodontic.modal.appliance.nextReviewAgenda')}>
            <TextareaField
              value={nextReviewAgenda}
              onChange={(event) => setNextReviewAgenda(event.target.value)}
              placeholder={i18nText('Orthodontic.modal.appliance.nextReviewAgendaPlaceholder')}
              rows={3}
              className="w-full"
            />
          </FormField>
          {startedAt && childBirthDate && !dateIsBeforeBirth && (
            <p className="text-[12.5px] text-[var(--nimi-text-muted)]">
              {i18nText('Orthodontic.modal.appliance.startedAge', {
                years: Math.floor(startedAgeMonths / 12),
                months: startedAgeMonths % 12,
              })}
            </p>
          )}
        </div>
      </ModalContent>
      <ShellModalFooter>
        <Button type="button" onClick={onClose} tone="ghost" size="md">{i18nText('Orthodontic.modal.appliance.cancel')}</Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={
            eligibleTypes.length === 0
            || Boolean(dateIsBeforeBirth)
            || (needsPrescribedHours && !prescribedHours.trim())
            || (isClearAligner && (!totalAlignersValid || !daysPerAlignerValid))
            || !activationIntervalValid
          }
          tone="primary"
          size="md"
        >
          {i18nText('Orthodontic.modal.appliance.save')}
        </Button>
      </ShellModalFooter>
    </HealthRecordModalShell>
  );
}
