import { reportActionIntent } from './structured-report.js';
import { useRef, useState } from 'react';
import { DestinationLink } from '../../app-shell/app-navigation.js';
import { Button, IconButton, TextareaField } from '@nimiplatform/kit/ui';
import { ArrowRight, Pencil } from 'lucide-react';
import { NoteAnchor } from './report-user-notes.js';
import { exportReportAsImage, exportReportAsPdf } from './report-export.js';
import { ReportActionBar } from './reports-action-bar.js';
import { ProfessionalSummaryModal } from './reports-professional-view.js';
import { isPlaceholderKeyword, type NarrativeReportContent, type NarrativeSection } from './structured-report.js';
import { i18nText } from '../../i18n/index.js';
import { isSparseReport, isUnrecordedSection } from './report-reading-model.js';


const KIND_META: Record<string, { labelKey: string; className: string }> = {
  growth:    { labelKey: 'Reports.monthly.kind.growth', className: 'report-monthly-kind-growth' },
  sleep:     { labelKey: 'Reports.monthly.kind.sleep', className: 'report-monthly-kind-sleep' },
  health:    { labelKey: 'Reports.monthly.kind.health', className: 'report-monthly-kind-health' },
  nutrition: { labelKey: 'Reports.monthly.kind.nutrition', className: 'report-monthly-kind-nutrition' },
  milestone: { labelKey: 'Reports.monthly.kind.milestone', className: 'report-monthly-kind-milestone' },
  journal:   { labelKey: 'Reports.monthly.kind.journal', className: 'report-monthly-kind-journal' },
  emotion:   { labelKey: 'Reports.monthly.kind.emotion', className: 'report-monthly-kind-emotion' },
  default:   { labelKey: 'Reports.monthly.kind.default', className: 'report-monthly-kind-default' },
};

function kindOf(section: NarrativeSection) {
  const id = (section.id || '').toLowerCase();
  for (const key of Object.keys(KIND_META)) {
    if (id.includes(key)) return KIND_META[key]!;
  }
  return KIND_META.default!;
}

/* ── Editable helpers ── */

function EditPencil({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      onClick={onClick}
      aria-label={i18nText('Reports.monthly.edit')}
      icon={<Pencil size={12} />}
      size="sm"
      tone="ghost"
      className="edit-pencil report-monthly-edit-pencil"
    />
  );
}

function HoverEditable({
  text, canEdit, onSave, children,
}: { text: string; canEdit: boolean; onSave: (v: string) => Promise<boolean> | undefined; children: (text: string) => React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const start = () => { setDraft(text); setEditing(true); setTimeout(() => ref.current?.focus(), 0); };
  if (editing) {
    return (
      <div>
        <TextareaField
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="report-monthly-edit-field"
          textareaClassName="report-monthly-edit-textarea"
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" tone="primary" loading={saving} disabled={saving} onClick={async () => {
            if (saving) return;
            setSaving(true);
            try { if (await onSave(draft)) setEditing(false); } finally { setSaving(false); }
          }}>{i18nText('Reports.monthly.save')}</Button>
          <Button size="sm" tone="ghost" disabled={saving} onClick={() => setEditing(false)}>{i18nText('Reports.monthly.cancel')}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="group report-monthly-editable">
      {children(text)}
      {canEdit && <EditPencil onClick={start} />}
    </div>
  );
}

/* ── Main viewer ── */

interface Props {
  content: NarrativeReportContent;
  reportId?: string;
  onContentUpdate?: (u: NarrativeReportContent) => Promise<boolean>;
  periodStart?: string;
  periodEnd?: string;
  ageMonthsStart?: number;
  ageMonthsEnd?: number;
  childName?: string;
}

