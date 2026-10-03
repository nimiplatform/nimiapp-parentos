import { Surface, cn } from '@nimiplatform/kit/ui';
import { CalendarCheck, FlaskConical, Pill, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MedicalAlert } from '../../engine/smart-alerts.js';
import type { MedicalKpis, MedicalTally } from './medical-events-page-shared.js';
import { ParentosAiMascotStatic } from './parentos-ai-mascot-button.js';
import { i18nText } from '../../i18n/index.js';


/* ── KPI strip — same tile rhythm as the dental archive ─────────── */

interface KpiTile {
  key: string;
  label: string;
  value: number | string;
  unit: string;
  iconClassName: string;
  icon: ReactNode;
}

const ICON_PROPS = { size: 16, strokeWidth: 1.6 } as const;

export function MedicalEventsKpiStrip({ kpis }: { kpis: MedicalKpis }) {
  const tiles: KpiTile[] = [
    {
      key: 'recent-year',
      label: i18nText('MedicalEvents.kpi.recentYear'),
      value: kpis.recentYearCount,
      unit: i18nText('MedicalEvents.unit.visits'),
      iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_14%,transparent)] text-[var(--nimi-status-info)]',
      icon: <Stethoscope {...ICON_PROPS} />,
    },
    {
      key: 'since-last',
      label: i18nText('MedicalEvents.kpi.sinceLast'),
      value: kpis.daysSinceLast ?? '—',
      unit: i18nText('MedicalEvents.unit.days'),
      iconClassName: 'bg-[var(--nimi-surface-active)] text-[var(--nimi-text-muted)]',
      icon: <CalendarCheck {...ICON_PROPS} />,
    },
    {
      key: 'medications',
      label: i18nText('MedicalEvents.kpi.medications'),
      value: kpis.medicationKinds,
      unit: i18nText('MedicalEvents.unit.kinds'),
      iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_14%,transparent)] text-[var(--nimi-status-success)]',
      icon: <Pill {...ICON_PROPS} />,
    },
    {
      key: 'lab-reports',
      label: i18nText('MedicalEvents.kpi.labReports'),
      value: kpis.labReportCount,
      unit: i18nText('MedicalEvents.unit.reports'),
      iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,transparent)] text-[var(--nimi-action-primary-bg)]',
      icon: <FlaskConical {...ICON_PROPS} />,
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-4 gap-3">
      {tiles.map((tile) => (
        <Surface
          key={tile.key}
          tone="card"
          material="solid"
          elevation="raised"
          padding="md"
          className="flex items-center gap-3 rounded-2xl"
        >
          <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl', tile.iconClassName)}>
            {tile.icon}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate text-[11px] tracking-[0.02em] text-[var(--nimi-text-muted)]">{tile.label}</div>
            <div className="flex items-baseline gap-1">
              <div className="font-sans text-[22px] font-bold leading-[1.1] tracking-normal text-[var(--nimi-text-primary)] tabular-nums">
                {tile.value}
              </div>
              <div className="font-mono text-[11px] text-[var(--nimi-text-muted)]">{tile.unit}</div>
            </div>
          </div>
        </Surface>
      ))}
    </div>
  );
}

/* ── Overview card — rule-based summary + on-demand AI insight ──── */

const ALERT_CLASSES: Record<MedicalAlert['level'], { box: string; dot: string }> = {
  danger: {
    box: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_9%,transparent)]',
    dot: 'bg-[var(--nimi-status-danger)]',
  },
  warning: {
    box: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,transparent)]',
    dot: 'bg-[var(--nimi-status-warning)]',
  },
  info: {
    box: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_9%,transparent)]',
    dot: 'bg-[var(--nimi-status-info)]',
  },
};

const CHIP_CLASSES = {
  reason: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,transparent)] text-[var(--nimi-action-primary-bg)] hover:bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_16%,transparent)]',
  medication: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_11%,transparent)] text-[var(--nimi-status-success)] hover:bg-[color-mix(in_srgb,var(--nimi-status-success)_17%,transparent)]',
} as const;

const MAX_CHIPS = 8;

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z" />
      <path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  );
}

