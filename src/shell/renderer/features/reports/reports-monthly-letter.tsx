import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, IconButton, StatusBadge, TextareaField } from '@nimiplatform/kit/ui';
import { AlertCircle, ArrowRight, Heart, Pencil, Quote } from 'lucide-react';
import { NoteAnchor } from './report-user-notes.js';
import { exportReportAsImage, exportReportAsPdf, printReport } from './report-export.js';
import { ReportActionBar } from './reports-action-bar.js';
import { ProfessionalSummaryModal } from './reports-professional-view.js';
import { isPlaceholderKeyword, type NarrativeReportContent, type NarrativeSection } from './structured-report.js';
import { i18nText } from '../../i18n/index.js';


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

// Old reports generated before the child-centric prompt change may contain
// caregiver-addressed openers. Detect those and fall back to safer text so
// the hero does not foreground the wrong subject.
const CAREGIVER_PATTERNS: RegExp[] = [
  new RegExp('^\\u4eb2\\u7231\\u7684(\\u5988\\u5988|\\u7238\\u7238|\\u5bb6\\u957f|\\u7236\\u6bcd|\\u7239\\u5a18|\\u7237\\u7237|\\u5976\\u5976|\\u5916\\u516c|\\u5916\\u5a46|\\u59e5\\u59e5|\\u59e5\\u7237|\\u4f60)'),
  new RegExp('^(\\u611f\\u8c22|\\u8c22\\u8c22)(\\u4f60|\\u4f60\\u4eec|\\u5927\\u5bb6|\\u5bb6\\u4eba|\\u7238\\u7238?|\\u5988\\u5988?|\\u7237\\u7237|\\u5976\\u5976|\\u5916\\u516c|\\u5916\\u5a46|\\u59e5\\u59e5|\\u59e5\\u7237)'),
  new RegExp('^\\u4f60\\u8fd9\\u4e2a\\u6708'),
  new RegExp('^\\u4f60\\u8f9b\\u82e6\\u4e86'),
  new RegExp('^\\u81f4\\s*(\\u5988\\u5988|\\u7238\\u7238|\\u5bb6\\u957f|\\u7236\\u6bcd)'),
];

const CHILD_NAME_TITLE_SUFFIX = new RegExp('\\u7684?(\\u6708\\u5ea6|\\u672c\\u6708|\\u8fd9\\u4e2a\\u6708|\\u56db\\u6708|\\u4e09\\u6708|\\u4e94\\u6708).*$');

function looksCaregiverAddressed(text: string | null | undefined): boolean {
  if (!text) return false;
  const head = text.trim().slice(0, 24);
  return CAREGIVER_PATTERNS.some((re) => re.test(head));
}

function sanitizeForChildFocus(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (looksCaregiverAddressed(trimmed)) return null;
  return trimmed;
}

function splitTeaser(source: string): { keyword: string; sub: string } {
  const trimmed = source.trim();
  if (!trimmed) return { keyword: '', sub: '' };
  const match = trimmed.match(/^([\u4e00-\u9fa5]{2,4}|\S{2,6})[、；;：:，,。.\s·—-]+(.+)$/);
  if (match) return { keyword: match[1]!, sub: match[2]!.trim() };
  if (trimmed.length <= 6) return { keyword: trimmed, sub: '' };
  // No clean punctuation boundary. Do not chop mid-token; let the caller try
  // the next source.
  return { keyword: '', sub: trimmed };
}

function firstSentence(text: string) {
  if (!text) return '';
  const m = text.trim().match(/^[^。.!?！？]+[。.!?！？]?/);
  return m ? m[0]!.trim() : text.trim();
}

