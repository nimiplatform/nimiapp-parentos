import { Surface, Timeline, TimelineDivider, TimelineGroup, cn } from '@nimiplatform/kit/ui';
import { CalendarHeart } from 'lucide-react';
import { Fragment } from 'react';
import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import { formatDateLabel } from '../journal/journal-page-helpers.js';
import {
  TANNER_AXIS_TONE,
  TannerAssessor,
  TannerStageMeter,
  recordedStages,
  tannerAxisLabel,
  tannerMenarcheLabel,
  type TannerAxisKey,
} from './tanner-record-parts.js';
import { fmtAge, type StageDesc } from './tanner-page-shared.js';
import { i18nText } from '../../i18n/index.js';

type DayGroup = { date: string; year: number; rows: TannerAssessmentRow[] };

// Rows arrive newest first; same-day records stay together in saved order.
function groupByDay(assessments: TannerAssessmentRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of assessments) {
    const date = row.assessedAt.slice(0, 10);
    const last = groups.at(-1);
    if (last?.date === date) last.rows.push(row);
    else groups.push({ date, year: Number(date.slice(0, 4)), rows: [row] });
  }
  return groups;
}

/** Earlier records on the archive timeline: one group per day, a divider when the year changes. */
// @nimi-authority: rule.parentos.prof.r012
export function TannerTimeline({
  assessments,
  isFemale,
}: {
  assessments: TannerAssessmentRow[];
  isFemale: boolean;
}) {
  const groups = groupByDay(assessments);
  const currentYear = new Date().getFullYear();
  return (
    <Timeline>
      {groups.map((group, index) => {
        const previousYear = index === 0 ? currentYear : groups[index - 1]!.year;
        return (
          <Fragment key={group.date}>
            {group.year !== previousYear ? (
              <TimelineDivider label={i18nText('Tanner.timeline.yearDivider', { year: group.year })} />
            ) : null}
            <TimelineGroup
              variant="past"
              date={<time dateTime={group.date}>{formatDateLabel(group.date)}</time>}
              secondaryLabel={fmtAge(group.rows[0]!.ageMonths)}
              isLast={index === groups.length - 1}
            >
              {group.rows.map((row) => (
                <TannerRecordCard key={row.assessmentId} assessment={row} isFemale={isFemale} />
              ))}
            </TimelineGroup>
          </Fragment>
        );
      })}
    </Timeline>
  );
}

function TannerRecordCard({
  assessment,
  isFemale,
}: {
  assessment: TannerAssessmentRow;
  isFemale: boolean;
}) {
  const stages = recordedStages(assessment, isFemale);
  const menarche = isFemale ? tannerMenarcheLabel(assessment) : null;
  return (
    <Surface
      as="article"
      tone="card"
      material="solid"
      elevation="raised"
      padding="none"
      className="rounded-2xl p-5"
    >
      {/* Fixed proportions keep both axis columns aligned from card to card. */}
      <div className="flex items-start gap-6">
        <dl className="m-0 grid min-w-0 flex-[2_1_0%] grid-cols-2 gap-x-6">
          <AxisCompact axis="primary" label={tannerAxisLabel('primary', isFemale)} stage={stages.primary} />
          <AxisCompact axis="pubic" label={tannerAxisLabel('pubic', isFemale)} stage={stages.pubic} />
        </dl>
        <div className="flex min-w-0 flex-[0.7_1_0%] justify-end">
          <TannerAssessor
            assessedBy={assessment.assessedBy}
            className="max-w-full text-[11.5px] text-[var(--nimi-text-muted)]"
          />
        </div>
      </div>
      {menarche ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--nimi-text-secondary)]">
          <CalendarHeart size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
          {menarche}
        </p>
      ) : null}
      {assessment.notes ? (
        <p className="mt-3.5 whitespace-pre-wrap break-words text-[13.5px] leading-[1.75] text-[var(--nimi-text-primary)]">
          {assessment.notes}
        </p>
      ) : null}
    </Surface>
  );
}

function AxisCompact({
  axis,
  label,
  stage,
}: {
  axis: TannerAxisKey;
  label: string;
  stage: StageDesc | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[var(--nimi-text-muted)]">{label}</dt>
      <dd className="m-0 mt-1">
        {stage ? (
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={cn('text-[15px] font-bold tabular-nums', TANNER_AXIS_TONE[axis].text)}>
              {stage.code}
            </span>
            <span className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">{stage.name}</span>
          </p>
        ) : (
          <p className="text-[13px] font-medium leading-[22px] text-[var(--nimi-text-muted)]">
            {i18nText('Tanner.redesign.unrecorded')}
          </p>
        )}
        <TannerStageMeter stage={stage?.stage ?? null} axis={axis} className="mt-2 max-w-[150px]" />
      </dd>
    </div>
  );
}