// @nimi-authority: rule.parentos.advs.r009
export function MonthlyLetterViewer({
  content, reportId, onContentUpdate,
  periodStart, periodEnd, ageMonthsStart, ageMonthsEnd, childName,
}: Props) {
  const canEdit = Boolean(reportId && onContentUpdate);
  const editField = (field: 'opening' | 'closingMessage' | 'milestoneReplay', value: string) =>
    onContentUpdate?.({ ...content, [field]: value });
  const editSection = (id: string, narrative: string) =>
    onContentUpdate?.({
      ...content,
      narrativeSections: content.narrativeSections.map((s) => s.id === id ? { ...s, narrative } : s),
    });
  const handleNoteChange = (next: NarrativeReportContent) => onContentUpdate?.(next);

  const articleRef = useRef<HTMLElement>(null);
  const [professionalOpen, setProfessionalOpen] = useState(false);

  const reportFileStem = `${(childName && childName.trim()) || i18nText('Reports.monthly.defaultFileStem')}-${periodStart?.slice(0, 7) ?? ''}`;
  const handleSavePdf = async () => {
    const result = await exportReportAsPdf(articleRef.current, {
      filename: `${reportFileStem}.pdf`,
      backgroundColor: 'var(--nimi-surface-card)',
    });
    return Boolean(result.savedPath);
  };
  const handleSaveImage = async () => {
    const result = await exportReportAsImage(articleRef.current, {
      filename: `${reportFileStem}.png`,
      backgroundColor: 'var(--nimi-surface-card)',
    });
    return Boolean(result.savedPath);
  };
  const focusNoteComposer = () => {
    const composer = articleRef.current?.querySelector<HTMLElement>('.report-note-composer');
    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (composer instanceof HTMLButtonElement) composer.click();
      else composer.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
  };

  const heroKeyword = content.keyword?.trim() && !isPlaceholderKeyword(content.keyword) ? content.keyword.trim() : '';
  const highlights = [...new Set(content.highlights ?? [])].filter((text) => text.trim() && text !== content.opening);

  const periodLabel = periodStart && periodEnd
    ? `${periodStart.slice(0, 10)} → ${periodEnd.slice(0, 10)}`
    : content.subtitle;

  const formatAgeMonths = (m: number) => {
    const y = Math.floor(m / 12);
    const mm = m % 12;
    return mm === 0
      ? i18nText('Reports.monthly.age.years', { years: y })
      : i18nText('Reports.monthly.age.yearsMonths', { years: y, months: mm });
  };
  const ageLabel = ageMonthsStart != null && ageMonthsEnd != null
    ? (ageMonthsStart >= 24
        ? i18nText('Reports.monthly.age.range', { start: formatAgeMonths(ageMonthsStart), end: formatAgeMonths(ageMonthsEnd) })
        : i18nText('Reports.monthly.age.monthRange', { start: ageMonthsStart, end: ageMonthsEnd }))
    : null;

  const showDataPoints = (dp: NarrativeSection['dataPoints']) => dp && dp.length > 0;
  const sparse = isSparseReport(content);

  return (
    <div>
    <div className="report-monthly-actionbar-wrap">
      <ReportActionBar
        onSavePdf={handleSavePdf}
        onSaveImage={handleSaveImage}
        onOpenProfessional={content.professionalSummary ? () => setProfessionalOpen(true) : undefined}
        onRequestFocusNoteComposer={canEdit ? focusNoteComposer : undefined}
      />
    </div>

    <article
      ref={articleRef}
      className="report-printable-page report-monthly-page"
    >
      <header className="report-monthly-header">
        <div>
          <div className="report-monthly-issue">
            {content.format === 'narrative-ai' ? i18nText('Reports.monthly.aiWritten') : i18nText('Reports.page.ai.sourceLocal')}
          </div>
          <p className="report-monthly-period">{periodLabel}{ageLabel ? i18nText('Reports.monthly.periodAgeSuffix', { age: ageLabel }) : ''}</p>
        </div>
        {childName && periodStart && <div className="report-monthly-badge" aria-hidden="true">
          <div className="report-monthly-badge-inner">
            <div className="report-monthly-badge-month">{i18nText('Reports.monthly.monthBadge', { month: Number(periodStart.slice(5, 7)) })}</div>
            <div className={`report-monthly-badge-name ${childName.length <= 2 ? 'report-monthly-badge-name-lg' : childName.length <= 4 ? 'report-monthly-badge-name-md' : childName.length <= 6 ? 'report-monthly-badge-name-sm' : 'report-monthly-badge-name-xs'}`}>{childName}</div>
          </div>
        </div>}
      </header>
      <h2 className="report-monthly-title">{content.title}</h2>

      {sparse ? <SparseReportBody content={content} canEdit={canEdit} onContentUpdate={onContentUpdate} /> : <>
      <section className="report-monthly-hero">
        <h3 className="report-monthly-kicker">{i18nText('Reports.workspace.summary')}</h3>
        {heroKeyword && <p className="report-monthly-keyword">{heroKeyword}{content.keywordSub && <span className="report-monthly-keyword-sub">{content.keywordSub}</span>}</p>}
        {content.opening && <HoverEditable text={content.opening} canEdit={canEdit} onSave={(value) => editField('opening', value)}>
          {(text) => <p className="report-monthly-hero-line">{text}</p>}
        </HoverEditable>}
        <NoteAnchor anchor="opening" content={content} canEdit={canEdit} onChange={handleNoteChange} />
      </section>

      {content.metrics.length > 0 && <dl className="report-facts">
        {content.metrics.filter((metric) => !ageLabel || (metric.id !== 'age-range' && metric.id !== 'age')).map((metric) => <div key={metric.id}>
          <dt>{metric.label}</dt><dd>{metric.value}</dd>
          {metric.detail && <dd className="report-fact-detail">{metric.detail}</dd>}
        </div>)}
      </dl>}

      {content.narrativeSections.length === 0 && content.professionalSummary && <details className="report-record-details report-reading-section">
        <summary>{i18nText('Reports.workspace.recordSummary')}</summary>
        <dl className="report-trend-lines">{content.professionalSummary.sections.map((section) => <div key={section.id}>
          <dt>{section.title}</dt><dd>{section.body}</dd>
        </div>)}</dl>
      </details>}

      {highlights.length > 0 && <section className="report-monthly-highlights">
        <ul>{highlights.map((text) => <li key={text} className="report-monthly-highlight-body">{text}</li>)}</ul>
      </section>}

      {/* Narrative timeline */}
      {content.narrativeSections.length > 0 ? (
        <section className="report-monthly-timeline">
          <h3 className="report-monthly-section-title">
            {i18nText('Reports.workspace.details')}
          </h3>
          <div className="report-monthly-section-subtitle">
            {i18nText('Reports.monthly.timelineSubtitle', { count: content.narrativeSections.length })}
          </div>
          <ol className="report-monthly-timeline-list">
            {content.narrativeSections.map((sec) => {
              const k = kindOf(sec);
              return (
                <li key={sec.id} className={`report-monthly-timeline-item ${k.className}`}>
                  <div className="report-monthly-timeline-dot" />
                  <div>
                    <div className="report-monthly-kind-label">
                      {i18nText(k.labelKey)}
                    </div>
                    <h4 className="report-monthly-timeline-title">
                      {sec.title}
                    </h4>
                    <HoverEditable
                      text={sec.narrative}
                      canEdit={canEdit}
                      onSave={(v) => editSection(sec.id, v)}
                    >
                      {(t) => (
                        <p className="report-monthly-timeline-body">{t}</p>
                      )}
                    </HoverEditable>
                    {showDataPoints(sec.dataPoints) ? (
                      <div className="report-monthly-data-points">
                        {sec.dataPoints!.map((dp, i) => (
                          <span key={i} className="report-monthly-data-point">
                            {dp.label}: {dp.value}{dp.detail ? ` · ${dp.detail}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <NoteAnchor
                      anchor={`section:${sec.id}`}
                      content={content}
                      canEdit={canEdit}
                      onChange={handleNoteChange}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {content.trendSignals.length > 0 && <section className="report-reading-section">
        <h3>{i18nText('Reports.page.trendSignals')}</h3>
        <dl className="report-trend-lines">{content.trendSignals.map((signal) => <div key={signal.id}>
          <dt>{signal.title}</dt><dd>{signal.summary}</dd>
        </div>)}</dl>
      </section>}

      {/* Watch next — inline in letter flow */}
      {content.watchNext && content.watchNext.length > 0 ? (
        <section className="report-monthly-watch">
          <h3 className="report-monthly-section-title">
            {i18nText('Reports.monthly.watchTitle')}
          </h3>
          <div className="report-monthly-section-subtitle report-monthly-section-subtitle-tight">
            {i18nText('Reports.monthly.watchSubtitle')}
          </div>
          <ul className="report-monthly-watch-list">
            {content.watchNext.map((w, i) => (
              <li key={i} className="report-monthly-watch-item">
                <span className="report-monthly-watch-dot" />
                <span className="report-monthly-watch-copy">{w}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Next steps */}
      {content.actionItems.length > 0 ? (
        <section className="report-monthly-actions">
          <h3 className="report-monthly-section-title">
            {i18nText('Reports.monthly.actionsTitle')}
          </h3>
          <div className="report-monthly-section-subtitle">
            {i18nText('Reports.monthly.actionsSubtitle', { name: childName ?? content.title })}
          </div>
          <div className="report-monthly-action-list">
            {content.actionItems.map((a) => (
              <article key={a.id} className="report-monthly-action-item">
                <div className="report-monthly-action-icon"><ArrowRight size={15} strokeWidth={2} /></div>
                <div className="report-monthly-action-copy">
                  <h4 className="report-monthly-action-title">
                    {a.text}
                  </h4>
                  <DestinationLink destination={{ id: '/advisor' }} intent={reportActionIntent(a)} className="report-monthly-action-link">
                    {i18nText('Reports.monthly.discussInAdvisor')}
                    <ArrowRight size={11} strokeWidth={2} />
                  </DestinationLink>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {content.milestoneReplay && content.milestoneReplay !== content.opening && <section className="report-monthly-closing">
        <h3 className="report-monthly-section-title">{i18nText('Reports.workspace.replay')}</h3>
        <HoverEditable text={content.milestoneReplay} canEdit={canEdit} onSave={(value) => editField('milestoneReplay', value)}>
          {(text) => <p className="report-monthly-timeline-body">{text}</p>}
        </HoverEditable>
      </section>}
      <section className="report-monthly-closing">
        {content.closingMessage && content.closingMessage !== content.opening && <>
          <h3 className="report-monthly-section-title">{i18nText('Reports.workspace.closing')}</h3>
          <HoverEditable text={content.closingMessage} canEdit={canEdit} onSave={(value) => editField('closingMessage', value)}>
            {(text) => <p className="report-monthly-timeline-body">{text}</p>}
          </HoverEditable>
        </>}
        <NoteAnchor anchor="closingMessage" content={content} canEdit={canEdit} onChange={handleNoteChange} />
      </section>
      </>}

      {/* Sources footer */}
      <footer className="report-monthly-footer">
        <div>
          {i18nText('Reports.monthly.sourcesPrefix')}
          {content.sources.join(i18nText('Reports.monthly.sourcesSeparator'))}
        </div>
        {content.safetyNote ? (
          <div className="report-monthly-safety-note">{content.safetyNote}</div>
        ) : null}
      </footer>
    </article>

    <ProfessionalSummaryModal
      open={professionalOpen}
      onClose={() => setProfessionalOpen(false)}
      content={content}
      onContentUpdate={onContentUpdate}
      title={content.title}
    />
    </div>
  );
}

function SparseReportBody({ content, canEdit, onContentUpdate }: {
  content: NarrativeReportContent;
  canEdit: boolean;
  onContentUpdate?: (next: NarrativeReportContent) => Promise<boolean>;
}) {
  const summary = content.professionalSummary;
  const recorded = summary?.sections.filter((section) => !isUnrecordedSection(summary, section)) ?? [];
  const absent = summary?.sections.filter((section) => isUnrecordedSection(summary, section)) ?? [];
  const hasRecords = content.metrics.some((metric) => metric.id === 'evidence' && metric.value === '1');
  const noteAnchors = [...new Set((content.userNotes ?? []).map((note) => note.anchor))].filter((anchor) => anchor !== 'report');
  return <div className="report-sparse-reading">
    <section className="report-sparse-facts" aria-label={i18nText('Reports.workspace.recordedFacts')}>
      <h3>{i18nText(hasRecords ? 'Reports.workspace.recordedFacts' : 'Reports.workspace.noRecords')}</h3>
      {content.narrativeSections.length > 0 ? content.narrativeSections.map((section) => <div key={section.id}>
        <h4>{section.title}</h4>
        <HoverEditable text={section.narrative} canEdit={canEdit} onSave={(narrative) => onContentUpdate?.({ ...content,
          narrativeSections: content.narrativeSections.map((item) => item.id === section.id ? { ...item, narrative } : item),
        })}>{(text) => <p>{text}</p>}</HoverEditable>
      </div>) : recorded.map((section) => <div key={section.id}>
        <h4>{section.title}</h4><p>{section.body}</p>
      </div>)}
      {hasRecords && recorded.length === 0 && content.narrativeSections.length === 0 && <p>{i18nText('Reports.workspace.recordUnavailable')}</p>}
      <p className="report-sparse-context">{i18nText(hasRecords ? 'Reports.workspace.sparseContext' : 'Reports.workspace.emptyContext')}</p>
    </section>
    <section className="report-sparse-notes">
      {noteAnchors.map((anchor) => <NoteAnchor key={anchor} anchor={anchor} content={content} canEdit={canEdit} allowCompose={false} onChange={(next) => onContentUpdate?.(next)} />)}
      <NoteAnchor anchor="report" content={content} canEdit={canEdit} onChange={(next) => onContentUpdate?.(next)} />
    </section>
    {content.actionItems.length > 0 && <details data-report-export="when-open" className="report-record-details report-sparse-secondary">
      <summary>{i18nText('Reports.workspace.pendingActions', { count: content.actionItems.length })}</summary>
      <p className="report-sparse-context">{i18nText('Reports.workspace.pendingContext')}</p>
      <div className="report-reading-actions">{content.actionItems.map((action) => <DestinationLink key={action.id} destination={{ id: '/advisor' }} intent={reportActionIntent(action)}>
        <span>{action.text}</span><ArrowRight size={16} aria-hidden="true" />
      </DestinationLink>)}</div>
    </details>}
    <details data-report-export="when-open" className="report-record-details report-sparse-secondary">
      <summary>{i18nText('Reports.workspace.recordCoverage')}</summary>
      {content.opening && <HoverEditable text={content.opening} canEdit={canEdit} onSave={(opening) => onContentUpdate?.({ ...content, opening })}>{(text) => <p>{text}</p>}</HoverEditable>}
      {absent.length > 0 && <dl className="report-trend-lines">{absent.map((section) => <div key={section.id}><dt>{section.title}</dt><dd>{section.body}</dd></div>)}</dl>}
      {content.trendSignals.length > 0 && <dl className="report-trend-lines">{content.trendSignals.map((signal) => <div key={signal.id}><dt>{signal.title}</dt><dd>{signal.summary}</dd></div>)}</dl>}
      {content.closingMessage && content.closingMessage !== content.opening && <HoverEditable text={content.closingMessage} canEdit={canEdit} onSave={(closingMessage) => onContentUpdate?.({ ...content, closingMessage })}>{(text) => <p>{text}</p>}</HoverEditable>}
      {content.milestoneReplay && <p>{content.milestoneReplay}</p>}
      {content.highlights?.map((text) => <p key={text}>{text}</p>)}
      {content.watchNext?.map((text) => <p key={text}>{text}</p>)}
    </details>
  </div>;
}
