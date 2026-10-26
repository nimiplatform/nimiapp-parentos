import './reports-workspace.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParentOSPageWorkAllowed } from '../../app-shell/app-navigation.js';
import { Button, DatePicker, NimiText, nimiToast, Surface } from '@nimiplatform/kit/ui';
import { ChevronDown } from 'lucide-react';
import { computeAgeMonthsAt, formatAge, useAppStore, type ChildProfile } from '../../app-shell/app-store.js';
import { getGrowthReports, insertGrowthReport, updateGrowthReportContent } from '../../bridge/sqlite-bridge.js';
import { isoNow, ulid } from '../../bridge/ulid.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { generateNarrativeReportForPeriod } from './narrative-prompt.js';
import { StructuredReportViewer } from './reports-structured-viewer.js';
import { MonthlyLetterViewer } from './reports-monthly-letter.js';
import {
  buildStructuredGrowthReport, parseReportContent,
  type GrowthReportType, type NarrativeReportContent, type ParsedReportContent,
} from './structured-report.js';
import { i18nText } from '../../i18n/index.js';
import { autoGenerateMonthlyReport } from './auto-report.js';
import { ReportAccumulatingState } from './report-accumulating-state.js';
import { getFirstReportAccumulation, requireValidGrowthReports } from './report-cycle.js';
import {
  buildNarrativeTitle, hasReportTextRuntime, isAiRefreshableContent, loadReportDomainData, refreshReportWithAi,
} from './report-ai-refresh.js';
import { ReportAiStatusCard, type ReportAiState } from './report-ai-status.js';


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

function reportBadgeLabel(c: ParsedReportContent): string {
  const l: Record<string, string> = {
    monthly: i18nText('Reports.page.badge.monthly'),
    quarterly: i18nText('Reports.page.badge.quarterly'),
    'quarterly-letter': i18nText('Reports.page.badge.quarterlyLetter'),
    custom: i18nText('Reports.page.badge.custom'),
  };
  return l[c.reportType] ?? i18nText('Reports.page.badge.comprehensive');
}

function ReportViewer({
  content, reportId, onContentUpdate, persisted, childName,
}: {
  content: ParsedReportContent;
  reportId?: string;
  onContentUpdate?: (u: NarrativeReportContent) => Promise<boolean>;
  persisted?: PersistedReport;
  childName?: string;
}) {
  if (content.version === 2) {
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
      />
    );
  }
  return <StructuredReportViewer content={content} periodStart={persisted?.periodStart} periodEnd={persisted?.periodEnd} />;
}

/* ── Main Page ── */

export default function ReportsPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  if (!child) return <div className="report-page-shell"><div className="report-page-container"><p className="report-muted-text">{i18nText('Reports.page.noChild')}</p></div></div>;
  return <ReportsChildPage key={child.childId} child={child} />;
}

