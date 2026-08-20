import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@nimiplatform/kit/ui';
import { Plus } from 'lucide-react';
import { i18n, i18nText } from '../../i18n/index.js';
import type { FirstReportAccumulation } from './report-cycle.js';

type AutoGenerationState = 'idle' | 'generating' | 'error';

function isoDate(iso: string) {
  return iso.slice(0, 10);
}

function displayDate(iso: string) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

function monthLabel(iso: string) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export function ReportAccumulatingState({
  childName,
  badgeLabel,
  accumulation,
  autoGenerationState,
  onRetry,
}: {
  childName: string;
  badgeLabel: string;
  accumulation: FirstReportAccumulation;
  autoGenerationState: AutoGenerationState;
  onRetry: () => void;
}) {
  const progressStyle = {
    '--report-accumulating-progress': `${accumulation.progressPercent}%`,
  } as CSSProperties;
  const isGenerating = autoGenerationState === 'generating';

  return (
    <article className="report-monthly-page report-accumulating-page">
      <div className="report-monthly-grain" aria-hidden="true" />
      <header className="report-monthly-header report-accumulating-header">
        <div>
          <p className="report-monthly-issue">{i18nText('Reports.page.accumulating.issue', { issueNo: '01' })}</p>
          <p className="report-monthly-period">
            {i18nText('Reports.page.accumulating.period', {
              start: isoDate(accumulation.periodStart),
              end: isoDate(accumulation.generationAt),
              days: accumulation.elapsedDays,
            })}
          </p>
        </div>
        <div className="report-monthly-badge report-accumulating-badge" aria-hidden="true">
          <div className="report-monthly-badge-inner">
            <div className="report-monthly-badge-month">{badgeLabel || monthLabel(accumulation.generationAt)}</div>
            <div className="report-monthly-badge-name report-monthly-badge-name-md">{childName}</div>
          </div>
        </div>
      </header>

      <section className="report-accumulating-hero">
        <h2 className="report-accumulating-title">
          {i18nText('Reports.page.accumulating.title', { childName })}
        </h2>
        <p className="report-accumulating-subtitle">
          {isGenerating
            ? i18nText('Reports.page.accumulating.generatingSubtitle')
            : i18nText('Reports.page.accumulating.subtitle')}
        </p>
      </section>

      <section className="report-accumulating-summary" aria-label={i18nText('Reports.page.accumulating.summaryLabel')}>
        <div className="report-accumulating-stat">
          <span>{i18nText('Reports.page.accumulating.expectedLabel')}</span>
          <strong>{i18nText('Reports.page.accumulating.expectedValue', { date: displayDate(accumulation.generationAt) })}</strong>
        </div>
        <div className="report-accumulating-divider" aria-hidden="true" />
        <div className="report-accumulating-stat">
          <span>{i18nText('Reports.page.accumulating.elapsedLabel')}</span>
          <strong>{i18nText('Reports.page.accumulating.elapsedValue', { days: accumulation.elapsedDays })}</strong>
        </div>
      </section>

      <section className="report-accumulating-progress-block">
        <div
          className="report-accumulating-progress"
          style={progressStyle}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={accumulation.progressPercent}
          aria-label={i18nText('Reports.page.accumulating.progressLabel')}
        >
          <span className="report-accumulating-progress-fill" />
          <span className="report-accumulating-progress-today" />
          <span className="report-accumulating-progress-end" />
          <span className="report-accumulating-progress-label">
            {i18nText('Reports.page.accumulating.todayMilestone')}
          </span>
        </div>
        <div className="report-accumulating-milestones">
          <span>{i18nText('Reports.page.accumulating.startMilestone', { date: isoDate(accumulation.periodStart) })}</span>
          <span>{i18nText('Reports.page.accumulating.endMilestone', { date: isoDate(accumulation.generationAt) })}</span>
        </div>
      </section>

      {autoGenerationState === 'error' ? (
        <div className="report-accumulating-error" role="alert">
          <p>{i18nText('Reports.page.accumulating.error')}</p>
          <Button size="sm" tone="secondary" onClick={onRetry}>{i18nText('Reports.page.accumulating.retry')}</Button>
        </div>
      ) : (
        <Link className="report-accumulating-cta" to="/journal">
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          {i18nText('Reports.page.accumulating.captureAction')}
        </Link>
      )}
    </article>
  );
}
