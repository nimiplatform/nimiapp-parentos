import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, Surface, TextareaField, Toggle as KitToggle } from '@nimiplatform/kit/ui';
import { Pencil, X } from 'lucide-react';
import type { NarrativeReportContent, ProfessionalSummary, ProfessionalSummarySection } from './structured-report.js';
import { i18nText } from '../../i18n/index.js';


interface SectionDraftChange {
  body?: string;
  enabled?: boolean;
}

function updateSection(
  summary: ProfessionalSummary,
  sectionId: string,
  change: SectionDraftChange,
): ProfessionalSummary {
  return {
    ...summary,
    sections: summary.sections.map((s) => s.id === sectionId ? { ...s, ...change } : s),
  };
}

function restoreSectionToAi(
  summary: ProfessionalSummary,
  sectionId: string,
): ProfessionalSummary {
  return {
    ...summary,
    sections: summary.sections.map((s) => s.id === sectionId ? { ...s, body: s.aiOriginal } : s),
  };
}

export function serializeProfessionalSummaryToText(
  summary: ProfessionalSummary,
  title: string,
): string {
  const enabled = summary.sections.filter((s) => s.enabled);
  const lines: string[] = [title, '', summary.childSummary, ''];
  for (const s of enabled) {
    lines.push(`【${s.title}】`);
    lines.push(s.body.trim() || i18nText('Reports.professional.notRecorded'));
    lines.push('');
  }
  lines.push('──');
  lines.push(summary.disclaimer);
  return lines.join('\n');
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}
function Toggle({ checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <span aria-label={ariaLabel} className="inline-flex shrink-0">
      <KitToggle checked={checked} onChange={onChange} />
    </span>
  );
}

interface ProfessionalSectionEditorProps {
  section: ProfessionalSummarySection;
  onBodyChange: (body: string) => void;
  onToggle: (enabled: boolean) => void;
  onRestore: () => void;
}
function ProfessionalSectionEditor({
  section, onBodyChange, onToggle, onRestore,
}: ProfessionalSectionEditorProps) {
  const isEdited = section.body !== section.aiOriginal;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.body);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(section.body); }, [section.body]);

  const start = () => {
    setDraft(section.body); setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  };
  const save = () => {
    onBodyChange(draft);
    setEditing(false);
  };

  return (
    <Surface
      as="article"
      tone={section.enabled ? 'card' : 'panel'}
      elevation="base"
      padding="none"
      className={`report-professional-section ${section.enabled ? '' : 'report-professional-section--disabled'}`}
    >
      <header className="report-professional-section-header">
        <h4 className="report-professional-section-title">
          {section.title}
          {isEdited ? (
            <span className="report-professional-edited">
              {i18nText('Reports.professional.edited')}
            </span>
          ) : null}
        </h4>
        <span className="report-professional-toggle-label">{section.enabled ? i18nText('Reports.professional.included') : i18nText('Reports.professional.hidden')}</span>
        <Toggle checked={section.enabled} onChange={onToggle} ariaLabel={i18nText('Reports.professional.includeAria', { title: section.title })} />
      </header>

      {editing ? (
        <>
          <TextareaField
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="report-radius-sm"
            textareaClassName="report-professional-textarea"
          />
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" tone="primary" onClick={save}>
              {i18nText('Reports.professional.save')}
            </Button>
            <Button size="sm" tone="ghost" onClick={() => { setDraft(section.body); setEditing(false); }}>
              {i18nText('Reports.professional.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="report-professional-section-body">
            {section.body || i18nText('Reports.professional.notRecorded')}
          </p>
          {section.enabled ? (
            <div className="report-professional-section-actions">
              <Button size="sm" tone="secondary" onClick={start} className="min-h-0 px-3 py-1 text-xs" leadingIcon={<Pencil size={11} />}>
                {i18nText('Reports.professional.edit')}
              </Button>
              {isEdited ? (
                <Button size="sm" tone="ghost" onClick={onRestore} className="min-h-0 px-3 py-1 text-[11.5px]">
                  {i18nText('Reports.professional.restoreAi')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Surface>
  );
}

/* ── Modal ───────────────────────────────────────────────────── */

interface ProfessionalViewProps {
  open: boolean;
  onClose: () => void;
  content: NarrativeReportContent;
  onContentUpdate?: (next: NarrativeReportContent) => void;
  title: string;
  onPrint?: () => void;
  onCopy?: (text: string) => void;
}

export function ProfessionalSummaryModal({
  open, onClose, content, onContentUpdate, title, onPrint, onCopy,
}: ProfessionalViewProps) {
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const summary = content.professionalSummary;

  const applySummary = (nextSummary: ProfessionalSummary) => {
    if (!onContentUpdate) return;
    onContentUpdate({ ...content, professionalSummary: nextSummary });
  };

  const handleCopy = () => {
    if (!summary) return;
    const text = serializeProfessionalSummaryToText(summary, title);
    if (onCopy) { onCopy(text); setCopyToast(i18nText('Reports.professional.copySuccess')); }
    else {
      navigator.clipboard?.writeText(text).then(
        () => setCopyToast(i18nText('Reports.professional.copySuccess')),
        () => setCopyToast(i18nText('Reports.professional.copyFailed')),
      );
    }
    setTimeout(() => setCopyToast(null), 1800);
  };

  const content_node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-summary-title"
      className="report-professional-backdrop"
      onClick={onClose}
    >
      <Surface
        tone="overlay"
        elevation="modal"
        padding="none"
        onClick={(e) => e.stopPropagation()}
        className="report-professional-modal"
      >
        <header className="report-professional-modal-header">
          <div>
            <div className="report-professional-eyebrow">
              {i18nText('Reports.professional.eyebrow')}
            </div>
            <h2 id="pro-summary-title" className="report-professional-title">
              {i18nText('Reports.professional.titlePrefix')} {title}
            </h2>
            {summary?.childSummary ? (
              <div className="report-professional-child-summary">{summary.childSummary}</div>
            ) : null}
          </div>
          <IconButton onClick={onClose} aria-label={i18nText('Reports.professional.close')} icon={<X size={18} />} size="sm" tone="ghost" />
        </header>

        <div className="report-professional-modal-body">
          {summary ? (
            <>
              <div className="report-professional-intro">
                <span className="report-strong">{i18nText('Reports.professional.introTitle')}</span>
                {i18nText('Reports.professional.introBody')}
              </div>
              <div className="report-professional-section-list">
                {summary.sections.map((s) => (
                  <ProfessionalSectionEditor key={s.id} section={s}
                    onBodyChange={(body) => applySummary(updateSection(summary, s.id, { body }))}
                    onToggle={(enabled) => applySummary(updateSection(summary, s.id, { enabled }))}
                    onRestore={() => applySummary(restoreSectionToAi(summary, s.id))} />
                ))}
              </div>
            </>
          ) : (
            <div className="report-professional-empty">
              {i18nText('Reports.professional.emptyTitle')}
              <br />
              {i18nText('Reports.professional.emptyBody')}
            </div>
          )}
        </div>

        <footer className="report-professional-modal-footer">
          {summary?.disclaimer ? (
            <div className="report-professional-disclaimer">
              {summary.disclaimer}
            </div>
          ) : <div className="report-professional-footer-spacer" />}
          <Button onClick={handleCopy} disabled={!summary} size="sm" tone="secondary">
            {copyToast ?? i18nText('Reports.professional.copy')}
          </Button>
          <Button onClick={onPrint} disabled={!summary || !onPrint} size="sm" tone="primary">
            {i18nText('Reports.professional.savePdf')}
          </Button>
        </footer>
      </Surface>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content_node, document.body);
}
