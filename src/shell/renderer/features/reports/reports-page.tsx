import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DatePicker, NimiText, nimiToast, StatusBadge, Surface, TextareaField } from '@nimiplatform/kit/ui';
import { ArrowRight, ChevronDown, Eye, Pencil, Star } from 'lucide-react';
import { computeAgeMonthsAt, formatAge, useAppStore } from '../../app-shell/app-store.js';
import {
  getAllergyRecords, getDentalRecords, getFitnessAssessments, getGrowthReports,
  getJournalEntries, getMeasurements, getMedicalEvents, getMilestoneRecords,
  getReminderStates, getSleepRecords, getTannerAssessments, getVaccineRecords, insertGrowthReport,
  updateGrowthReportContent,
} from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import {
  hasParentosAIConfigCapability,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
} from '../settings/parentos-ai-config.js';
import { generateNarrativeReportForPeriod } from './narrative-prompt.js';
import { MonthlyLetterViewer } from './reports-monthly-letter.js';
import {
  buildStructuredGrowthReport, parseReportContent,
  type GrowthReportType, type NarrativeReportContent, type ParsedReportContent,
  type StructuredGrowthReportContent,
} from './structured-report.js';
import { i18nText } from '../../i18n/index.js';
import { autoGenerateMonthlyReport } from './auto-report.js';
import { ReportAccumulatingState } from './report-accumulating-state.js';
import { getFirstReportAccumulation, requireValidGrowthReports } from './report-cycle.js';


type PersistedReport = Awaited<ReturnType<typeof getGrowthReports>>[number];
type GenerateState = 'idle' | 'saving' | 'error';
type AutoGenerationState = 'idle' | 'generating' | 'error';
type ReportLoadState = 'loading' | 'ready' | 'error';
type PeriodPreset = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'custom';

function requireValidPersistedReports(createdAt: string, reports: PersistedReport[]): PersistedReport[] {
  requireValidGrowthReports(createdAt, reports);
  for (const report of reports) {
    const content = parseReportContent(report.content);
    if (content.reportType !== report.reportType) {
      throw new Error(`Growth report type mismatch: ${report.reportId}`);
    }
  }
  return reports;
}

const PRESET_OPTIONS: Array<{ id: PeriodPreset; labelKey: string }> = [
  { id: 'this-month', labelKey: 'Reports.page.preset.thisMonth' },
  { id: 'last-month', labelKey: 'Reports.page.preset.lastMonth' },
  { id: 'this-quarter', labelKey: 'Reports.page.preset.thisQuarter' },
  { id: 'last-quarter', labelKey: 'Reports.page.preset.lastQuarter' },
  { id: 'custom', labelKey: 'Reports.page.preset.custom' },
];

function computePresetDates(preset: PeriodPreset) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  switch (preset) {
    case 'this-month': return { start: `${y}-${pad(m + 1)}-01`, end: fmt(now) };
    case 'last-month': return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
    case 'this-quarter': return { start: fmt(new Date(y, Math.floor(m / 3) * 3, 1)), end: fmt(now) };
    case 'last-quarter': { const q = Math.floor(m / 3) * 3; return { start: fmt(new Date(y, q - 3, 1)), end: fmt(new Date(y, q, 0)) }; }
    case 'custom': return { start: '', end: '' };
  }
}

function deriveReportType(preset: PeriodPreset): GrowthReportType {
  // `monthly` is reserved for the rolling automatic cycle anchored to the
  // child profile. Parent-selected calendar windows are custom reports.
  if (preset === 'this-month' || preset === 'last-month') return 'custom';
  if (preset === 'this-quarter' || preset === 'last-quarter') return 'quarterly-letter';
  return 'custom';
}

