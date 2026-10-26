import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, nimiToast, Surface, TextareaField, Toggle as KitToggle } from '@nimiplatform/kit/ui';
import { Pencil, X } from 'lucide-react';
import type { NarrativeReportContent, ProfessionalSummary, ProfessionalSummarySection } from './structured-report.js';
import { i18nText } from '../../i18n/index.js';
import { exportReportAsPdf } from './report-export.js';
import { isUnrecordedSection } from './report-reading-model.js';


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
  onBodyChange: (body: string) => Promise<boolean> | undefined;
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
  const save = async () => {
    if (await onBodyChange(draft)) setEditing(false);
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
  onContentUpdate?: (next: NarrativeReportContent) => Promise<boolean>;
  title: string;
  onCopy?: (text: string) => void;
}

export function ProfessionalSummaryModal({
  open, onClose, content, onContentUpdate, title, onCopy,
}: ProfessionalViewProps) {
  const previewRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const focusable = () => {
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, summary, [tabindex="0"]');
      return Array.from(controls ?? []).filter((control) => control.getClientRects().length > 0);
    };
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingRef.current) closeRef.current();
      if (e.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  const summary = content.professionalSummary;

  const savePdf = async () => {
    if (!summary || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await exportReportAsPdf(previewRef.current, { filename: `${title}.pdf`, backgroundColor: 'var(--nimi-surface-card)' });
      if (result.savedPath) nimiToast.success(i18nText('Reports.actionBar.save.pdfSuccess'));
    } catch (error) {
      nimiToast.danger(i18nText('Reports.actionBar.save.failedWithDetail', {
        prefix: i18nText('Reports.actionBar.save.pdfFailed'), detail: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const applySummary = (nextSummary: ProfessionalSummary) => {
    if (!onContentUpdate) return;
    return onContentUpdate({ ...content, professionalSummary: nextSummary });
  };

  const handleCopy = () => {
    if (!summary) return;
    const text = serializeProfessionalSummaryToText(summary, title);
    if (onCopy) { onCopy(text); nimiToast.success(i18nText('Reports.professional.copySuccess')); }
    else {
      navigator.clipboard?.writeText(text).then(
        () => nimiToast.success(i18nText('Reports.professional.copySuccess')),
        () => nimiToast.danger(i18nText('Reports.professional.copyFailed')),
      );
    }
  };

  const renderSection = (section: ProfessionalSummarySection) => summary && <ProfessionalSectionEditor key={section.id} section={section}
    onBodyChange={(body) => applySummary(updateSection(summary, section.id, { body }))}
    onToggle={(enabled) => applySummary(updateSection(summary, section.id, { enabled }))}
    onRestore={() => applySummary(restoreSectionToAi(summary, section.id))} />;
  const unrecorded = summary?.sections.filter((section) => isUnrecordedSection(summary, section)) ?? [];

  const content_node = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-summary-title"
      className="report-professional-backdrop"
      onClick={() => { if (!saving) onClose(); }}
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
          <IconButton onClick={onClose} disabled={saving} aria-label={i18nText('Reports.professional.close')} icon={<X size={18} />} size="sm" tone="ghost" />
        </header>

        <div className="report-professional-modal-body">
          {summary ? (
            <>
              <div className="report-professional-intro">
                <span className="report-strong">{i18nText('Reports.professional.introTitle')}</span>
                {i18nText(summary.format === 'ai' ? 'Reports.professional.introBody' : 'Reports.workspace.professionalLocalIntro')}
              </div>
              <div className="report-professional-section-list">
                {summary.sections.filter((section) => !isUnrecordedSection(summary, section)).map(renderSection)}
                {unrecorded.length > 0 && <details className="report-record-details">
                  <summary>{i18nText('Reports.workspace.unrecordedDomains', { count: unrecorded.length })}</summary>
                  {unrecorded.map(renderSection)}
                </details>}
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
            {i18nText('Reports.professional.copy')}
          </Button>
          <Button onClick={() => void savePdf()} loading={saving} disabled={!summary || !summary.sections.some((section) => section.enabled) || saving} size="sm" tone="primary">
            {i18nText('Reports.professional.savePdf')}
          </Button>
        </footer>
      </Surface>
      {summary && <div className="report-export-staging" aria-hidden="true">
        <article ref={previewRef} className="report-professional-export">
          <h1>{title}</h1>
          <p>{summary.childSummary}</p>
          {summary.sections.filter((section) => section.enabled).map((section) => <section key={section.id}>
            <h2>{section.title}</h2><p>{section.body || i18nText('Reports.professional.notRecorded')}</p>
          </section>)}
          <footer>{summary.disclaimer}</footer>
        </article>
      </div>}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content_node, document.body);
}