function TallyChips({
  items,
  tone,
  onSelect,
}: {
  items: MedicalTally[];
  tone: keyof typeof CHIP_CLASSES;
  onSelect: (keyword: string) => void;
}) {
  return (
    <dd className="m-0 flex flex-wrap gap-1.5">
      {items.slice(0, MAX_CHIPS).map((item) => (
        <button
          key={item.name}
          type="button"
          onClick={() => onSelect(item.name)}
          title={i18nText('MedicalEvents.overview.showRelated')}
          className={cn('inline-flex cursor-pointer items-center gap-1 rounded-full border-0 px-3 py-1 text-[12px] font-medium transition-colors', CHIP_CLASSES[tone])}
        >
          {item.name}
          {item.count > 1 ? (
            <span className="font-normal opacity-60">{i18nText('MedicalEvents.analysis.countSuffix', { count: item.count })}</span>
          ) : null}
        </button>
      ))}
    </dd>
  );
}

function RowLabel({ children }: { children: ReactNode }) {
  return <dt className="whitespace-nowrap pt-1 text-[12px] text-[var(--nimi-text-muted)]">{children}</dt>;
}

export function MedicalEventsOverviewCard({
  totalEvents,
  reasons,
  medications,
  hospitals,
  alerts,
  aiInsight,
  aiLoading,
  onRequestAi,
  onSelectKeyword,
}: {
  totalEvents: number;
  reasons: MedicalTally[];
  medications: MedicalTally[];
  hospitals: string[];
  alerts: MedicalAlert[];
  aiInsight: string | null;
  aiLoading: boolean;
  onRequestAi: () => void;
  onSelectKeyword: (keyword: string) => void;
}) {
  const hasRows = reasons.length > 0 || medications.length > 0 || hospitals.length > 0;

  return (
    <Surface
      as="section"
      tone="card"
      material="glass-thick"
      elevation="raised"
      padding="lg"
      className="mb-5 rounded-3xl"
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex text-[var(--nimi-action-primary-bg)]">
            <SparkleIcon />
          </span>
          <span className="text-[12px] font-semibold tracking-normal text-[var(--nimi-text-primary)]">
            {i18nText('MedicalEvents.overview.title')}
          </span>
          <span className="text-[11px] text-[var(--nimi-text-muted)]">
            {i18nText('MedicalEvents.overview.context', { total: totalEvents })}
          </span>
        </div>
        <button
          type="button"
          onClick={onRequestAi}
          disabled={aiLoading}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--nimi-action-ghost-hover)] px-3 py-1.5 text-[12px] font-medium text-[var(--nimi-text-secondary)] transition-colors hover:text-[var(--nimi-text-primary)] disabled:cursor-default disabled:opacity-60"
        >
          <ParentosAiMascotStatic size={16} />
          {aiLoading ? i18nText('MedicalEvents.analysis.aiLoading') : i18nText('MedicalEvents.analysis.deepAnalyze')}
        </button>
      </div>

      {alerts.length > 0 ? (
        <div className="mb-4 space-y-2">
          {alerts.map((alert, index) => {
            const classes = ALERT_CLASSES[alert.level] ?? ALERT_CLASSES.info;
            return (
              <div key={`${alert.title}-${index}`} className={cn('flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5', classes.box)}>
                <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', classes.dot)} />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">{alert.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--nimi-text-secondary)]">{alert.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {hasRows ? (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3">
          {reasons.length > 0 ? (
            <>
              <RowLabel>{i18nText('MedicalEvents.overview.reasons')}</RowLabel>
              <TallyChips items={reasons} tone="reason" onSelect={onSelectKeyword} />
            </>
          ) : null}
          {medications.length > 0 ? (
            <>
              <RowLabel>{i18nText('MedicalEvents.overview.medications')}</RowLabel>
              <TallyChips items={medications} tone="medication" onSelect={onSelectKeyword} />
            </>
          ) : null}
          {hospitals.length > 0 ? (
            <>
              <RowLabel>{i18nText('MedicalEvents.overview.hospitals')}</RowLabel>
              <dd className="m-0 pt-1 text-[13px] leading-relaxed text-[var(--nimi-text-primary)]">
                {hospitals.join(i18nText('Common.list.separator'))}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {aiLoading && !aiInsight ? (
        <div className="mt-4 space-y-2 animate-pulse">
          <div className="h-3 w-full rounded-full bg-[var(--nimi-surface-panel)]" />
          <div className="h-3 w-4/5 rounded-full bg-[var(--nimi-surface-panel)]" />
        </div>
      ) : aiInsight ? (
        <div className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_6%,transparent)] px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <ParentosAiMascotStatic size={16} />
            <span className="text-[12px] font-semibold text-[var(--nimi-text-primary)]">
              {i18nText('MedicalEvents.analysis.aiInsightTitle')}
            </span>
          </div>
          <p className="text-[13.5px] leading-[1.75] text-[var(--nimi-text-primary)]">{aiInsight}</p>
        </div>
      ) : null}
    </Surface>
  );
}