// Keep asynchronous report refreshes in the child's own mounted view.
function ReportsChildPage({ child }: { child: ChildProfile }) {
  const pageWorkAllowed = useParentOSPageWorkAllowed();
  const [reports, setReports] = useState<PersistedReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-quarter');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generateState, setGenerateState] = useState<GenerateState>('idle');
  const [autoGenerationState, setAutoGenerationState] = useState<AutoGenerationState>('idle');
  const [reportLoadState, setReportLoadState] = useState<ReportLoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [aiState, setAiState] = useState<ReportAiState>('checking');
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const batchStopRef = useRef(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  // AI can be connected from settings while this route stays mounted, so the
  // runtime check re-runs whenever the window regains focus.
  const checkAiRuntime = useCallback(() => {
    void hasReportTextRuntime()
      .then((ready) => setAiState(ready ? 'ready' : 'unavailable'))
      .catch((error) => {
        catchLog('reports', 'action:check-report-runtime-failed', 'warn')(error);
        setAiState('unavailable');
      });
  }, []);
  useEffect(() => {
    checkAiRuntime();
    const onVisible = () => { if (document.visibilityState === 'visible') checkAiRuntime(); };
    window.addEventListener('focus', checkAiRuntime);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', checkAiRuntime);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkAiRuntime]);
  useEffect(() => () => { batchStopRef.current = true; }, [child?.childId]);

  useEffect(() => { const d = computePresetDates('this-quarter'); setPeriodStart(d.start); setPeriodEnd(d.end); }, []);
  useEffect(() => {
    if (!child) {
      setReports([]);
      setSelectedReportId(null);
      setReportLoadState('ready');
      return;
    }

    let cancelled = false;
    setReports([]);
    setSelectedReportId(null);
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

      if (!pageWorkAllowed) { setReportLoadState('ready'); return; }
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
  }, [child, reloadKey, pageWorkAllowed]);

  if (!child) return <div className="report-page-shell"><div className="report-page-container"><p className="report-muted-text">{i18nText('Reports.page.noChild')}</p></div></div>;

  const activeChild = child;
  const firstAccumulation = getFirstReportAccumulation(activeChild.createdAt);
  const latestReport = reports.find((report) => report.reportType === 'monthly') ?? null;
  const selectedReport = reports.find((report) => report.reportId === selectedReportId) ?? latestReport;
  const selectedContent = selectedReport ? parseReportContent(selectedReport.content) : null;
  const localReports = reports.filter((report) => isAiRefreshableContent(parseReportContent(report.content)));
  const selectedIsLocal = Boolean(selectedContent && isAiRefreshableContent(selectedContent));

  const markRefreshing = (reportId: string, active: boolean) => setRefreshingIds((prev) => {
    const next = new Set(prev);
    if (active) next.add(reportId); else next.delete(reportId);
    return next;
  });

  const rewriteOne = async (report: PersistedReport) => {
    setRefreshError(null);
    markRefreshing(report.reportId, true);
    try {
      await refreshReportWithAi(activeChild, report);
      setReports(requireValidPersistedReports(activeChild.createdAt, await getGrowthReports(activeChild.childId)));
      return true;
    } catch (error) {
      catchLog('reports', 'action:refresh-report-with-ai-failed', 'warn')(error);
      setRefreshError(i18nText('Reports.page.ai.refreshFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
      checkAiRuntime();
      return false;
    } finally {
      markRefreshing(report.reportId, false);
    }
  };

  const handleRefreshOne = async (report: PersistedReport) => {
    if (await rewriteOne(report)) nimiToast.success(i18nText('Reports.page.ai.refreshSuccess'));
  };

  // Sequential on purpose: each rewrite is one bounded inference request, and
  // a failure stops the batch so the parent sees which report kept its old text.
  const handleRefreshAll = async () => {
    const queue = [...localReports];
    batchStopRef.current = false;
    setBatchProgress({ done: 0, total: queue.length });
    let done = 0;
    for (const report of queue) {
      if (batchStopRef.current) break;
      if (!(await rewriteOne(report))) break;
      done += 1;
      setBatchProgress({ done, total: queue.length });
    }
    setBatchProgress(null);
    if (done > 0) nimiToast.success(i18nText('Reports.page.ai.refreshAllDone', { count: done }));
  };

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
      return true;
    } catch (error) {
      nimiToast.danger(i18nText('Reports.page.contentSaveFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
      return false;
    }
  };

  const handleGenerate = async () => {
    const bounds = resolvePeriodBounds(periodStart, periodEnd);
    if (!bounds) { nimiToast.warning(i18nText('Reports.page.invalidPeriod')); return; }
    setGenerateState('saving');
    try {
      const now = isoNow();
      const reportType = deriveReportType(periodPreset);
      const runtimeAvailable = await hasReportTextRuntime();
      setAiState(runtimeAvailable ? 'ready' : 'unavailable');
      const data = await loadReportDomainData(activeChild.childId);
      let report: ReturnType<typeof buildStructuredGrowthReport> | Awaited<ReturnType<typeof generateNarrativeReportForPeriod>> | null = null;

      if (runtimeAvailable) {
        try {
          const narrativeReport = await generateNarrativeReportForPeriod({
            child: activeChild,
            period: { start: bounds.start, end: bounds.end },
            data,
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
          measurements: data.measurements,
          milestones: data.milestones,
          vaccines: data.vaccines,
          journalEntries: data.journalEntries,
          reminderStates: data.reminderStates,
        });
      }
      const reportId = ulid();
      await insertGrowthReport({ reportId, childId: activeChild.childId, reportType: report.reportType, periodStart: report.periodStart, periodEnd: report.periodEnd, ageMonthsStart: report.ageMonthsStart, ageMonthsEnd: report.ageMonthsEnd, content: JSON.stringify(report.content), generatedAt: now, now });
      setReports(requireValidPersistedReports(activeChild.createdAt, await getGrowthReports(activeChild.childId))); setSelectedReportId(reportId); setShowAdvanced(false); setGenerateState('idle');
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
    <div className="report-page-shell">
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

        {reportLoadState !== 'error' && (
          <ReportAiStatusCard
            aiState={aiState}
            localCount={localReports.length}
            latestIsLocal={selectedIsLocal}
            latestRefreshing={Boolean(selectedReport && refreshingIds.has(selectedReport.reportId))}
            batchProgress={batchProgress}
            busy={refreshingIds.size > 0}
            onRefreshLatest={() => { if (selectedReport) void handleRefreshOne(selectedReport); }}
            onRefreshAll={() => void handleRefreshAll()}
            onStop={() => { batchStopRef.current = true; }}
          />
        )}

        {refreshError && <p role="alert" className="mb-4 text-sm text-[var(--nimi-status-danger)]">{refreshError}</p>}

        {reportLoadState === 'ready' && <div className="report-generator hide-on-print">
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
        <div className="report-workspace">
          {reports.length > 0 && <aside className="report-library hide-on-print" aria-label={i18nText('Reports.workspace.library')}>
            <div className="report-library-heading">
              <h2>{i18nText('Reports.workspace.library')}</h2>
              <span>{reports.length}</span>
            </div>
            <label className="report-mobile-picker">
              <span>{i18nText('Reports.workspace.choosePeriod')}</span>
              <select value={selectedReport?.reportId ?? ''} onChange={(event) => setSelectedReportId(event.target.value)}>
                {!latestReport && <option value="">{i18nText('Reports.workspace.accumulating')}</option>}
                {reports.map((report) => <option key={report.reportId} value={report.reportId}>
                  {report.periodStart.slice(0, 10)} — {report.periodEnd.slice(0, 10)} · {reportBadgeLabel(parseReportContent(report.content))}
                </option>)}
              </select>
            </label>
            <nav className="report-library-list" aria-label={i18nText('Reports.workspace.choosePeriod')}>
              {reports.map((report, index) => {
                const parsed = parseReportContent(report.content);
                const year = report.periodStart.slice(0, 4);
                return <div key={report.reportId}>
                  {(index === 0 || year !== reports[index - 1]?.periodStart.slice(0, 4)) && <h3 className="report-library-year">{year}</h3>}
                  <button type="button" aria-label={`${report.periodStart.slice(0, 10)} — ${report.periodEnd.slice(0, 10)} · ${reportBadgeLabel(parsed)}${report.reportId === latestReport?.reportId ? ` · ${i18nText('Reports.workspace.latest')}` : ''}`} aria-current={selectedReport?.reportId === report.reportId ? 'true' : undefined}
                    className="report-library-item" onClick={() => {
                      setSelectedReportId(report.reportId);
                      viewerRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
                    }}>
                    <span className="report-library-period">{report.periodStart.slice(5, 10)} — {report.periodEnd.slice(5, 10)}</span>
                    <span className="report-library-kind">{reportBadgeLabel(parsed)}{report.reportId === latestReport?.reportId ? ` · ${i18nText('Reports.workspace.latest')}` : ''}</span>
                  </button>
                </div>;
              })}
            </nav>
          </aside>}
          <div className="report-reading-pane" ref={viewerRef}>
            {reportLoadState === 'error' ? (
              <div className="report-empty-state" role="alert">
                <p>{i18nText('Reports.page.loadError')}</p>
                <Button tone="secondary" onClick={() => setReloadKey((value) => value + 1)}>{i18nText('Reports.workspace.retry')}</Button>
              </div>
            ) : reportLoadState === 'loading' && !selectedReport && autoGenerationState !== 'generating' ? (
              <div className="report-empty-state" role="status">{i18nText('Reports.page.loading')}</div>
            ) : <>
              {!latestReport && <ReportAccumulatingState
                childName={activeChild.displayName}
                badgeLabel={formatAge(computeAgeMonthsAt(activeChild.birthDate, firstAccumulation.periodStart))}
                accumulation={firstAccumulation} autoGenerationState={autoGenerationState}
                onRetry={() => setReloadKey((value) => value + 1)}
              />}
              {selectedContent && selectedReport && <div key={selectedReport.reportId} className="report-selected">
                <ReportViewer content={selectedContent} reportId={selectedReport.reportId} persisted={selectedReport}
                  childName={activeChild.displayName}
                  onContentUpdate={selectedContent.version === 2 ? (u) => handleContentUpdate(selectedReport.reportId, u) : undefined} />
              </div>}
            </>}
          </div>
        </div>


      </div>
    </div>
  );
}
