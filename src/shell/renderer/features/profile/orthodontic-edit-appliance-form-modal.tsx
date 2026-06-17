import { Button, Surface } from '@nimiplatform/kit/ui';
import { useState } from 'react';
import {
  deleteOrthodonticAppliance,
  updateOrthodonticApplianceReview,
  updateOrthodonticAppliancePlan,
  type OrthodonticApplianceRow,
} from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { applianceTypeLabel } from './orthodontic-derive.js';
import { applianceRequiresPrescribedHours } from './orthodontic-modal-domain.js';
import {
  FieldInput,
  FieldTextarea,
  Modal,
  ModalErrorBanner,
} from './orthodontic-modal-primitives.js';
import { i18nText } from '../../i18n/index.js';


/**
 * In-flight edit modal for an existing appliance. Surfaces what
 * `updateOrthodonticAppliancePlan` (`prescribedHoursPerDay` / `totalAligners`
 * / `daysPerAligner`) and `updateOrthodonticApplianceReview` (`nextReviewDate`)
 * actually admit; `applianceType` and `startedAt` are structural and shown
 * read-only. Same fail-close rules as the insert path (PO-ORTHO-003): a
 * clear-aligner must keep positive `totalAligners` + `daysPerAligner`;
 * non-clear-aligner cannot expose those fields at all.
 */
