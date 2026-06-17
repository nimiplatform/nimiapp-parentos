import { Button, IconButton, Surface, TextareaField, TextField } from '@nimiplatform/kit/ui';
import { useMemo, useState } from 'react';
import {
  insertUnwearInterval,
  type OrthodonticApplianceRow,
  type OrthodonticUnwearReason,
} from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { i18nText } from '../../i18n/index.js';


interface Props {
  appliance: OrthodonticApplianceRow;
  /** When true, endAt is forced to null (open interval, "started un-wearing now"). */
  openOnly?: boolean;
  /** Optional default startAt; defaults to now. */
  defaultStartAt?: string;
  /**
   * Optional seed for the reason field. Wave D quick-tag routing uses this
   * to land the parent on `OrthodonticUnwearReason='other'` when they tap
   * the missed-wear chip, so we skip an extra click.
   */
  defaultReason?: OrthodonticUnwearReason;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}

const REASON_OPTIONS: { value: OrthodonticUnwearReason; label: string }[] = [
  { value: 'meal', label: i18nText('Orthodontic.unwear.reason.meal') },
  { value: 'sport', label: i18nText('Orthodontic.unwear.reason.sport') },
  { value: 'school', label: i18nText('Orthodontic.unwear.reason.school') },
  { value: 'sleep', label: i18nText('Orthodontic.unwear.reason.sleep') },
  { value: 'other', label: i18nText('Orthodontic.unwear.reason.other') },
];

/**
 * Modal form for recording or backfilling a wear-gap interval (PO-ORTHO-005a).
 *
 * Two flows:
 *  - Quick "open now" (`openOnly`=true, parent just took the appliance out) →
 *    submits with `endAt = null`. UI hides the endAt field.
 *  - Backfill → both startAt and endAt fields shown.
 *
 * Reason and notes are optional. Validation runs both client-side (for fast
 * feedback) and server-side (Rust fail-close).
 */
export function OrthodonticUnwearForm({
  appliance,
  openOnly = false,
  defaultStartAt,
  defaultReason,
  onClose,
  onSaved,
  onError,
}: Props) {
  const initialStart = useMemo(() => defaultStartAt ?? toLocalInputValue(new Date()), [defaultStartAt]);
  const [startAt, setStartAt] = useState(initialStart);
  const [endAt, setEndAt] = useState<string>('');
  const [reason, setReason] = useState<OrthodonticUnwearReason | ''>(defaultReason ?? '');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const startIso = useMemo(() => fromLocalInputValue(startAt), [startAt]);
  const endIso = useMemo(() => (endAt ? fromLocalInputValue(endAt) : null), [endAt]);
  const endBeforeStart = endIso !== null && startIso >= endIso;

  const handleSubmit = async () => {
    if (!startIso) {
      setLocalError(i18nText('Orthodontic.unwear.error.missingStart'));
      return;
    }
    if (endBeforeStart) {
      setLocalError(i18nText('Orthodontic.unwear.error.endBeforeStart'));
      return;
    }
    setLocalError(null);
    onError(null);
    try {
      await insertUnwearInterval({
        intervalId: ulid(),
        childId: appliance.childId,
        caseId: appliance.caseId,
        applianceId: appliance.applianceId,
        startAt: startIso,
        endAt: openOnly ? null : endIso,
        reason: reason === '' ? null : reason,
        notes: notes.trim() === '' ? null : notes.trim(),
        now: isoNow(),
      });
      await onSaved();
    } catch (error) {
      catchLog('ortho', 'action:insert-unwear-interval-failed')(error);
      const msg = error instanceof Error ? error.message : String(error);
      setLocalError(msg);
      onError(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={i18nText('Orthodontic.unwear.dialogLabel')}
      className="fixed inset-0 z-[100] grid place-items-center bg-[var(--nimi-scrim-modal)] p-4"
    >
      <Surface
        tone="overlay"
        material="glass-thick"
        elevation="modal"
        padding="lg"
        className="flex flex-col gap-3"
        style={{
          minWidth: 360,
          maxWidth: 460,
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[16px] font-semibold text-[var(--nimi-text-primary)]">
            {openOnly ? i18nText('Orthodontic.unwear.title.open') : i18nText('Orthodontic.unwear.title.backfill')}
          </h3>
          <IconButton
            aria-label={i18nText('Orthodontic.unwear.close')}
            onClick={onClose}
            size="sm"
            tone="ghost"
            icon={<span aria-hidden="true" className="text-[18px] leading-none">×</span>}
          />
        </div>

        {localError && (
          <div
            role="alert"
            className="rounded-md border border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-3 py-2 text-[13px] text-[var(--nimi-status-danger)]"
          >
            {localError}
          </div>
        )}

        <label className="flex flex-col gap-1 text-[14px] text-[var(--nimi-text-muted)]">
          {i18nText('Orthodontic.unwear.startAt')}
          <TextField
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="text-[14px]"
          />
        </label>

        {!openOnly && (
          <label className="flex flex-col gap-1 text-[14px] text-[var(--nimi-text-muted)]">
            {i18nText('Orthodontic.unwear.endAt')}
            <TextField
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="text-[14px]"
            />
            {endBeforeStart && (
              <span className="text-[13px] text-[var(--nimi-status-danger)]">
                {i18nText('Orthodontic.unwear.error.endBeforeStart')}
              </span>
            )}
          </label>
        )}

        <fieldset className="flex flex-col gap-1.5 border-0 p-0 text-[14px] text-[var(--nimi-text-muted)]">
          <legend>{i18nText('Orthodontic.unwear.reasonLabel')}</legend>
          <div className="flex items-center gap-2 flex-wrap">
            {REASON_OPTIONS.map((opt) => {
              const active = reason === opt.value;
              return (
                <Button
                  key={opt.value}
                  onClick={() => setReason(active ? '' : opt.value)}
                  tone={active ? 'primary' : 'secondary'}
                  size="sm"
                  className="text-[13px]"
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-[14px] text-[var(--nimi-text-muted)]">
          {i18nText('Orthodontic.unwear.notesLabel')}
          <TextareaField
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-[14px]"
            placeholder={i18nText('Orthodontic.unwear.notesPlaceholder')}
          />
        </label>

        <div className="flex justify-end gap-2 mt-2">
          <Button
            onClick={onClose}
            tone="ghost"
            size="sm"
          >
            {i18nText('Orthodontic.unwear.cancel')}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={endBeforeStart}
            tone="primary"
            size="sm"
          >
            {i18nText('Orthodontic.unwear.save')}
          </Button>
        </div>
      </Surface>
    </div>
  );
}

/** Converts a Date to the local-time string accepted by `<input type="datetime-local">`. */
function toLocalInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/** Converts a local-time `<input type="datetime-local">` value to ISO 8601 UTC. */
function fromLocalInputValue(value: string): string {
  // Browsers interpret datetime-local without TZ as local time. Construct a Date
  // from the parts then serialize to ISO (which is UTC).
  if (!value) return '';
  return new Date(value).toISOString();
}
