import { useEffect, useState } from 'react';
import { Button, Surface } from '@nimiplatform/kit/ui';
import { Check, FileImage, GraduationCap, LoaderCircle, Pencil, Printer } from 'lucide-react';
import { describeError, logRendererEvent } from '../../infra/telemetry/renderer-log.js';
import { i18nText } from '../../i18n/index.js';


const SERIF = "var(--font-serif, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', Georgia, serif)";
const MONO = "var(--nimi-font-mono, 'JetBrains Mono', 'SF Mono', ui-monospace, monospace)";

const FAMILY_PRESETS_STORAGE_KEY = 'parentos.reports.familyShareSelection.v1';

interface FamilyPreset { id: string; name: string; initial: string; toneClass: string }

const FAMILY_PRESETS: FamilyPreset[] = [
  { id: 'dad', name: i18nText('Reports.actionBar.family.presets.dad.name'), initial: i18nText('Reports.actionBar.family.presets.dad.initial'), toneClass: 'report-family-avatar--dad' },
  { id: 'mom', name: i18nText('Reports.actionBar.family.presets.mom.name'), initial: i18nText('Reports.actionBar.family.presets.mom.initial'), toneClass: 'report-family-avatar--mom' },
  { id: 'grandma-m', name: i18nText('Reports.actionBar.family.presets.grandmaMaternal.name'), initial: i18nText('Reports.actionBar.family.presets.grandmaMaternal.initial'), toneClass: 'report-family-avatar--grandma-m' },
  { id: 'grandpa-m', name: i18nText('Reports.actionBar.family.presets.grandpaMaternal.name'), initial: i18nText('Reports.actionBar.family.presets.grandpaMaternal.initial'), toneClass: 'report-family-avatar--grandpa-m' },
  { id: 'grandma-p', name: i18nText('Reports.actionBar.family.presets.grandmaPaternal.name'), initial: i18nText('Reports.actionBar.family.presets.grandmaPaternal.initial'), toneClass: 'report-family-avatar--grandma-p' },
  { id: 'grandpa-p', name: i18nText('Reports.actionBar.family.presets.grandpaPaternal.name'), initial: i18nText('Reports.actionBar.family.presets.grandpaPaternal.initial'), toneClass: 'report-family-avatar--grandpa-p' },
];

function loadFamilySelection(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(FAMILY_PRESETS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch { return new Set(); }
}

function saveFamilySelection(sel: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(FAMILY_PRESETS_STORAGE_KEY, JSON.stringify([...sel])); } catch { /* */ }
}

/* ── Toast ───────────────────────────────────────────────────── */

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="report-toast">
      {message}
    </div>
  );
}

/* ── Family share row ────────────────────────────────────────── */

interface FamilyShareRowProps {
  onShareSelected: (names: string[]) => void;
  selfRoleName?: string;
}

export function FamilyShareRow({ onShareSelected, selfRoleName }: FamilyShareRowProps) {
  const [selected, setSelected] = useState<Set<string>>(() => loadFamilySelection());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveFamilySelection(next);
      return next;
    });
  };

  const trimmedSelf = (selfRoleName ?? '').trim();
  const visiblePresets = FAMILY_PRESETS.filter((p) => p.name !== trimmedSelf);

  const selectedNames = FAMILY_PRESETS
    .filter((p) => p.name !== trimmedSelf && selected.has(p.id))
    .map((p) => p.name);

  return (
    <Surface
      className="report-family-share-row"
      tone="card"
      material="glass-thin"
      elevation="base"
      padding="none"
    >
      <div className="report-family-copy">
        <div className="report-family-heading">{i18nText('Reports.actionBar.family.heading')}</div>
        <div className="report-family-subtitle">{i18nText('Reports.actionBar.family.subtitle')}</div>
      </div>
      <div className="report-family-presets">
        {visiblePresets.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className="report-family-preset-button"
            >
              <span className={`report-family-avatar ${p.toneClass}`}>{p.initial}</span>
              <span>{p.name}</span>
              {on ? (
                <Check size={11} className="report-icon-accent" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
        {visiblePresets.length === 0 ? (
          <span className="report-empty-inline">
            {i18nText('Reports.actionBar.family.empty')}
          </span>
        ) : null}
      </div>
      <Button
        onClick={() => onShareSelected(selectedNames)}
        disabled={selectedNames.length === 0}
        tone="primary"
        size="sm"
        className="rounded-full"
      >
        {i18nText('Reports.actionBar.family.shareSelected')}
      </Button>
    </Surface>
  );
}

/* ── Action cards (top row: professional + note) ─────────────── */

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}

function ActionCard({ icon, title, subtitle, onClick, disabled, accent }: ActionCardProps) {
  return (
    <Surface
      as="button"
      onClick={onClick}
      disabled={disabled}
      interactive={!disabled}
      tone="card"
      material="glass-thin"
      elevation="base"
      padding="none"
      className="report-action-card"
    >
      <div className={`report-action-card-icon ${accent ? 'report-action-card-icon--accent' : ''}`}>
        {icon}
      </div>
      <div className="report-action-card-copy">
        <div className="report-action-card-title">
          {title}
        </div>
        <div className="report-action-card-subtitle">
          {subtitle}
        </div>
      </div>
    </Surface>
  );
}

/* ── Save panel (inline, below the action grid) ─────────────── */

type SaveKind = 'pdf' | 'png';

interface SavePanelButtonProps {
  icon: React.ReactNode;
  label: string;
  help: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}

function SavePanelButton({ icon, label, help, onClick, busy, disabled }: SavePanelButtonProps) {
  return (
    <Surface
      as="button"
      onClick={onClick}
      disabled={disabled || busy}
      interactive={!busy && !disabled}
      tone="card"
      material="glass-thin"
      elevation="base"
      padding="none"
      className="report-save-panel-button"
    >
      <div className="report-save-panel-icon">
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : icon}
      </div>
      <div className="report-save-panel-copy">
        <div className="report-save-panel-label">{busy ? i18nText('Reports.actionBar.save.busy') : label}</div>
        <div className="report-save-panel-help">{help}</div>
      </div>
    </Surface>
  );
}

