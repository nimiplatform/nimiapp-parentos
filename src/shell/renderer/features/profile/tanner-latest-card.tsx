import { Surface, cn } from '@nimiplatform/kit/ui';
import { CalendarHeart, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import { ParentosAiMascotStatic } from './parentos-ai-mascot-button.js';
import {
  TANNER_AXIS_TONE,
  TannerAssessor,
  TannerStageMeter,
  recordedStages,
  tannerAxisLabel,
  tannerMenarcheLabel,
  type TannerAxisKey,
} from './tanner-record-parts.js';
import { fmtAge, formatTannerDate, type StageDesc } from './tanner-page-shared.js';
import { i18nText } from '../../i18n/index.js';

/**
 * The most recent dated record, shown first. Each stage axis gets its own
 * panel; an axis that was not recorded says so instead of borrowing a value.
 */
// @nimi-authority: rule.parentos.prof.r012
export function TannerLatestCard({
  assessment,
  totalCount,
  isFemale,
  aiOpen,
  onToggleAi,
  notice,
}: {
  assessment: TannerAssessmentRow;
  totalCount: number;
  isFemale: boolean;
  aiOpen: boolean;
  onToggleAi: () => void;
  /** Rule-based change notice across records, shown inside the card. */
  notice?: ReactNode;
}) {
  const stages = recordedStages(assessment, isFemale);
  const menarche = isFemale ? tannerMenarcheLabel(assessment) : null;
  return (
    <Surface
      as="section"
      aria-labelledby="tanner-latest"
      tone="card"
      material="glass-thick"
      elevation="raised"
      padding="lg"
      className="rounded-3xl"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span aria-hidden="true" className="text-[14px] leading-none">
              🌱
            </span>
            <h2
              id="tanner-latest"
              className="text-[12px] font-semibold text-[var(--nimi-text-primary)]"
            >
              {i18nText('Tanner.redesign.latest')}
            </h2>
            <span className="text-[11px] text-[var(--nimi-text-muted)]">
              {i18nText('Tanner.page.assessmentDataContext', { count: totalCount })}
            </span>
          </div>
          <p className="mt-2.5 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-[var(--nimi-text-primary)]">
            <time dateTime={assessment.assessedAt.slice(0, 10)}>
              {formatTannerDate(assessment.assessedAt)}
            </time>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--nimi-text-secondary)]">
            <span>{fmtAge(assessment.ageMonths)}</span>
            <span aria-hidden="true" className="text-[var(--nimi-text-muted)]">
              ·
            </span>
            <TannerAssessor assessedBy={assessment.assessedBy} />
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleAi}
          aria-expanded={aiOpen}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--nimi-action-ghost-hover)] px-3 py-1.5 text-[12px] font-medium text-[var(--nimi-text-secondary)] transition-colors hover:text-[var(--nimi-text-primary)]"
        >
          <ParentosAiMascotStatic size={16} />
          {i18nText(aiOpen ? 'Tanner.redesign.hideAI' : 'Tanner.redesign.explainRecords')}
        </button>
      </header>

      <dl className="m-0 mt-5 grid gap-3 sm:grid-cols-2">
        <AxisPanel axis="primary" label={tannerAxisLabel('primary', isFemale)} stage={stages.primary} />
        <AxisPanel axis="pubic" label={tannerAxisLabel('pubic', isFemale)} stage={stages.pubic} />
      </dl>

      {menarche ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--nimi-text-primary)_5%,transparent)] px-3 py-1.5 text-[12px] font-medium text-[var(--nimi-text-secondary)]">
          <CalendarHeart size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
          {menarche}
        </p>
      ) : null}

      {assessment.notes ? (
        <p className="mt-4 whitespace-pre-wrap break-words border-l-2 border-[color-mix(in_srgb,var(--nimi-text-primary)_14%,transparent)] pl-3 text-[13.5px] leading-[1.75] text-[var(--nimi-text-primary)]">
          {assessment.notes}
        </p>
      ) : null}

      {notice}

      <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-[1.6] text-[var(--nimi-text-muted)]">
        <Info size={12} strokeWidth={1.8} aria-hidden="true" className="mt-[3px] shrink-0" />
        {i18nText('Tanner.redesign.datedRecord')}
      </p>
    </Surface>
  );
}

function AxisPanel({
  axis,
  label,
  stage,
}: {
  axis: TannerAxisKey;
  label: string;
  stage: StageDesc | undefined;
}) {
  return (
    <div className="rounded-2xl bg-[color-mix(in_srgb,var(--nimi-surface-card)_78%,transparent)] px-4 py-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--nimi-border-subtle)_65%,transparent)]">
      <dt className="text-[11.5px] text-[var(--nimi-text-muted)]">{label}</dt>
      <dd className="m-0 mt-1.5">
        {stage ? (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={cn('text-[24px] font-bold leading-none tabular-nums', TANNER_AXIS_TONE[axis].text)}>
              {stage.code}
            </span>
            <span className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{stage.name}</span>
          </p>
        ) : (
          <p className="text-[15px] font-semibold leading-6 text-[var(--nimi-text-muted)]">
            {i18nText('Tanner.redesign.unrecorded')}
          </p>
        )}
        <TannerStageMeter stage={stage?.stage ?? null} axis={axis} className="mt-3 max-w-[200px]" />
        {stage ? (
          <p className="mt-3 text-[12.5px] leading-[1.7] text-[var(--nimi-text-secondary)]">{stage.desc}</p>
        ) : null}
      </dd>
    </div>
  );
}