function monthFromIso(iso: string | undefined) {
  const d = iso ? new Date(iso) : new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function badgeNameSizeClass(name: string) {
  if (name.length <= 2) return 'report-monthly-badge-name-lg';
  if (name.length <= 4) return 'report-monthly-badge-name-md';
  if (name.length <= 6) return 'report-monthly-badge-name-sm';
  return 'report-monthly-badge-name-xs';
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
}: { text: string; canEdit: boolean; onSave: (v: string) => void; children: (text: string) => React.ReactNode }) {
  const [editing, setEditing] = useState(false);
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
          <Button size="sm" tone="primary" onClick={() => { onSave(draft); setEditing(false); }}>{i18nText('Reports.monthly.save')}</Button>
          <Button size="sm" tone="ghost" onClick={() => setEditing(false)}>{i18nText('Reports.monthly.cancel')}</Button>
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

/* ── Icons ── */

function QuoteIcon({ size = 26 }: { size?: number }) {
  return <Quote size={size} strokeWidth={1.5} />;
}

/* ── Main viewer ── */

interface Props {
  content: NarrativeReportContent;
  reportId?: string;
  onContentUpdate?: (u: NarrativeReportContent) => void;
  periodStart?: string;
  periodEnd?: string;
  ageMonthsStart?: number;
  ageMonthsEnd?: number;
  childName?: string;
  /** Current user's family role, taken from child.recorderProfiles[0].name. */
  selfRoleName?: string;
}

export function MonthlyLetterViewer({
  content, reportId, onContentUpdate,
  periodStart, periodEnd, ageMonthsStart, ageMonthsEnd, childName, selfRoleName,
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
  const [professionalPrintPending, setProfessionalPrintPending] = useState(false);

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
  const handlePrintProfessional = () => {
    // Close the modal so only the professional printable subtree remains
    // visible; styles.css hides the letter article by scope.
    setProfessionalOpen(false);
    setProfessionalPrintPending(true);
    setTimeout(() => {
      printReport('professional');
      setProfessionalPrintPending(false);
    }, 50);
  };
  const focusNoteComposer = () => {
    const composer = articleRef.current?.querySelector<HTMLElement>('.report-note-composer');
    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (composer.querySelector('button, textarea') as HTMLElement | null)?.focus();
    }
  };

  const { month } = monthFromIso(periodStart ?? content.generatedAt);
  const issueNo = String(month).padStart(2, '0');
  const name = (childName && childName.trim()) || content.title.replace(CHILD_NAME_TITLE_SUFFIX, '').trim() || 'Ta';

  const cleanTeaser = sanitizeForChildFocus(content.teaser);
  const cleanOpening = sanitizeForChildFocus(content.opening);
  const cleanClosing = sanitizeForChildFocus(content.closingMessage);

  // Hero keyword — prefer the AI-distilled `keyword` field. Fall back to
  // deriving from teaser/opening (with name-guard) for legacy reports.
  let heroKeyword = '';
  let heroSub = '';
  const nameLower = name.trim().toLowerCase();
  const keywordIsName = (k: string) => {
    const t = k.trim().toLowerCase();
    return !t || t === nameLower || t.startsWith(nameLower) || nameLower.startsWith(t);
  };
  if (content.keyword && content.keyword.trim() && !keywordIsName(content.keyword) && !isPlaceholderKeyword(content.keyword)) {
    heroKeyword = content.keyword.trim();
    heroSub = (content.keywordSub && content.keywordSub.trim()) || '';
  } else {
    const sources = [
      cleanTeaser,
      cleanOpening ? firstSentence(cleanOpening) : null,
      content.narrativeSections[0]?.title ?? null,
    ].filter((s): s is string => Boolean(s));
    for (const src of sources) {
      const split = splitTeaser(src);
      if (split.keyword && !keywordIsName(split.keyword) && !isPlaceholderKeyword(split.keyword)) {
        heroKeyword = split.keyword;
        heroSub = split.sub;
        break;
      }
    }
  }

  const heroLine = cleanOpening ?? cleanTeaser ?? '';

  const isLegacyCaregiverAddressed =
    looksCaregiverAddressed(content.opening) ||
    looksCaregiverAddressed(content.teaser) ||
    looksCaregiverAddressed(content.closingMessage);

  const momentsCount = content.narrativeSections.length
    + (content.highlights?.length ?? 0)
    + (content.milestoneReplay ? 1 : 0);

  const highlights = (content.highlights?.length ?? 0) > 0
    ? content.highlights!.slice(0, 3).map((body, i) => ({
        title: firstSentence(body) || i18nText('Reports.monthly.highlightTitle', { index: i + 1 }),
        body,
      }))
    : [];

  const pullQuoteRaw = cleanClosing
    || content.milestoneReplay
    || cleanTeaser
    || (cleanOpening ? firstSentence(cleanOpening) : null)
    || '';
  const pullQuoteField: 'closingMessage' | 'milestoneReplay' | 'opening' | null =
    cleanClosing ? 'closingMessage'
      : content.milestoneReplay ? 'milestoneReplay'
        : cleanOpening ? 'opening' : null;

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
  const badgeNameClass = badgeNameSizeClass(name);

  const showDataPoints = (dp: NarrativeSection['dataPoints']) => dp && dp.length > 0;

  return (
    <div>
    <article
      ref={articleRef}
      className="report-printable-page report-monthly-page"
    >
      {/* paper grain */}
      <div aria-hidden className="report-monthly-grain" />

      {/* Legacy-format banner — shown only when stored AI text still addresses the caregiver */}
      {isLegacyCaregiverAddressed ? (
        <div className="report-legacy-banner hide-on-print report-monthly-legacy-banner">
          <AlertCircle size={16} strokeWidth={2} className="report-monthly-legacy-icon" />
          <div className="report-monthly-legacy-copy">
            {i18nText('Reports.monthly.legacyBanner', { name })}
          </div>
        </div>
      ) : null}

      {/* dateline + round badge */}
      <header className="report-monthly-header">
        <div>
          <div className="report-monthly-issue">
            {i18nText('Reports.monthly.issue', { issueNo })}
            {content.format === 'narrative-ai' ? (
              <StatusBadge tone="success" className="ml-2 px-2 py-px text-[11px]">{i18nText('Reports.monthly.aiWritten')}</StatusBadge>
            ) : null}
          </div>
          <div className="report-monthly-period">
            {periodLabel}
            {ageLabel ? i18nText('Reports.monthly.periodAgeSuffix', { age: ageLabel }) : ''}
            {momentsCount ? i18nText('Reports.monthly.periodMomentsSuffix', { count: momentsCount }) : ''}
          </div>
        </div>
        <div className="report-monthly-badge">
          <div className="report-monthly-badge-inner">
            <div className="report-monthly-badge-month">{i18nText('Reports.monthly.monthBadge', { month })}</div>
            <div className={`report-monthly-badge-name ${badgeNameClass}`}>
              {name}
            </div>
          </div>
        </div>
      </header>

      {/* Title */}
      <h1 className="report-monthly-title">
        {content.title}
      </h1>

      {/* Hero keyword + line */}
      <section className="report-hero-block report-monthly-hero">
        <div className="report-monthly-kicker">
          {i18nText('Reports.monthly.keywordKicker')}
        </div>
        {heroKeyword ? (
          <h2 className="report-monthly-keyword">
            {heroKeyword}
            {heroSub ? (
              <span className="report-monthly-keyword-sub">
                · {heroSub}
              </span>
            ) : null}
          </h2>
        ) : null}
        {heroLine ? (
          <HoverEditable text={heroLine} canEdit={canEdit} onSave={(v) => editField('opening', v)}>
            {(t) => (
              <div className="report-monthly-hero-line">
                {t}
              </div>
            )}
          </HoverEditable>
        ) : null}
        <NoteAnchor anchor="opening" content={content} canEdit={canEdit} onChange={handleNoteChange} />
      </section>

      {/* Letter body — child-centric opening stats */}
      <section className="report-monthly-intro">
        <p className="report-monthly-paragraph-spaced">
          {ageLabel
            ? i18nText('Reports.monthly.introStatsWithAge', { name, age: ageLabel, moments: momentsCount, sections: content.narrativeSections.length })
            : i18nText('Reports.monthly.introStats', { name, moments: momentsCount, sections: content.narrativeSections.length })}
        </p>
        <p className="report-monthly-paragraph-muted">
          {i18nText('Reports.monthly.introSubtitle', { name })}
        </p>
      </section>

      {/* Three highlights — numbered */}
      {highlights.length > 0 ? (
        <section className="report-monthly-highlights">
          {highlights.map((h, i) => (
            <div key={i} className={`report-monthly-highlight ${i === 0 ? 'report-monthly-highlight-first' : ''}`}>
              <div className="report-monthly-highlight-index">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div>
                <h3 className="report-monthly-highlight-title">
                  {h.title}
                </h3>
                <p className="report-monthly-highlight-body">
                  {h.body}
                </p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Pulled quote — kraft box */}
      {pullQuoteRaw ? (
        <section className="report-pullquote-box report-avoid-break report-monthly-pullquote">
          <div className="report-monthly-pullquote-icon">
            <QuoteIcon size={26} />
          </div>
          {pullQuoteField ? (
            <HoverEditable
              text={pullQuoteRaw}
              canEdit={canEdit}
              onSave={(v) => editField(pullQuoteField, v)}
            >
              {(t) => (
                <div className="report-monthly-pullquote-text">
                  “{t}”
                </div>
              )}
            </HoverEditable>
          ) : (
            <div className="report-monthly-pullquote-text">
              “{pullQuoteRaw}”
            </div>
          )}
          <div className="report-monthly-pullquote-meta">
            {i18nText('Reports.monthly.pullQuoteMeta', { name, periodLabel })}
          </div>
          <NoteAnchor anchor="closingMessage" content={content} canEdit={canEdit} onChange={handleNoteChange} />
        </section>
      ) : null}

      {/* Narrative timeline */}
      {content.narrativeSections.length > 0 ? (
        <section className="report-monthly-timeline">
          <h3 className="report-monthly-section-title">
            {i18nText('Reports.monthly.timelineTitle', { name })}
          </h3>
          <div className="report-monthly-section-subtitle">
            {i18nText('Reports.monthly.timelineSubtitle', { count: content.narrativeSections.length })}
          </div>
          <ol className="report-monthly-timeline-list">
            <div className="report-monthly-timeline-rule" />
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
            {i18nText('Reports.monthly.actionsSubtitle', { name })}
          </div>
          <div className="report-monthly-action-list">
            {content.actionItems.slice(0, 3).map((a) => (
              <article key={a.id} className="report-monthly-action-item">
                <div className="report-monthly-action-icon"><ArrowRight size={15} strokeWidth={2} /></div>
                <div className="report-monthly-action-copy">
                  <h4 className="report-monthly-action-title">
                    {a.text}
                  </h4>
                  <Link to={a.linkTo ?? '/advisor'} className="report-monthly-action-link">
                    {i18nText('Reports.monthly.discussInAdvisor')}
                    <ArrowRight size={11} strokeWidth={2} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* Caregiver acknowledgment — small, late in flow */}
      <section className="report-monthly-caregiver">
        <div className="report-monthly-caregiver-heading">
          <Heart size={14} strokeWidth={1.5} className="report-monthly-caregiver-icon" />
          <span className="report-monthly-caregiver-label">
            {i18nText('Reports.monthly.caregiverTitle')}
          </span>
        </div>
        <p className="report-monthly-caregiver-copy">
          {i18nText('Reports.monthly.caregiverCopy', { name })}
        </p>
      </section>

      {/* Sign-off — child-centric, no caregiver address */}
      <section className="report-monthly-signoff">
        <p className="report-monthly-signoff-copy">
          {i18nText('Reports.monthly.signoffCopy', { name })}
          <br />{i18nText('Reports.monthly.signoffSeeYou')}
        </p>
        <div className="report-monthly-signoff-meta">
          {i18nText('Reports.monthly.signoffMeta', { periodLabel })}
        </div>
      </section>

      {/* Sources footer */}
      <footer className="report-monthly-footer">
        <div>
          {i18nText('Reports.monthly.sourcesPrefix')}
          {content.sources.slice(0, 6).join(i18nText('Reports.monthly.sourcesSeparator'))}
          {content.sources.length > 6 ? i18nText('Reports.monthly.sourcesEtc') : ''}
        </div>
        {content.safetyNote ? (
          <div className="report-monthly-safety-note">{content.safetyNote}</div>
        ) : null}
      </footer>
    </article>

    <div className="report-monthly-actionbar-wrap">
      <ReportActionBar
        childName={name}
        selfRoleName={selfRoleName}
        onSavePdf={handleSavePdf}
        onSaveImage={handleSaveImage}
        onOpenProfessional={() => setProfessionalOpen(true)}
        onRequestFocusNoteComposer={focusNoteComposer}
      />
    </div>

    <ProfessionalSummaryModal
      open={professionalOpen && !professionalPrintPending}
      onClose={() => setProfessionalOpen(false)}
      content={content}
      onContentUpdate={onContentUpdate}
      title={content.title}
      onPrint={handlePrintProfessional}
    />
    </div>
  );
}
