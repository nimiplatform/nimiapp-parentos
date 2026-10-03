import { Link } from 'react-router-dom';
import { Button } from '@nimiplatform/kit/ui';
import { Sparkles } from 'lucide-react';
import { i18nText } from '../../i18n/index.js';

export type ReportAiState = 'checking' | 'ready' | 'unavailable';

interface ReportAiStatusCardProps {
  aiState: ReportAiState;
  /** Persisted reports still carrying deterministic v1 content. */
  localCount: number;
  /** The latest monthly report is local; the card then leads with rewriting it. */
  latestIsLocal: boolean;
  latestRefreshing: boolean;
  batchProgress: { done: number; total: number } | null;
  busy: boolean;
  onRefreshLatest: () => void;
  onRefreshAll: () => void;
  onStop: () => void;
}

export function ReportAiStatusCard({
  aiState, localCount, latestIsLocal, latestRefreshing, batchProgress, busy,
  onRefreshLatest, onRefreshAll, onStop,
}: ReportAiStatusCardProps) {
  if (aiState === 'checking') return null;

  if (aiState === 'unavailable') {
    return (
      <div className="report-ai-status report-ai-status--offline" role="status">
        <Sparkles size={16} className="report-ai-status-icon" aria-hidden="true" />
        <div className="report-ai-status-body">
          <p className="report-ai-status-title">{i18nText('Reports.page.ai.offlineTitle')}</p>
          <p className="report-ai-status-text">{i18nText('Reports.page.ai.offlineBody')}</p>
        </div>
        <Link to="/settings/ai" className="report-ai-status-link">{i18nText('Reports.page.ai.connectAction')}</Link>
      </div>
    );
  }

  if (localCount === 0 && !batchProgress) {
    return (
      <div className="report-ai-status report-ai-status--ready" role="status">
        <Sparkles size={16} className="report-ai-status-icon" aria-hidden="true" />
        <p className="report-ai-status-text">{i18nText('Reports.page.ai.readyBody')}</p>
      </div>
    );
  }

  const progressPct = batchProgress && batchProgress.total > 0
    ? Math.round((batchProgress.done / batchProgress.total) * 100)
    : 0;
  const body = batchProgress
    ? i18nText('Reports.page.ai.refreshing', { done: batchProgress.done, total: batchProgress.total })
    : latestIsLocal
      ? i18nText('Reports.page.ai.latestBody')
      : i18nText('Reports.page.ai.pendingBody', { count: localCount });

  return (
    <div className="report-ai-status report-ai-status--pending" role="status">
      <Sparkles size={16} className="report-ai-status-icon" aria-hidden="true" />
      <div className="report-ai-status-body">
        <p className="report-ai-status-title">
          {latestIsLocal ? i18nText('Reports.page.ai.latestTitle') : i18nText('Reports.page.ai.readyTitle')}
        </p>
        <p className="report-ai-status-text">{body}</p>
        {batchProgress && (
          <div className="report-ai-progress" aria-hidden="true">
            <div className="report-ai-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>
      <div className="report-ai-status-actions">
        {batchProgress ? (
          <Button size="sm" tone="ghost" onClick={onStop}>{i18nText('Reports.page.ai.stop')}</Button>
        ) : (
          <>
            {latestIsLocal && (
              <Button size="sm" tone="primary" onClick={onRefreshLatest} loading={latestRefreshing} disabled={busy}>
                {latestRefreshing ? i18nText('Reports.page.ai.refreshingOne') : i18nText('Reports.page.ai.refreshLatest')}
              </Button>
            )}
            {(!latestIsLocal || localCount > 1) && (
              <Button size="sm" tone={latestIsLocal ? 'ghost' : 'primary'} onClick={onRefreshAll} disabled={busy}>
                {i18nText('Reports.page.ai.refreshAll', { count: localCount })}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface LocalReportNoticeProps {
  aiState: ReportAiState;
  refreshing: boolean;
  disabled: boolean;
  onRefresh: () => void;
}

/** Inline prompt above an expanded v1 history report once the text runtime is ready. */
export function LocalReportNotice({ aiState, refreshing, disabled, onRefresh }: LocalReportNoticeProps) {
  if (aiState !== 'ready') return null;
  return (
    <div className="report-ai-notice">
      <div className="report-ai-status-body">
        <p className="report-ai-status-title">{i18nText('Reports.page.ai.localTitle')}</p>
        <p className="report-ai-status-text">{i18nText('Reports.page.ai.localBody')}</p>
      </div>
      <Button size="sm" tone="primary" onClick={onRefresh} loading={refreshing} disabled={disabled || refreshing}>
        {refreshing ? i18nText('Reports.page.ai.refreshingOne') : i18nText('Reports.page.ai.refreshOne')}
      </Button>
    </div>
  );
}