export function EditApplianceFormModal({
  appliance,
  onClose,
  onSaved,
  onError,
}: {
  appliance: OrthodonticApplianceRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const isClearAligner = appliance.applianceType === 'clear-aligner';
  const isExpander = appliance.applianceType === 'expander';
  const needsPrescribedHours = applianceRequiresPrescribedHours(appliance.applianceType);

  const [prescribedHours, setPrescribedHours] = useState<string>(
    appliance.prescribedHoursPerDay !== null ? String(appliance.prescribedHoursPerDay) : '',
  );
  const [totalAligners, setTotalAligners] = useState<string>(
    appliance.totalAligners !== null ? String(appliance.totalAligners) : '',
  );
  const [daysPerAligner, setDaysPerAligner] = useState<string>(
    appliance.daysPerAligner !== null ? String(appliance.daysPerAligner) : '',
  );
  const [activationInterval, setActivationInterval] = useState<string>(
    appliance.activationIntervalDays !== null ? String(appliance.activationIntervalDays) : '',
  );
  const [nextReviewDate, setNextReviewDate] = useState<string>(appliance.nextReviewDate ?? '');
  const [nextReviewAgenda, setNextReviewAgenda] = useState<string>(
    appliance.nextReviewAgenda ?? '',
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const prescribedHoursNum = Number(prescribedHours);
  const totalAlignersNum = Number(totalAligners);
  const daysPerAlignerNum = Number(daysPerAligner);
  const activationIntervalNum = Number(activationInterval);

  const prescribedHoursValid = needsPrescribedHours
    ? Number.isInteger(prescribedHoursNum) && prescribedHoursNum > 0 && prescribedHoursNum <= 24
    : true;
  const totalAlignersValid = isClearAligner
    ? Number.isInteger(totalAlignersNum) && totalAlignersNum > 0
    : true;
  const daysPerAlignerValid = isClearAligner
    ? Number.isInteger(daysPerAlignerNum) && daysPerAlignerNum > 0
    : true;
  // activationIntervalDays is expander-only and optional; when filled it must
  // be a positive integer (PO-ORTHO-014).
  const activationIntervalValid =
    !isExpander || activationInterval === ''
      ? true
      : Number.isInteger(activationIntervalNum) && activationIntervalNum > 0;
  const nextReviewValid = nextReviewDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(nextReviewDate);

  const formValid =
    prescribedHoursValid &&
    totalAlignersValid &&
    daysPerAlignerValid &&
    activationIntervalValid &&
    nextReviewValid;

  const handleSubmit = async () => {
    if (needsPrescribedHours && !prescribedHoursValid) {
      const msg = i18nText('Orthodontic.modal.appliance.prescribedHoursInvalid');
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
    if (!nextReviewValid) {
      const msg = i18nText('Orthodontic.modal.appliance.nextReviewDateInvalid');
      setLocalError(msg);
      onError(msg);
      return;
    }
    try {
      onError(null);
      setLocalError(null);
      const now = isoNow();
      await updateOrthodonticAppliancePlan({
        applianceId: appliance.applianceId,
        prescribedHoursPerDay: needsPrescribedHours ? prescribedHoursNum : null,
        totalAligners: isClearAligner ? totalAlignersNum : null,
        daysPerAligner: isClearAligner ? daysPerAlignerNum : null,
        activationIntervalDays:
          isExpander && activationInterval !== '' ? activationIntervalNum : null,
        nextReviewAgenda: nextReviewAgenda.trim() === '' ? null : nextReviewAgenda.trim(),
        now,
      });
      // Persist the review date only when the parent actually touched it.
      // Empty string clears the row; matching the existing value is a no-op
      // but we still skip the write to keep `lastReviewAt` untouched.
      if (nextReviewDate !== (appliance.nextReviewDate ?? '')) {
        await updateOrthodonticApplianceReview({
          applianceId: appliance.applianceId,
          lastReviewAt: appliance.lastReviewAt,
          nextReviewDate: nextReviewDate === '' ? null : nextReviewDate,
          now,
        });
      }
      await onSaved();
    } catch (error) {
      catchLog('ortho', 'action:update-appliance-plan-failed')(error);
      const msg = error instanceof Error ? error.message : String(error);
      setLocalError(msg);
      onError(msg);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(i18nText('Orthodontic.modal.appliance.confirmDelete'),
      )
    ) {
      return;
    }
    try {
      onError(null);
      setLocalError(null);
      setDeleting(true);
      await deleteOrthodonticAppliance(appliance.applianceId);
      await onSaved();
    } catch (error) {
      catchLog('ortho', 'action:delete-appliance-failed')(error);
      const msg = error instanceof Error ? error.message : String(error);
      setLocalError(msg);
      onError(msg);
      setDeleting(false);
    }
  };

  return (
    <Modal title={i18nText('Orthodontic.modal.appliance.editTitle')} onClose={onClose}>
      {localError && <ModalErrorBanner message={localError} onDismiss={() => setLocalError(null)} />}

      <Surface tone="panel" material="solid" elevation="base" padding="none" className="px-3 py-2 text-[13px] text-[var(--nimi-text-muted)]">
        {i18nText('Orthodontic.modal.appliance.typeLabel')} <strong className="ml-1.5 text-[var(--nimi-text-primary)]">{applianceTypeLabel(appliance.applianceType)}</strong>
        <span className="ml-3">{i18nText('Orthodontic.modal.appliance.enabledAt')}</span>
        <strong className="ml-1.5 text-[var(--nimi-text-primary)]">{appliance.startedAt}</strong>
      </Surface>

      {needsPrescribedHours && (
        <>
          <FieldInput label={i18nText('Orthodontic.modal.appliance.prescribedHoursLabel')} type="number" value={prescribedHours} onChange={setPrescribedHours}
            placeholder={i18nText('Orthodontic.modal.appliance.prescribedHoursPlaceholder')} />
          {!prescribedHoursValid && (
            <div className="text-[13px] text-[var(--nimi-status-danger)]">
              {i18nText('Orthodontic.modal.appliance.prescribedHoursInvalid')}
            </div>
          )}
        </>
      )}

      {isClearAligner && (
        <>
          <FieldInput label={i18nText('Orthodontic.modal.appliance.totalAlignersLabel')} type="number" value={totalAligners} onChange={setTotalAligners}
            placeholder={i18nText('Orthodontic.modal.appliance.totalAlignersPlaceholder')} />
          {!totalAlignersValid && (
            <div className="text-[13px] text-[var(--nimi-status-danger)]">
              {i18nText('Orthodontic.modal.appliance.totalAlignersInvalid')}
            </div>
          )}
          <FieldInput label={i18nText('Orthodontic.modal.appliance.daysPerAlignerLabel')} type="number" value={daysPerAligner} onChange={setDaysPerAligner}
            placeholder={i18nText('Orthodontic.modal.appliance.daysPerAlignerPlaceholder')} />
          {!daysPerAlignerValid && (
            <div className="text-[13px] text-[var(--nimi-status-danger)]">
              {i18nText('Orthodontic.modal.appliance.daysPerAlignerInvalid')}
            </div>
          )}
        </>
      )}

      {isExpander && (
        <>
          <FieldInput label={i18nText('Orthodontic.modal.appliance.activationIntervalLabel')} type="number" value={activationInterval}
            onChange={setActivationInterval} placeholder={i18nText('Orthodontic.modal.appliance.activationIntervalPlaceholder')} />
          {!activationIntervalValid && (
            <div className="text-[13px] text-[var(--nimi-status-danger)]">
              {i18nText('Orthodontic.modal.appliance.activationIntervalInvalid')}
            </div>
          )}
        </>
      )}

      <FieldInput label={i18nText('Orthodontic.modal.appliance.nextReviewDate')} type="date" value={nextReviewDate} onChange={setNextReviewDate}
        placeholder={i18nText('Orthodontic.modal.appliance.nextReviewDatePlaceholder')} />
      {!nextReviewValid && (
        <div className="text-[13px] text-[var(--nimi-status-danger)]">
          {i18nText('Orthodontic.modal.appliance.nextReviewDateInvalid')}
        </div>
      )}

      <FieldTextarea label={i18nText('Orthodontic.modal.appliance.nextReviewAgenda')} value={nextReviewAgenda}
        onChange={setNextReviewAgenda} placeholder={i18nText('Orthodontic.modal.appliance.nextReviewAgendaPlaceholder')} />

      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          tone="danger"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? i18nText('Orthodontic.modal.appliance.deleting') : i18nText('Orthodontic.modal.appliance.delete')}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" onClick={onClose} tone="ghost" size="sm" disabled={deleting}>
            {i18nText('Orthodontic.modal.appliance.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!formValid || deleting}
            tone="primary"
            size="sm"
          >
            {i18nText('Orthodontic.modal.appliance.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
