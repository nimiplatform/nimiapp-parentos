import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';
import { HEALTH_EVALUATION_POLICIES } from '../../knowledge-base/gen/health-record.gen.js';

export interface StageDesc {
  stage: number;
  /** Stage code on its own axis, e.g. B4 / G2 / PH3. */
  code: string;
  /** Stage name without the code, e.g. 乳晕突出. */
  name: string;
  title: string;
  desc: string;
}

export type MenarcheStatus = 'not_yet' | 'occurred';

const ASSESSED_BY_LABEL_KEYS: Record<string, string> = {
  self: 'Tanner.assessedBy.self',
  parent: 'Tanner.assessedBy.parent',
  physician: 'Tanner.assessedBy.physician',
};

const STAGE_CODE_PREFIX = {
  breast: 'B',
  genital: 'G',
  pubicHairFemale: 'PH',
  pubicHairMale: 'PH',
} as const;

function stageDesc(kind: keyof typeof STAGE_CODE_PREFIX, stage: number): StageDesc {
  const keyPrefix = `Tanner.stage.${kind}.${stage}`;
  const code = `${STAGE_CODE_PREFIX[kind]}${stage}`;
  const title = i18nText(`${keyPrefix}.title`);
  // Titles read "B4 · 乳晕突出"; keep the code and the name apart for styling.
  const name = title.startsWith(`${code} · `) ? title.slice(code.length + 3) : title;
  return { stage, code, name, title, desc: i18nText(`${keyPrefix}.desc`) };
}

// Built on demand so labels follow the current UI language.
// breastOrGenitalStage records breast development for girls and genital development for boys.
export function primaryStages(isFemale: boolean): StageDesc[] {
  return [1, 2, 3, 4, 5].map((stage) => stageDesc(isFemale ? 'breast' : 'genital', stage));
}

// Pubic-hair stage descriptions are gender-specific (PH2/PH5 describe different anatomy).
export function pubicHairStages(isFemale: boolean): StageDesc[] {
  return [1, 2, 3, 4, 5].map((stage) =>
    stageDesc(isFemale ? 'pubicHairFemale' : 'pubicHairMale', stage),
  );
}

export const ASSESSED_BY_OPTIONS = ['parent', 'physician', 'self'] as const;

export function formatAssessedBy(value: string): string {
  const key = ASSESSED_BY_LABEL_KEYS[value];
  return key ? i18nText(key) : value;
}

export function fmtAge(ageMonths: number) {
  if (ageMonths < 24) return i18nText('Common.age.months', { months: ageMonths });
  const years = Math.floor(ageMonths / 12);
  const remainMonths = ageMonths % 12;
  return remainMonths > 0
    ? i18nText('Common.age.yearsMonths', { years, months: remainMonths })
    : i18nText('Common.age.years', { years });
}

/** Long local date for a stored ISO date, e.g. 2026年8月16日 / August 16, 2026. */
export function formatTannerDate(iso: string): string {
  const day = iso.slice(0, 10);
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString(i18nText('Common.date.locale'), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function sortAssessmentsDesc(assessments: TannerAssessmentRow[]) {
  return [...assessments].sort(
    (left, right) =>
      right.assessedAt.localeCompare(left.assessedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.assessmentId.localeCompare(left.assessmentId),
  );
}

// @nimi-authority: rule.parentos.prof.r012
export function tannerStageChanges(assessments: TannerAssessmentRow[]) {
  const threshold = HEALTH_EVALUATION_POLICIES.find(
    (policy) => policy.policyId === 'development.tanner-stage-reference',
  )?.trendThresholds?.find(
    (item) => item.thresholdId === 'tanner-stage-two-stage-twelve-month-watch',
  );
  if (!threshold) throw new Error('Missing Tanner stage trend threshold');
  const rows = sortAssessmentsDesc(assessments);
  return (['breastOrGenitalStage', 'pubicHairStage'] as const).flatMap((axis) => {
    const staged = rows.filter((row) => row[axis] != null);
    const latest = staged[0];
    if (!latest) return [];
    const start = new Date(latest.assessedAt);
    start.setUTCMonth(start.getUTCMonth() - threshold.windowMonths);
    const previous = staged
      .slice(1)
      .filter(
        (row) =>
          Date.parse(row.assessedAt) >= start.getTime() &&
          Date.parse(row.assessedAt) < Date.parse(latest.assessedAt),
      )
      .at(-1);
    const currentValue = latest[axis];
    const previousValue = previous?.[axis];
    if (
      !previous ||
      currentValue == null ||
      previousValue == null ||
      currentValue - previousValue < threshold.value
    )
      return [];
    return [
      {
        axis,
        from: previous.assessedAt.slice(0, 10),
        to: latest.assessedAt.slice(0, 10),
        previous: previousValue,
        latest: currentValue,
      },
    ];
  });
}
