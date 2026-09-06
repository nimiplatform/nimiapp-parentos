import { useState } from 'react';
import { Button, IconButton, OverlayShell, TextField } from '@nimiplatform/kit/ui';
import { i18nText } from '../../i18n/index.js';

interface ScheduleModalProps {
  ruleTitle: string;
  suggestedDate: string;
  minDate: string;
  onConfirm: (date: string) => void;
  onClose: () => void;
}

/**
 * Schedule modal for the reminder 更多 menu — replaces the old window.prompt
 * flow, which never worked inside Electron (prompt() is unsupported there).
 */
// @nimi-authority: rule.parentos.remi.r005
export function ScheduleModal({ ruleTitle, suggestedDate, minDate, onConfirm, onClose }: ScheduleModalProps) {
  const [date, setDate] = useState(suggestedDate);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minDate;

  return (
    <OverlayShell
      open
      kind="dialog"
      onClose={onClose}
      panelClassName="w-[380px] parentos-radius-xl"
      title={(
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">📅</span>
            <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('Reminders.schedule.title')}</h2>
          </div>
          <IconButton onClick={onClose} icon="✕" aria-label={i18nText('Reminders.action.close')} tone="ghost" size="sm" className="h-7 min-h-7 w-7" />
        </div>
      )}
      footer={(
        <Button tone="primary" size="md" fullWidth disabled={!valid} onClick={() => onConfirm(date)}>
          {i18nText('Reminders.action.confirm')}
        </Button>
      )}
    >
      <p className="mb-1 text-[14px] text-[var(--nimi-text-primary)]">{ruleTitle}</p>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">{i18nText('Reminders.schedule.description')}</p>
      <TextField
        type="date"
        min={minDate}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        aria-label={i18nText('Reminders.schedule.title')}
        inputClassName="text-[14px]"
      />
    </OverlayShell>
  );
}
