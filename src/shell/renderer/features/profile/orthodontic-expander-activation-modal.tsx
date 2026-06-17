import { Surface } from '@nimiplatform/kit/ui';
/**
 * Records an expander activation turn (PO-ORTHO-005 `expander-activation`
 * checkin / PO-ORTHO-014). Opened from the expander card's activation action.
 * Bilateral / per-screw turn detail remains free-text in `notes`; the schema
 * deliberately does not structure it (PO-ORTHO-014).
 */
import { useState } from 'react';
import {
  insertOrthodonticCheckin,
  type OrthodonticApplianceRow,
} from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { toLocalDatetimeInputValue } from './orthodontic-treatment-card-parts.js';
import {
  FieldInput,
  FieldTextarea,
  Modal,
  ModalErrorBanner,
  ModalFooter,
} from './orthodontic-modal-primitives.js';
import { i18nText } from '../../i18n/index.js';


export function OrthodonticExpanderActivationModal({
  appliance,
  onClose,
  onSaved,
  onError,
}: {
  appliance: OrthodonticApplianceRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const nextIndex = appliance.completedActivations + 1;
  const cap = appliance.prescribedActivations;
  const overCap = cap !== null && nextIndex > cap;

  const [activationIndex, setActivationIndex] = useState(String(nextIndex));
  const [at, setAt] = useState(() => toLocalDatetimeInputValue(new Date()));
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const indexNum = Number(activationIndex);
  const indexValid = Number.isInteger(indexNum) && indexNum >= 1;
  const atValid = at !== '' && !Number.isNaN(new Date(at).getTime());
  const formValid = indexValid && atValid && !overCap;

  const handleSubmit = async () => {
    if (!indexValid) {
      const msg = i18nText('Orthodontic.expanderActivation.error.invalidIndex');
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (!atValid) {
      const msg = i18nText('Orthodontic.expanderActivation.error.invalidTime');
      setLocalError(msg);
      onError(msg);
      return;
    }
    const checkinAtIso = new Date(at).toISOString();
    try {
      onError(null);
      setLocalError(null);
      await insertOrthodonticCheckin({
        checkinId: ulid(),
        childId: appliance.childId,
        caseId: appliance.caseId,
        applianceId: appliance.applianceId,
        checkinType: 'expander-activation',
        checkinDate: checkinAtIso.slice(0, 10),
        checkinAt: checkinAtIso,
        activationIndex: indexNum,
        alignerIndex: null,
        notes: notes.trim() === '' ? null : notes.trim(),
        now: isoNow(),
      });
      await onSaved();
    } catch (error) {
      catchLog('ortho', 'action:expander-activation-failed')(error);
      const msg = error instanceof Error ? error.message : String(error);
      setLocalError(msg);
      onError(msg);
    }
  };

  return (
    <Modal title={i18nText('Orthodontic.expanderActivation.title')} onClose={onClose}>
      {localError && <ModalErrorBanner message={localError} onDismiss={() => setLocalError(null)} />}

      <Surface tone="card" material="solid" elevation="base" padding="none" className="rounded-md border border-[color-mix(in_srgb,var(--nimi-border-subtle)_70%,transparent)] bg-[color-mix(in_srgb,var(--nimi-text-primary)_4%,transparent)] px-3 py-2 text-[13px] text-[var(--nimi-text-muted)]">
        {cap !== null
          ? i18nText('Orthodontic.expanderActivation.completedWithCap', {
              completed: appliance.completedActivations,
              cap,
            })
          : i18nText('Orthodontic.expanderActivation.completed', {
              completed: appliance.completedActivations,
            })}
      </Surface>

      <FieldInput
        label={i18nText('Orthodontic.expanderActivation.indexLabel')}
        type="number"
        value={activationIndex}
        onChange={setActivationIndex}
        placeholder={i18nText('Orthodontic.common.defaultValue', { value: nextIndex })}
      />
      {overCap && (
        <div className="text-[13px] text-[var(--nimi-status-danger)]">
          {i18nText('Orthodontic.expanderActivation.overCap', { cap })}
        </div>
      )}

      <FieldInput
        label={i18nText('Orthodontic.expanderActivation.timeLabel')}
        type="datetime-local"
        value={at}
        onChange={setAt}
      />

      <FieldTextarea
        label={i18nText('Orthodontic.expanderActivation.notesLabel')}
        value={notes}
        onChange={setNotes}
        placeholder={i18nText('Orthodontic.expanderActivation.notesPlaceholder')}
      />

      <ModalFooter
        onCancel={onClose}
        onSubmit={() => void handleSubmit()}
        submitLabel={i18nText('Orthodontic.expanderActivation.submit')}
        disabled={!formValid}
      />
    </Modal>
  );
}
