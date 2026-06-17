import { Button, DialogTitle, OverlayShell } from '@nimiplatform/kit/ui';
/**
 * Parent-initiated treatment-phase advance dialog (PO-ORTHO-013). The
 * per-appliance mirror of `OrthodonticStageConfirmDialog`: the phase pill on
 * every appliance card opens this, and confirming advances the appliance to
 * the immediate next `phaseId` in its type's sequence (the first phase when
 * none is set yet). Adjacency is re-enforced by the Rust command.
 */
import {
  advanceOrthodonticAppliancePhase,
  type OrthodonticApplianceRow,
} from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import {
  applianceTypeLabel,
  computeAppliancePhaseOptions,
} from './orthodontic-derive.js';
import { i18nText } from '../../i18n/index.js';


export function AppliancePhaseAdvanceDialog({
  appliance,
  onCancel,
  onConfirmed,
  onError,
}: {
  appliance: OrthodonticApplianceRow;
  onCancel: () => void;
  onConfirmed: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const options = computeAppliancePhaseOptions(appliance);
  const target = options.find((o) => o.advanceable) ?? null;
  const isInitial = appliance.currentPhase === null;

  const handleConfirm = async () => {
    if (!target) return;
    onError(null);
    try {
      await advanceOrthodonticAppliancePhase({
        applianceId: appliance.applianceId,
        nextPhase: target.phaseId,
        now: isoNow(),
      });
      await onConfirmed();
    } catch (error) {
      catchLog('ortho', 'action:advance-appliance-phase-failed')(error);
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <OverlayShell
      open
      kind="dialog"
      onClose={onCancel}
      closeOnBackdrop={false}
      panelClassName="w-auto min-w-[320px] max-w-[400px] rounded-2xl"
      contentClassName="!p-6 flex flex-col gap-3"
    >
        <DialogTitle className="sr-only">{i18nText('Orthodontic.phaseAdvance.dialogTitle')}</DialogTitle>
        {target ? (
          <>
            <h3 className="m-0 text-[16px] font-semibold text-[var(--nimi-text-primary)]">
              {isInitial
                ? i18nText('Orthodontic.phaseAdvance.initialTitle', {
                    applianceType: applianceTypeLabel(appliance.applianceType),
                    phase: target.label,
                  })
                : i18nText('Orthodontic.phaseAdvance.advanceTitle', { phase: target.label })}
            </h3>
            <p className="m-0 text-[14px] text-[var(--nimi-text-muted)]">
              {isInitial
                ? i18nText('Orthodontic.phaseAdvance.initialBody')
                : i18nText('Orthodontic.phaseAdvance.advanceBody')}
            </p>
          </>
        ) : (
          <>
            <h3 className="m-0 text-[16px] font-semibold text-[var(--nimi-text-primary)]">
              {i18nText('Orthodontic.phaseAdvance.noTargetTitle')}
            </h3>
            <p className="m-0 text-[14px] text-[var(--nimi-text-muted)]">
              {i18nText('Orthodontic.phaseAdvance.noTargetBody')}
            </p>
          </>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button
            tone="ghost"
            size="sm"
            onClick={onCancel}
          >
            {target ? i18nText('Orthodontic.phaseAdvance.cancel') : i18nText('Orthodontic.phaseAdvance.close')}
          </Button>
          {target && (
            <Button
              tone="primary"
              size="sm"
              onClick={() => void handleConfirm()}
            >
              {isInitial ? i18nText('Orthodontic.phaseAdvance.confirmInitial') : i18nText('Orthodontic.phaseAdvance.confirmAdvance')}
            </Button>
          )}
        </div>
    </OverlayShell>
  );
}
