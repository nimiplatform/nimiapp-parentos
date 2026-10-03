import { cn } from '@nimiplatform/kit/ui';
import { ClipboardCheck, House, Smile, Stethoscope } from 'lucide-react';
import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import {
  formatAssessedBy,
  formatTannerDate,
  primaryStages,
  pubicHairStages,
  type StageDesc,
} from './tanner-page-shared.js';
import { i18nText } from '../../i18n/index.js';

export type TannerAxisKey = 'primary' | 'pubic';

/** Each stage axis keeps its own colour so the two are never read as one score. */
export const TANNER_AXIS_TONE: Record<TannerAxisKey, { text: string; fill: string; past: string }> = {
  primary: {
    text: 'text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_65%,var(--nimi-text-primary))]',
    fill: 'bg-[var(--nimi-action-primary-bg)]',
    past: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_32%,transparent)]',
  },
  pubic: {
    text: 'text-[color-mix(in_srgb,var(--nimi-color-indigo)_85%,var(--nimi-text-primary))]',
    fill: 'bg-[var(--nimi-color-indigo)]',
    past: 'bg-[color-mix(in_srgb,var(--nimi-color-indigo)_28%,transparent)]',
  },
};

export function tannerAxisLabel(axis: TannerAxisKey, isFemale: boolean) {
  if (axis === 'pubic') return i18nText('Tanner.timeline.pubicHairStage');
  return i18nText(isFemale ? 'Tanner.timeline.breastStage' : 'Tanner.timeline.genitalStage');
}

/** Stage descriptions for the values actually recorded; a missing axis stays undefined. */
export function recordedStages(assessment: TannerAssessmentRow, isFemale: boolean) {
  return {
    primary: primaryStages(isFemale).find((stage) => stage.stage === assessment.breastOrGenitalStage),
    pubic: pubicHairStages(isFemale).find((stage) => stage.stage === assessment.pubicHairStage),
  } satisfies Record<TannerAxisKey, StageDesc | undefined>;
}

export function tannerMenarcheLabel(assessment: TannerAssessmentRow): string | null {
  if (assessment.menarcheStatus === 'occurred') {
    return assessment.menarcheDate
      ? i18nText('Tanner.timeline.menarcheOccurredWithDate', {
          date: formatTannerDate(assessment.menarcheDate),
        })
      : i18nText('Tanner.timeline.menarcheOccurred');
  }
  return assessment.menarcheStatus === 'not_yet' ? i18nText('Tanner.form.menarcheNotYet') : null;
}

/** The recorded position on the five-step Tanner scale; decorative next to the stage text. */
export function TannerStageMeter({
  stage,
  axis,
  className,
}: {
  stage: number | null;
  axis: TannerAxisKey;
  className?: string;
}) {
  const tone = TANNER_AXIS_TONE[axis];
  return (
    <div aria-hidden="true" className={cn('flex gap-1', className)}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            stage == null || step > stage
              ? 'bg-[color-mix(in_srgb,var(--nimi-text-primary)_8%,transparent)]'
              : step === stage
                ? tone.fill
                : tone.past,
          )}
        />
      ))}
    </div>
  );
}

const ASSESSOR_ICONS = new Map([
  ['physician', Stethoscope],
  ['parent', House],
  ['self', Smile],
]);

export function TannerAssessor({
  assessedBy,
  className,
}: {
  assessedBy: string | null;
  className?: string;
}) {
  if (!assessedBy) {
    return (
      <span className={cn('text-[var(--nimi-text-muted)]', className)}>
        {i18nText('Tanner.redesign.assessorMissing')}
      </span>
    );
  }
  // Free-text assessors (e.g. a clinic name) get the neutral icon.
  const Icon = ASSESSOR_ICONS.get(assessedBy) ?? ClipboardCheck;
  const label = formatAssessedBy(assessedBy);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      <span className="truncate" title={label}>
        {label}
      </span>
    </span>
  );
}
