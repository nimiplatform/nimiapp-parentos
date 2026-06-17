import { Button, StatusBadge, Surface } from '@nimiplatform/kit/ui';
/**
 * Case-level consolidated review card (PO-ORTHO-015). When a case runs
 * multiple appliances in parallel they often share one physical clinic visit;
 * this card surfaces the nearest review date across all active appliances and
 * (in the multi-appliance variant) lists each appliance's parent-entered
 * agenda so the parent walks in knowing what every appliance needs that visit.
 * With a single appliance the agenda list collapses to one line of em-dashes,
 * so the card shrinks to date + action button only.
 */
import type { OrthodonticApplianceRow } from '../../bridge/sqlite-bridge.js';
import { applianceTypeLabel } from './orthodontic-derive.js';
import { formatMonthDay } from './appliance-card-shared.js';
import { i18nText } from '../../i18n/index.js';


export function OrthodonticCaseReviewCard({
  appliances,
  nowIso,
  onLogClinicalEvent,
}: {
  /** Active appliances of the case. */
  appliances: OrthodonticApplianceRow[];
  nowIso: string;
  onLogClinicalEvent: () => void;
}) {
  const reviewDates = appliances
    .map((a) => a.nextReviewDate)
    .filter((d): d is string => d !== null)
    .sort();
  const nextReview = reviewDates[0] ?? null;
  const daysAway =
    nextReview !== null
      ? Math.round(
          (new Date(`${nextReview}T00:00:00.000Z`).getTime() - new Date(nowIso).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;
  // PO-ORTHO-015's visit agenda list is the multi-appliance affordance. With a
  // single appliance the rendered list is one row with an em-dash and the
  // appliance type label that's already on the hero card right above. Drop it.
  const showAgenda = appliances.length > 1;

  const dateBlock = (
    <div style={{ minWidth: 150 }}>
      <div
        className="flex items-center gap-2 text-[length:var(--nimi-type-overline-size)] font-semibold uppercase tracking-[var(--nimi-type-overline-letter-spacing)] text-[var(--nimi-text-muted)]"
      >
        {i18nText('Orthodontic.caseReview.nextReview')}
        {daysAway !== null && (
          <StatusBadge
            tone={daysAway < 0 ? 'warning' : 'success'}
            className="px-2 py-0.5 text-[length:var(--nimi-type-overline-size)] font-semibold normal-case tracking-normal"
          >
            {daysAway < 0
              ? i18nText('Orthodontic.applianceCard.daysOverdue', { days: -daysAway })
              : i18nText('Orthodontic.applianceCard.daysAway', { days: daysAway })}
          </StatusBadge>
        )}
      </div>
      <div
        className="mt-2 text-[length:var(--nimi-type-page-title-size)] font-bold tracking-[var(--nimi-type-page-title-letter-spacing)] text-[var(--nimi-text-primary)]"
      >
        {nextReview ? formatMonthDay(nextReview) : i18nText('Orthodontic.caseReview.notScheduled')}
      </div>
    </div>
  );

  const logVisitButton = (
    <Button
      type="button"
      onClick={onLogClinicalEvent}
      tone="primary"
      size="md"
      className="shrink-0 whitespace-nowrap rounded-full px-5 text-[length:var(--nimi-type-label-size)]"
    >
      {i18nText('Orthodontic.caseReview.logVisit')}
    </Button>
  );

  return (
    <Surface
      as="section"
      tone="card"
      material="solid"
      elevation="base"
      padding="none"
      className="flex flex-wrap items-center gap-7 px-6 py-5"
    >
      {dateBlock}

      {showAgenda && (
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            className="mb-2.5 text-[length:var(--nimi-type-overline-size)] font-semibold uppercase tracking-[var(--nimi-type-overline-letter-spacing)] text-[var(--nimi-text-muted)]"
          >
            {i18nText('Orthodontic.caseReview.visitAgenda')}
          </div>
          <div className="flex flex-col gap-2">
            {appliances.map((appliance) => {
              return (
                <div
                  key={appliance.applianceId}
                  className="flex items-baseline gap-2.5 text-[length:var(--nimi-type-body-sm-size)]"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 translate-y-px rounded-full bg-[var(--nimi-action-primary-bg)]"
                  />
                  <span className="font-semibold text-[var(--nimi-text-primary)]" style={{ minWidth: 96 }}>
                    {applianceTypeLabel(appliance.applianceType)}
                  </span>
                  {/* PO-ORTHO-015: a parent-empty agenda renders as a neutral
                      empty marker — never fabricated or inferred agenda text. */}
                  <span className={appliance.nextReviewAgenda ? 'text-[var(--nimi-text-primary)]' : 'text-[var(--nimi-text-muted)]'}>
                    {appliance.nextReviewAgenda ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Without the agenda column the button sits flush right against the date. */}
      {!showAgenda && <div className="flex-1" aria-hidden="true" />}

      {logVisitButton}
    </Surface>
  );
}
