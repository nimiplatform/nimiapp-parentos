import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { DestinationLink } from '../../app-shell/app-navigation.js';
import { i18nText } from '../../i18n/index.js';
import { exportReportAsImage, exportReportAsPdf } from './report-export.js';
import { ReportActionBar } from './reports-action-bar.js';
import { reportActionIntent, type StructuredGrowthReportContent } from './structured-report.js';

// @nimi-authority: rule.parentos.advs.r009
export function StructuredReportViewer({ content, periodStart, periodEnd }: {
  content: StructuredGrowthReportContent;
  periodStart?: string;
  periodEnd?: string;
}) {
  const article = useRef<HTMLElement>(null);
  const metricForSection: Record<string, string> = { growth: 'measurement-count', journal: 'journal-count', milestones: 'milestone-count' };
  const isEmpty = (section: StructuredGrowthReportContent['sections'][number]) => section.items.length === 0
    || content.metrics.some((metric) => metric.id === metricForSection[section.id] && metric.value === '0')
    || (section.id === 'vaccines' && section.items.length === 1 && section.items[0] === '本期暂无新增疫苗记录。');
  const sections = content.sections.filter((section) => section.id !== 'timeline' && !isEmpty(section));
  const emptySections = content.sections.filter((section) => section.id !== 'timeline' && isEmpty(section)).map((section) => section.title);
  const reminders = content.sections.filter((section) => section.id === 'timeline' && section.items.length > 0);
  const recordsHeading = sections.length > 0 ? 'Reports.workspace.recordedFacts' : 'Reports.workspace.noRecords';
  const save = async (format: 'pdf' | 'png') => {
    const exportFile = format === 'pdf' ? exportReportAsPdf : exportReportAsImage;
    const result = await exportFile(article.current, {
      filename: `${content.title}-${periodStart?.slice(0, 10) ?? content.generatedAt.slice(0, 10)}.${format}`,
      backgroundColor: 'var(--nimi-surface-card)',
    });
    return Boolean(result.savedPath);
  };
  return <>
    <div className="report-monthly-actionbar-wrap"><ReportActionBar onSavePdf={() => save('pdf')} onSaveImage={() => save('png')} /></div>
    <article ref={article} className="report-printable-page report-monthly-page report-structured-reading">
      <header className="report-monthly-header">
        <div>
          <p className="report-monthly-issue">{i18nText('Reports.page.ai.sourceLocal')}</p>
          <h2 className="report-monthly-title">{content.title}</h2>
          <p className="report-monthly-period">{periodStart?.slice(0, 10)} — {periodEnd?.slice(0, 10)}</p>
          <p className="report-monthly-period">{content.subtitle}</p>
        </div>
      </header>
      <section className="report-reading-section">
        <h3>{i18nText(recordsHeading)}</h3>
        {sections.map((section) => <details key={section.id} open={section.items.length <= 6} className="report-record-details">
          <summary>{section.title}</summary>
          <ul>{section.items.map((item, index) => <li key={`${section.id}-${index}`}>{item}</li>)}</ul>
        </details>)}
      </section>
      {content.trendSignals.length > 0 && <section className="report-reading-section">
        <h3>{i18nText('Reports.page.trendSignals')}</h3>
        <dl className="report-trend-lines">{content.trendSignals.map((signal) => <div key={signal.id}>
          <dt>{signal.title}</dt><dd>{signal.summary}</dd>
        </div>)}</dl>
      </section>}
      {((content.actionItems?.length ?? 0) > 0 || reminders.length > 0) && <details data-report-export="when-open" className="report-record-details report-sparse-secondary">
        <summary>{i18nText('Reports.workspace.reminders')}</summary>
        <p className="report-sparse-context">{i18nText('Reports.workspace.pendingContext')}</p>
        <div className="report-reading-actions">{content.actionItems?.map((action) => <DestinationLink key={action.id}
          destination={{ id: '/advisor' }} intent={reportActionIntent(action)}>
          <span>{action.text}</span><ArrowRight size={16} aria-hidden="true" />
        </DestinationLink>)}</div>
        {reminders.map((section) => <ul key={section.id}>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul>)}
      </details>}
      <details data-report-export="when-open" className="report-record-details report-sparse-secondary">
        <summary>{i18nText('Reports.workspace.recordCoverage')}</summary>
        {emptySections.length > 0 && <p className="report-sparse-context">{i18nText('Reports.structured.emptySectionsNote', { list: emptySections.join(i18nText('Common.list.separator')) })}</p>}
        {content.overview.map((line) => <p key={line}>{line}</p>)}
        <dl className="report-trend-lines">{content.metrics.filter((metric) => metric.id !== 'age-range').map((metric) => <div key={metric.id}>
          <dt>{metric.label}</dt><dd>{metric.value}{metric.detail ? ` · ${metric.detail}` : ''}</dd>
        </div>)}</dl>
      </details>
      <footer className="report-monthly-footer">
        <p>{i18nText('Reports.page.sourcesPrefix')}{content.sources.join(i18nText('Common.list.separator'))}</p>
        <p>{content.safetyNote}</p>
      </footer>
    </article>
  </>;
}