function normalizeDateValue(value: string) {
  const normalized = value.trim().replace(/\//g, '-');
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return normalized;
}

function resolvePeriodBounds(start: string, end: string) {
  const normalizedStart = normalizeDateValue(start);
  const normalizedEnd = normalizeDateValue(end);
  if (!normalizedStart || !normalizedEnd) return null;
  const startDate = new Date(`${normalizedStart}T00:00:00.000Z`);
  const endDate = new Date(`${normalizedEnd}T23:59:59.999Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return null;
  }
  return {
    startLabel: normalizedStart,
    endLabel: normalizedEnd,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function buildNarrativeTitle(childName: string, reportType: GrowthReportType) {
  switch (reportType) {
    case 'monthly':
      return i18nText('Reports.page.narrativeTitle.monthly', { childName });
    case 'quarterly':
      return i18nText('Reports.page.narrativeTitle.quarterly', { childName });
    case 'quarterly-letter':
      return i18nText('Reports.page.narrativeTitle.quarterlyLetter', { childName });
    case 'custom':
    default:
      return i18nText('Reports.page.narrativeTitle.custom', { childName });
  }
}

async function hasAvailableReportsRuntime() {
  return hasParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT);
}

function reportBadgeLabel(c: ParsedReportContent): string {
  if (c.version === 2) return c.format === 'narrative-ai' ? i18nText('Reports.page.badge.aiNarrative') : i18nText('Reports.page.badge.narrative');
  const l: Record<string, string> = {
    monthly: i18nText('Reports.page.badge.monthly'),
    quarterly: i18nText('Reports.page.badge.quarterly'),
    'quarterly-letter': i18nText('Reports.page.badge.quarterlyLetter'),
    custom: i18nText('Reports.page.badge.custom'),
  };
  return l[c.reportType] ?? i18nText('Reports.page.badge.comprehensive');
}

/* ── Editable Text ── */

function EditableText({ text, onSave }: { text: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const start = () => { setDraft(text); setEditing(true); setTimeout(() => ref.current?.focus(), 0); };
  if (editing) return (<div>
    <TextareaField
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className="report-radius-sm"
      textareaClassName="report-editable-textarea"
    />
    <div className="flex gap-2 mt-2">
      <Button size="sm" tone="primary" onClick={() => { onSave(draft); setEditing(false); }}>{i18nText('Reports.page.save')}</Button>
      <Button size="sm" tone="ghost" onClick={() => setEditing(false)}>{i18nText('Reports.page.cancel')}</Button>
    </div>
  </div>);
  return (<div className="group relative">
    <p className="report-editable-text">{text}</p>
    <Button onClick={start} tone="ghost" size="sm" className="report-editable-button opacity-0 transition-opacity group-hover:opacity-100" title={i18nText('Reports.page.edit')}>
      <Pencil size={12} />
    </Button>
  </div>);
}

/* ── Narrative Viewer ── */

function NarrativeViewer({ content, reportId, onContentUpdate }: { content: NarrativeReportContent; reportId?: string; onContentUpdate?: (u: NarrativeReportContent) => void }) {
  const canEdit = Boolean(reportId && onContentUpdate);
  const editSection = (sid: string, narrative: string) => onContentUpdate?.({ ...content, narrativeSections: content.narrativeSections.map((s) => s.id === sid ? { ...s, narrative } : s) });
  const editField = (f: 'opening' | 'milestoneReplay' | 'closingMessage', v: string) => onContentUpdate?.({ ...content, [f]: v });

  return (<div className="space-y-4">
    <div className="report-glass-card report-card-pad">
      <h2 className="report-card-title-lg">{content.title}</h2>
      <p className="report-card-subtitle">{content.subtitle}</p>
      {content.format === 'narrative-ai' && <StatusBadge tone="success" className="mt-2">{i18nText('Reports.page.aiWritten')}</StatusBadge>}
    </div>

    {content.opening && (<div className="report-soft-panel report-soft-panel--warning-light">
      {canEdit ? <EditableText text={content.opening} onSave={(v) => editField('opening', v)} /> : <p className="report-body-text report-body-text--italic">{content.opening}</p>}
    </div>)}

    {content.narrativeSections.map((section) => (<div key={section.id} className="report-glass-card report-card-pad">
      <h3 className="report-card-title">{section.title}</h3>
      {canEdit ? <EditableText text={section.narrative} onSave={(v) => editSection(section.id, v)} /> : <p className="report-body-text">{section.narrative}</p>}
      {section.dataPoints && section.dataPoints.length > 0 && (<div className="mt-3 flex flex-wrap gap-3">
        {section.dataPoints.map((dp) => (<div key={dp.label} className="report-data-pill">
          <span className="report-data-label">{dp.label}</span>
          <span className="report-data-value">{dp.value}</span>
          {dp.detail && <span className="report-data-detail">{dp.detail}</span>}
        </div>))}
      </div>)}
    </div>))}

    {content.milestoneReplay && (<div className="report-soft-panel report-soft-panel--warning">
      <div className="report-section-heading-row"><Star size={16} className="report-icon-warning" /><h3 className="report-card-title">{i18nText('Reports.page.milestoneMoment')}</h3></div>
      {canEdit ? <EditableText text={content.milestoneReplay} onSave={(v) => editField('milestoneReplay', v)} /> : <p className="report-body-text">{content.milestoneReplay}</p>}
    </div>)}

    {((content.highlights?.length ?? 0) > 0 || (content.watchNext?.length ?? 0) > 0) && (<div className="grid gap-3 sm:grid-cols-2">
      {content.highlights && content.highlights.length > 0 && (<div className="report-glass-card report-card-pad">
        <h3 className="report-section-heading-row report-card-title"><Star size={16} className="report-icon-warning" />{i18nText('Reports.page.highlights')}</h3>
        <ul className="space-y-2">{content.highlights.map((h, i) => <li key={i} className="report-list-item report-list-item--accent">{h}</li>)}</ul>
      </div>)}
      {content.watchNext && content.watchNext.length > 0 && (<div className="report-glass-card report-card-pad">
        <h3 className="report-section-heading-row report-card-title"><Eye size={16} className="report-icon-info" />{i18nText('Reports.page.watchNext')}</h3>
        <ul className="space-y-2">{content.watchNext.map((w, i) => <li key={i} className="report-list-item report-list-item--warning">{w}</li>)}</ul>
      </div>)}
    </div>)}

    {content.trendSignals.length > 0 && (<div className="report-glass-card report-card-pad">
      <h3 className="report-card-title report-title-spaced">{i18nText('Reports.page.trendSignals')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{content.trendSignals.map((sig) => (<div key={sig.id} className="report-trend-card">
        <h4 className="report-trend-title">{sig.title}</h4>
        <p className="report-trend-summary">{sig.summary}</p>
      </div>))}</div>
    </div>)}

    {content.actionItems.length > 0 && (<div className="report-glass-card report-card-pad">
      <h3 className="report-card-title report-title-spaced">{i18nText('Reports.page.nextActions')}</h3>
      <div className="space-y-2">{content.actionItems.map((a) => (<Link key={a.id} to={a.linkTo ?? '/advisor'} className="report-action-link">
        <ArrowRight size={16} className="report-icon-accent" strokeWidth={2} />
        <span className="report-action-link-text">{a.text}</span>
      </Link>))}</div>
    </div>)}

    {content.closingMessage && (<div className="report-soft-panel report-soft-panel--success">
      {canEdit ? <EditableText text={content.closingMessage} onSave={(v) => editField('closingMessage', v)} /> : <p className="report-body-text">{content.closingMessage}</p>}
    </div>)}

    <div className="report-glass-card report-card-pad-sm">
      <p className="report-footnote">{i18nText('Reports.page.sourcesPrefix')}{content.sources.join(i18nText('Common.list.separator'))}</p>
      <p className="report-footnote report-footnote--warning">{content.safetyNote}</p>
    </div>
  </div>);
}

/* ── V1 Structured Viewer ── */

function StructuredViewer({ content }: { content: StructuredGrowthReportContent }) {
  return (<div className="space-y-4">
    <div className="report-glass-card report-card-pad">
      <h2 className="report-card-title-lg">{content.title}</h2>
      <p className="report-card-subtitle">{content.subtitle}</p>
      <p className="report-footnote report-footnote--warning report-footnote--spaced">{content.safetyNote}</p>
    </div>
    {content.metrics.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{content.metrics.map((m) => (<div key={m.id} className="report-glass-card report-metric-card"><div className="report-data-label">{m.label}</div><div className="report-metric-value">{m.value}</div>{m.detail && <div className="report-data-detail">{m.detail}</div>}</div>))}</div>}
    {content.overview.length > 0 && <div className="report-glass-card report-card-pad"><h3 className="report-card-title report-title-spaced">{i18nText('Reports.page.overview')}</h3><ul className="space-y-2">{content.overview.map((item) => <li key={item} className="report-list-item report-list-item--panel">{item}</li>)}</ul></div>}
    <div className="grid gap-3 sm:grid-cols-2">{content.sections.map((sec) => (<div key={sec.id} className="report-glass-card report-card-pad"><h3 className="report-card-title report-title-spaced">{sec.title}</h3><ul className="space-y-2">{sec.items.map((item) => <li key={item} className="report-list-item report-list-item--panel">{item}</li>)}</ul></div>))}</div>
    <div className="report-glass-card report-card-pad-sm"><p className="report-footnote">{i18nText('Reports.page.sourcesPrefix')}{content.sources.join(i18nText('Common.list.separator'))}</p></div>
  </div>);
}

function isLetterContent(content: ParsedReportContent): boolean {
  return content.version === 2 && content.reportType === 'monthly';
}

function ReportViewer({
  content, reportId, onContentUpdate, persisted, childName, selfRoleName,
}: {
  content: ParsedReportContent;
  reportId?: string;
  onContentUpdate?: (u: NarrativeReportContent) => void;
  persisted?: PersistedReport;
  childName?: string;
  selfRoleName?: string;
}) {
  if (content.version === 2 && isLetterContent(content)) {
    return (
      <MonthlyLetterViewer
        content={content}
        reportId={reportId}
        onContentUpdate={onContentUpdate}
        periodStart={persisted?.periodStart}
        periodEnd={persisted?.periodEnd}
        ageMonthsStart={persisted?.ageMonthsStart}
        ageMonthsEnd={persisted?.ageMonthsEnd}
        childName={childName}
        selfRoleName={selfRoleName}
      />
    );
  }
  if (content.version === 2) return <NarrativeViewer content={content} reportId={reportId} onContentUpdate={onContentUpdate} />;
  return <StructuredViewer content={content} />;
}

/* ── Main Page ── */

export default function ReportsPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [reports, setReports] = useState<PersistedReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-quarter');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generateState, setGenerateState] = useState<GenerateState>('idle');
  const [autoGenerationState, setAutoGenerationState] = useState<AutoGenerationState>('idle');
  const [reportLoadState, setReportLoadState] = useState<ReportLoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const d = computePresetDates('this-quarter'); setPeriodStart(d.start); setPeriodEnd(d.end); }, []);
  useEffect(() => {
    if (!child) {
      setReports([]);
      setExpandedReportId(null);
      setReportLoadState('ready');
      return;
    }

    let cancelled = false;
    setReports([]);
    setExpandedReportId(null);
    setReportLoadState('loading');
    setAutoGenerationState('idle');

    void (async () => {
      let rows: PersistedReport[];
      try {
        rows = requireValidPersistedReports(child.createdAt, await getGrowthReports(child.childId));
        if (cancelled) return;
        setReports(rows);
      } catch (error) {
        if (cancelled) return;
        catchLog('reports', 'action:load-growth-reports-failed')(error);
        setReportLoadState('error');
        return;
      }

      const firstCycle = getFirstReportAccumulation(child.createdAt);
      const hasFirstMonthlyReport = rows.some((report) => (
        report.reportType === 'monthly' && report.periodStart === firstCycle.periodStart
      ));
      if (!hasFirstMonthlyReport && firstCycle.isEligible) {
        setAutoGenerationState('generating');
      }

      try {
        const generatedReportId = await autoGenerateMonthlyReport(child);
        if (cancelled) return;
        if (generatedReportId) {
          rows = requireValidPersistedReports(child.createdAt, await getGrowthReports(child.childId));
          if (cancelled) return;
          setReports(rows);
        }
        setAutoGenerationState('idle');
      } catch (error) {
        if (cancelled) return;
        catchLog('reports', 'action:auto-generate-monthly-report-failed')(error);
        setAutoGenerationState('error');
      }
      if (!cancelled) setReportLoadState('ready');
    })();

    return () => { cancelled = true; };
  }, [child, reloadKey]);

  if (!child) return <div className="report-page-shell"><div className="report-page-container"><p className="report-muted-text">{i18nText('Reports.page.noChild')}</p></div></div>;

  const activeChild = child;
  const firstAccumulation = getFirstReportAccumulation(activeChild.createdAt);
  const latestReport = reports.find((report) => report.reportType === 'monthly') ?? null;
  const latestContent = latestReport ? parseReportContent(latestReport.content) : null;
  const historyReports = latestReport
    ? reports.filter((report) => report.reportId !== latestReport.reportId)
    : reports;

  const handlePresetChange = (p: PeriodPreset) => { setPeriodPreset(p); if (p !== 'custom') { const d = computePresetDates(p); setPeriodStart(d.start); setPeriodEnd(d.end); } };
  const handleDateChange = (field: 'start' | 'end', value: string) => {
    if (field === 'start') setPeriodStart(value); else setPeriodEnd(value);
    const ns = field === 'start' ? value : periodStart; const ne = field === 'end' ? value : periodEnd;
    let matched = false;
    for (const p of PRESET_OPTIONS) { if (p.id === 'custom') continue; const d = computePresetDates(p.id); if (d.start === ns && d.end === ne) { setPeriodPreset(p.id); matched = true; break; } }
    if (!matched) setPeriodPreset('custom');
  };

  const handleContentUpdate = async (reportId: string, updated: NarrativeReportContent) => {
    try {
      await updateGrowthReportContent({ reportId, content: JSON.stringify(updated), now: isoNow() });
      setReports(requireValidPersistedReports(activeChild.createdAt, await getGrowthReports(activeChild.childId)));
    } catch (error) {
      nimiToast.danger(i18nText('Reports.page.contentSaveFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const handleGenerate = async () => {
    const bounds = resolvePeriodBounds(periodStart, periodEnd);
    if (!bounds) { nimiToast.warning(i18nText('Reports.page.invalidPeriod')); return; }
    setGenerateState('saving');
    try {
      const now = isoNow();
      const reportType = deriveReportType(periodPreset);
      const runtimeAvailable = await hasAvailableReportsRuntime();
      const [measurements, milestones, vaccines, journalEntries, reminderStates] = await Promise.all([
        getMeasurements(activeChild.childId), getMilestoneRecords(activeChild.childId),
        getVaccineRecords(activeChild.childId), getJournalEntries(activeChild.childId, 200), getReminderStates(activeChild.childId),
      ]);
      let report: ReturnType<typeof buildStructuredGrowthReport> | Awaited<ReturnType<typeof generateNarrativeReportForPeriod>> | null = null;

      if (runtimeAvailable) {
        try {
          const [sleepRecords, dentalRecords, allergyRecords, medicalEvents, fitnessAssessments, tannerAssessments] = await Promise.all([
            getSleepRecords(activeChild.childId), getDentalRecords(activeChild.childId), getAllergyRecords(activeChild.childId),
            getMedicalEvents(activeChild.childId), getFitnessAssessments(activeChild.childId), getTannerAssessments(activeChild.childId),
          ]);
          const narrativeReport = await generateNarrativeReportForPeriod({
            child: activeChild,
            period: { start: bounds.start, end: bounds.end },
            data: {
              measurements,
              milestones,
              vaccines,
              journalEntries,
              reminderStates,
              sleepRecords,
              dentalRecords,
              allergyRecords,
              medicalEvents,
              fitnessAssessments,
              tannerAssessments,
            },
            reportType,
          });
          report = {
            ...narrativeReport,
            reportType,
            periodStart: bounds.start,
            periodEnd: bounds.end,
            content: {
              ...narrativeReport.content,
              reportType,
              title: buildNarrativeTitle(activeChild.displayName, reportType),
              subtitle: i18nText('Reports.page.periodSubtitle', { start: bounds.startLabel, end: bounds.endLabel }),
            },
          };
        } catch (error) {
          catchLog('reports', 'action:generate-ai-report-failed', 'warn')(error);
          nimiToast.info(i18nText('Reports.page.aiFallback'));
        }
      } else {
        nimiToast.info(i18nText('Reports.page.localFallback'));
      }

      if (!report) {
        report = buildStructuredGrowthReport({
          child: activeChild,
          reportType,
          now,
          periodStart: bounds.start,
          periodEnd: bounds.end,
          measurements,
          milestones,
          vaccines,
          journalEntries,
          reminderStates,
        });
      }
      const reportId = ulid();
      await insertGrowthReport({ reportId, childId: activeChild.childId, reportType: report.reportType, periodStart: report.periodStart, periodEnd: report.periodEnd, ageMonthsStart: report.ageMonthsStart, ageMonthsEnd: report.ageMonthsEnd, content: JSON.stringify(report.content), generatedAt: now, now });
      setReports(requireValidPersistedReports(activeChild.createdAt, await getGrowthReports(activeChild.childId))); setExpandedReportId(reportId); setGenerateState('idle');
      nimiToast.success(i18nText('Reports.page.generateSuccess'));
      setTimeout(() => { if (typeof viewerRef.current?.scrollIntoView === 'function') viewerRef.current.scrollIntoView({ behavior: 'smooth' }); }, 100);
    } catch (error) {
      catchLog('reports', 'action:generate-report-failed')(error);
      setGenerateState('error');
      nimiToast.danger(i18nText('Reports.page.generateFailed'));
    }
  };

  // @nimi-authority: rule.parentos.advs.r009
  return (
    <div className="report-page-shell hide-scrollbar overflow-y-auto">
      <div className="report-page-container">
        <header className="mb-6">
          <h1 className="parentos-journal-hero-title parentos-journal-hero-title__bold text-[44px] leading-[1.05] tracking-tight text-[var(--nimi-text-primary)]">
            {i18nText('Reports.page.heroGrowth')}
            <span className="parentos-journal-hero-title__tail">
              {i18nText('Reports.page.heroReports')}
              <span className="parentos-journal-hero-title__dot" aria-hidden="true" />
            </span>
          </h1>
          <NimiText as="p" role="body" className="mt-3 text-[14px] leading-relaxed text-[var(--nimi-text-muted)]">
            {i18nText('Reports.page.heroSubtitle')}
          </NimiText>
        </header>

        {latestContent && latestReport ? (
          <div className="mb-6">
            <ReportViewer content={latestContent} reportId={latestReport.reportId} persisted={latestReport} childName={activeChild.displayName} selfRoleName={activeChild.recorderProfiles?.[0]?.name} onContentUpdate={latestContent.version === 2 ? (u) => void handleContentUpdate(latestReport.reportId, u) : undefined} />
          </div>
        ) : reportLoadState === 'error' ? (
          <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="report-empty-state" role="alert">
            <p className="report-empty-title">{i18nText('Reports.page.loadError')}</p>
          </Surface>
        ) : reportLoadState === 'loading' && autoGenerationState !== 'generating' ? (
          <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="report-empty-state">
            <p className="report-empty-title">{i18nText('Reports.page.loading')}</p>
          </Surface>
        ) : (
          <div className="mb-6">
            <ReportAccumulatingState
              childName={activeChild.displayName}
              badgeLabel={formatAge(computeAgeMonthsAt(activeChild.birthDate, firstAccumulation.periodStart))}
              accumulation={firstAccumulation}
              autoGenerationState={autoGenerationState}
              onRetry={() => setReloadKey((value) => value + 1)}
            />
          </div>
        )}

        {historyReports.length > 0 && (<div className="mb-6">
          <p className="report-section-label">{i18nText('Reports.page.historyTitle')}</p>
          <div className="space-y-2">{historyReports.map((report) => {
            const isExpanded = expandedReportId === report.reportId;
            const parsed = parseReportContent(report.content);
            const title = parsed.title;
            return (<div key={report.reportId}>
              <button onClick={() => setExpandedReportId((prev) => prev === report.reportId ? null : report.reportId)}
                className={`report-history-button ${isExpanded ? 'report-history-button--active' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="report-history-title">{title}</span>
                  <StatusBadge tone="neutral" className="shrink-0">{reportBadgeLabel(parsed)}</StatusBadge>
                  <ChevronDown size={12} className={`report-icon-muted shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} strokeWidth={2} />
                </div>
                <p className="report-history-date">{i18nText('Reports.page.periodRange', { start: report.periodStart.slice(0, 10), end: report.periodEnd.slice(0, 10) })}</p>
              </button>
              {isExpanded && (<div ref={viewerRef} className="mt-2 pb-4">
                <ReportViewer content={parsed} reportId={report.reportId} persisted={report} childName={activeChild.displayName} selfRoleName={activeChild.recorderProfiles?.[0]?.name} onContentUpdate={parsed.version === 2 ? (u) => void handleContentUpdate(report.reportId, u) : undefined} />
              </div>)}
            </div>);
          })}</div>
        </div>)}

        {reportLoadState === 'ready' && <div className="mb-8">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="report-advanced-toggle"
            aria-label={i18nText('Reports.page.advancedToggleLabel')}
            aria-expanded={showAdvanced}
            aria-controls="report-advanced-panel"
          >
            <ChevronDown size={12} strokeWidth={2} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {i18nText('Reports.page.advancedToggle')}
          </button>
          {showAdvanced && (<Surface id="report-advanced-panel" tone="card" material="glass-regular" elevation="raised" padding="none" className="report-advanced-panel">
            <p className="report-advanced-description">{i18nText('Reports.page.advancedDescription')}</p>
            <div className="mb-3">
              <p className="report-field-label">{i18nText('Reports.page.periodField')}</p>
              <div className="flex flex-wrap gap-2">{PRESET_OPTIONS.map((p) => (
                <Button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  size="sm"
                  tone={periodPreset === p.id ? 'primary' : 'secondary'}
                  className="min-h-0 rounded-full py-1 text-[13px]"
                >
                  {i18nText(p.labelKey)}
                </Button>
              ))}</div>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1"><label className="report-date-label">{i18nText('Reports.page.startDate')}</label><DatePicker value={periodStart} onChange={(v) => handleDateChange('start', v)} size="small" /></div>
              <div className="flex-1"><label className="report-date-label">{i18nText('Reports.page.endDate')}</label><DatePicker value={periodEnd} onChange={(v) => handleDateChange('end', v)} size="small" /></div>
            </div>
            <Button onClick={() => void handleGenerate()} loading={generateState === 'saving'}
              fullWidth tone="primary" className="report-generate-button">
              {generateState === 'saving' ? i18nText('Reports.page.generating') : i18nText('Reports.page.generate')}
            </Button>
          </Surface>)}
        </div>}
      </div>
    </div>
  );
}
