import { useRef, useState } from 'react';
import { Button, nimiToast } from '@nimiplatform/kit/ui';
import { Download, FileImage, FileText, GraduationCap, Pencil } from 'lucide-react';
import { describeError, logRendererEvent } from '../../infra/telemetry/renderer-log.js';
import { i18nText } from '../../i18n/index.js';

interface ReportActionBarProps {
  onSavePdf: () => Promise<boolean>;
  onSaveImage: () => Promise<boolean>;
  onOpenProfessional?: () => void;
  onRequestFocusNoteComposer?: () => void;
}

// @nimi-authority: rule.parentos.advs.r009
export function ReportActionBar({ onSavePdf, onSaveImage, onOpenProfessional, onRequestFocusNoteComposer }: ReportActionBarProps) {
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);
  const saving = useRef(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const runSave = async (kind: 'pdf' | 'png') => {
    if (saving.current) return;
    saving.current = true;
    setBusy(kind);
    try {
      const saved = await (kind === 'pdf' ? onSavePdf() : onSaveImage());
      if (saved) {
        nimiToast.success(i18nText(kind === 'pdf' ? 'Reports.actionBar.save.pdfSuccess' : 'Reports.actionBar.save.imageSuccess'));
        menu.current?.removeAttribute('open');
      }
    } catch (error) {
      const prefix = i18nText(kind === 'pdf' ? 'Reports.actionBar.save.pdfFailed' : 'Reports.actionBar.save.imageFailed');
      nimiToast.danger(i18nText('Reports.actionBar.save.failedWithDetail', {
        prefix, detail: error instanceof Error ? error.message : String(error),
      }));
      logRendererEvent({ level: 'error', area: 'reports', message: 'action:save-failed', details: { kind, ...describeError(error) } });
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };

  return <div className="report-toolbar hide-on-print">
    {onOpenProfessional && <Button size="sm" tone="ghost" onClick={onOpenProfessional}>
      <GraduationCap size={16} />{i18nText('Reports.workspace.professional')}
    </Button>}
    {onRequestFocusNoteComposer && <Button size="sm" tone="ghost" onClick={onRequestFocusNoteComposer}>
      <Pencil size={15} />{i18nText('Reports.workspace.addNote')}
    </Button>}
    <details ref={menu} className="report-save-menu" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        menu.current?.removeAttribute('open');
        menu.current?.querySelector('summary')?.focus();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) menu.current?.removeAttribute('open');
    }}>
      <summary><Download size={15} />{i18nText('Reports.workspace.save')}</summary>
      <div className="report-save-options">
        <Button tone="ghost" fullWidth disabled={busy !== null} loading={busy === 'pdf'} onClick={() => void runSave('pdf')}>
          <FileText size={16} />{i18nText('Reports.actionBar.save.pdf')}
        </Button>
        <Button tone="ghost" fullWidth disabled={busy !== null} loading={busy === 'png'} onClick={() => void runSave('png')}>
          <FileImage size={16} />{i18nText('Reports.actionBar.save.image')}
        </Button>
        <p>{i18nText('Reports.workspace.saveHelp')}</p>
      </div>
    </details>
  </div>;
}