interface SavePanelProps {
  onSavePdf: () => void;
  onSaveImage: () => void;
  busy: SaveKind | null;
}

function SavePanel({ onSavePdf, onSaveImage, busy }: SavePanelProps) {
  return (
    <div className="report-save-panel">
      <div className="report-save-panel-heading">{i18nText('Reports.actionBar.save.heading')}</div>
      <div className="report-save-panel-grid">
        <SavePanelButton
          icon={<Printer size={16} strokeWidth={1.8} />}
          label={i18nText('Reports.actionBar.save.pdf')}
          help={i18nText('Reports.actionBar.save.pdfHelp')}
          onClick={onSavePdf}
          busy={busy === 'pdf'}
          disabled={busy !== null && busy !== 'pdf'}
        />
        <SavePanelButton
          icon={<FileImage size={16} strokeWidth={1.8} />}
          label={i18nText('Reports.actionBar.save.image')}
          help={i18nText('Reports.actionBar.save.imageHelp')}
          onClick={onSaveImage}
          busy={busy === 'png'}
          disabled={busy !== null && busy !== 'png'}
        />
      </div>
    </div>
  );
}

/* ── Main bar ────────────────────────────────────────────────── */

interface ReportActionBarProps {
  childName: string;
  selfRoleName?: string;
  onSavePdf: () => Promise<void> | void;
  onSaveImage: () => Promise<void> | void;
  onOpenProfessional: () => void;
  onRequestFocusNoteComposer?: () => void;
  onFamilyShareToast?: (message: string) => void;
}

export function ReportActionBar({
  childName, selfRoleName, onSavePdf, onSaveImage, onOpenProfessional,
  onRequestFocusNoteComposer, onFamilyShareToast,
}: ReportActionBarProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<SaveKind | null>(null);

  const showToast = (msg: string) => {
    if (onFamilyShareToast) onFamilyShareToast(msg);
    else setToast(msg);
  };

  const handleFamilySelection = (names: string[]) => {
    if (names.length === 0) {
      showToast(i18nText('Reports.actionBar.family.selectOne'));
      return;
    }
    showToast(i18nText('Reports.actionBar.family.prepared', {
      names: names.join(i18nText('Common.list.separator')),
    }));
  };

  const runSave = async (kind: SaveKind, action: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      // Tauri rejects can be string / Error / plain object — surface
      // whatever we can so the user sees the actual failure instead of
      // a generic failure placeholder.
      let detail = '';
      if (error instanceof Error) detail = error.message;
      else if (typeof error === 'string') detail = error;
      else if (error && typeof error === 'object') detail = JSON.stringify(error);
      const prefix = kind === 'pdf'
        ? i18nText('Reports.actionBar.save.pdfFailed')
        : i18nText('Reports.actionBar.save.imageFailed');
      showToast(detail
        ? i18nText('Reports.actionBar.save.failedWithDetail', { prefix, detail })
        : i18nText('Reports.actionBar.save.retryLater', { prefix }));
      logRendererEvent({
        level: 'error',
        area: 'reports',
        message: 'action:save-failed',
        details: { kind, ...describeError(error) },
      });
    } finally {
      setBusy(null);
    }
  };

  const handleNote = () => {
    if (onRequestFocusNoteComposer) onRequestFocusNoteComposer();
    else showToast(i18nText('Reports.actionBar.note.hint'));
  };

  return (
    <Surface
      as="section"
      tone="card"
      material="glass-regular"
      elevation="raised"
      padding="none"
      className="report-action-bar hide-on-print"
    >
      <FamilyShareRow onShareSelected={handleFamilySelection} selfRoleName={selfRoleName} />

      <div className="report-action-grid report-action-grid--pair">
        <div className="report-min-w-0">
          <ActionCard
            icon={<GraduationCap size={16} strokeWidth={1.8} />}
            title={i18nText('Reports.actionBar.professional.title')}
            subtitle={i18nText('Reports.actionBar.professional.subtitle')}
            onClick={onOpenProfessional}
          />
        </div>
        <div className="report-min-w-0">
          <ActionCard
            icon={<Pencil size={16} strokeWidth={1.8} />}
            title={i18nText('Reports.actionBar.note.title')}
            subtitle={i18nText('Reports.actionBar.note.subtitle', { childName })}
            onClick={handleNote}
          />
        </div>
      </div>

      <SavePanel
        onSavePdf={() => void runSave('pdf', onSavePdf)}
        onSaveImage={() => void runSave('png', onSaveImage)}
        busy={busy}
      />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </Surface>
  );
}

/* Keep some atoms exported so the Letter viewer can label its print-safe
 * hash of the data source without duplicating styles. */
export { SERIF as REPORT_SERIF, MONO as REPORT_MONO };
