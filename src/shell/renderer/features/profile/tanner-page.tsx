import { Button, Surface, nimiToast } from '@nimiplatform/kit/ui';
import { BookOpen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore, computeAgeMonths, type ChildProfile } from '../../app-shell/app-store.js';
import { getTannerAssessments, getMeasurements } from '../../bridge/sqlite-bridge.js';
import type { TannerAssessmentRow, MeasurementRow } from '../../bridge/sqlite-bridge.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { HealthRecordModalShell } from './health-record-modal-shell.js';
import { TannerCaptureContent } from './tanner-assessment-form.js';
import { TannerGuidePanel } from './tanner-guide-panel.js';
import { TannerLatestCard } from './tanner-latest-card.js';
import { TannerOverviewCards } from './tanner-overview-cards.js';
import { tannerAxisLabel } from './tanner-record-parts.js';
import { TannerTimeline } from './tanner-timeline.js';
import { AISummaryCard } from './ai-summary-card.js';
import {
  fmtAge,
  formatTannerDate,
  sortAssessmentsDesc,
  tannerStageChanges,
} from './tanner-page-shared.js';
import { i18nText } from '../../i18n/index.js';

type PageData =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; assessments: TannerAssessmentRow[]; measurements: MeasurementRow[] };

export default function TannerPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((item) => item.childId === activeChildId);
  if (!child)
    return (
      <ProfileDetailShell title={i18nText('Tanner.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  return <TannerChildPage key={child.childId} child={child} />;
}

/**
 * Puberty records archive — laid out like the other archive pages:
 *   latest dated record (both axes side by side) → earlier records on the
 *   date timeline → related growth measurements as dated supporting facts.
 */
// @nimi-authority: rule.parentos.prof.r012
// @nimi-authority: rule.parentos.prof.r020
// @nimi-authority: rule.parentos.prof.r016
function TannerChildPage({ child }: { child: ChildProfile }) {
  const [data, setData] = useState<PageData>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([getTannerAssessments(child.childId), getMeasurements(child.childId)])
      .then(([assessments, measurements]) => {
        if (
          assessments.some((row) =>
            [row.breastOrGenitalStage, row.pubicHairStage].some(
              (stage) => stage != null && (!Number.isInteger(stage) || stage < 1 || stage > 5),
            ),
          )
        ) {
          throw new Error('PO-PROF-012: invalid recorded Tanner stage');
        }
        if (active)
          setData({ status: 'ready', assessments: sortAssessmentsDesc(assessments), measurements });
      })
      .catch(() => {
        if (active) setData({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [child.childId, revision]);
  const refresh = () => {
    setShowAI(false);
    setData({ status: 'loading' });
    setRevision((value) => value + 1);
  };
  const isFemale = child.gender === 'female';
  const ageLabel = fmtAge(computeAgeMonths(child.birthDate));
  const openForm = () => setShowForm(true);
  const closeForm = () => {
    setShowForm(false);
    refresh();
  };
  const assessments = data.status === 'ready' ? data.assessments : [];
  const latest = assessments[0];
  const changes = tannerStageChanges(assessments);

  return (
    <ProfileDetailShell
      title={i18nText('Tanner.page.title')}
      actions={
        <>
          <Button
            tone={showGuide ? 'secondary' : 'ghost'}
            size="sm"
            aria-expanded={showGuide}
            aria-controls="tanner-entry-guide"
            onClick={() => setShowGuide((value) => !value)}
          >
            <BookOpen size={16} />
            {i18nText('Tanner.page.guideToggle')}
          </Button>
          {latest ? (
            <Button tone="primary" size="sm" onClick={openForm}>
              <Plus size={16} />
              {i18nText('Tanner.page.addAssessment')}
            </Button>
          ) : null}
        </>
      }
    >
      <p className="-mt-1 mb-6 text-[13px] text-[var(--nimi-text-muted)]">
        {child.displayName} · {ageLabel} ·{' '}
        {i18nText(isFemale ? 'Tanner.page.gender.female' : 'Tanner.page.gender.male')}
      </p>
      {showGuide ? (
        <TannerGuidePanel isFemale={isFemale} onClose={() => setShowGuide(false)} />
      ) : null}
      {data.status === 'loading' ? (
        <p role="status" className="py-16 text-center text-[13px] text-[var(--nimi-text-muted)]">
          {i18nText('Tanner.redesign.loading')}
        </p>
      ) : null}
      {data.status === 'error' ? (
        <Surface
          tone="card"
          material="glass-regular"
          elevation="raised"
          padding="none"
          className="rounded-3xl px-6 py-8 text-center"
        >
          <p role="alert" className="text-[14px] font-medium text-[var(--nimi-text-primary)]">
            {i18nText('Tanner.redesign.loadError')}
          </p>
          <Button tone="secondary" size="sm" className="mt-4" onClick={refresh}>
            {i18nText('Tanner.redesign.retry')}
          </Button>
        </Surface>
      ) : null}
      {data.status === 'ready' ? (
        <div className="space-y-9">
          {latest ? (
            <div className="space-y-4">
              <TannerLatestCard
                assessment={latest}
                totalCount={assessments.length}
                isFemale={isFemale}
                aiOpen={showAI}
                onToggleAi={() => setShowAI((value) => !value)}
                notice={
                  changes.length > 0 ? (
                    <section
                      aria-labelledby="tanner-changes"
                      className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,transparent)] px-4 py-3"
                    >
                      <h3
                        id="tanner-changes"
                        className="flex items-center gap-2 text-[13px] font-semibold text-[var(--nimi-text-primary)]"
                      >
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--nimi-status-warning)]"
                        />
                        {i18nText('Tanner.redesign.trendTitle')}
                      </h3>
                      {changes.map((change) => (
                        <p
                          key={change.axis}
                          className="mt-1.5 text-[12.5px] leading-[1.7] text-[var(--nimi-text-secondary)]"
                        >
                          {i18nText('Tanner.redesign.trendWatch', {
                            ...change,
                            from: formatTannerDate(change.from),
                            to: formatTannerDate(change.to),
                            axis: tannerAxisLabel(
                              change.axis === 'pubicHairStage' ? 'pubic' : 'primary',
                              isFemale,
                            ),
                          })}
                        </p>
                      ))}
                    </section>
                  ) : null
                }
              />
              {showAI ? (
                <AISummaryCard
                  domain="tanner"
                  childId={child.childId}
                  childName={child.displayName}
                  gender={child.gender}
                  ageLabel={ageLabel}
                  dataContext={JSON.stringify({
                    totalRecords: assessments.length,
                    latestFiveRecords: assessments
                      .slice(0, 5)
                      .map(
                        ({
                          assessedAt,
                          ageMonths,
                          breastOrGenitalStage,
                          pubicHairStage,
                          menarcheStatus,
                          menarcheDate,
                          assessedBy,
                        }) => ({
                          assessedAt,
                          ageMonths,
                          breastOrGenitalStage,
                          pubicHairStage,
                          menarcheStatus,
                          menarcheDate,
                          assessedBy,
                        }),
                      ),
                  })}
                />
              ) : null}
            </div>
          ) : (
            <Surface
              tone="card"
              material="glass-regular"
              elevation="raised"
              padding="none"
              className="rounded-3xl px-6 py-10 text-center sm:px-10"
            >
              <div
                aria-hidden="true"
                className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--nimi-accent-soft)] text-[26px] leading-none"
              >
                🌱
              </div>
              <h2 className="mt-4 text-[17px] font-semibold text-[var(--nimi-text-primary)]">
                {i18nText('Tanner.redesign.emptyTitle')}
              </h2>
              <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-[1.8] text-[var(--nimi-text-muted)]">
                {i18nText('Tanner.redesign.emptyDescription')}
              </p>
              <Button tone="primary" className="mt-6" onClick={openForm}>
                <Plus size={16} />
                {i18nText('Tanner.redesign.firstRecord')}
              </Button>
            </Surface>
          )}
          {assessments.length > 1 ? (
            <section aria-labelledby="tanner-history">
              <div className="mb-4 flex items-baseline gap-2 px-1">
                <h2
                  id="tanner-history"
                  className="m-0 text-[15px] font-semibold text-[var(--nimi-text-primary)]"
                >
                  {i18nText('Tanner.redesign.history')}
                </h2>
                <span className="font-mono text-[12px] text-[var(--nimi-text-muted)]">
                  {i18nText('Profile.rich.common.recordsCount', { count: assessments.length - 1 })}
                </span>
              </div>
              <TannerTimeline assessments={assessments.slice(1)} isFemale={isFemale} />
            </section>
          ) : null}
          <TannerOverviewCards
            heightMeasurements={data.measurements.filter((row) => row.typeId === 'height')}
            boneAgeMeasurements={data.measurements.filter((row) => row.typeId === 'bone-age')}
            bodyFatMeasurements={data.measurements.filter(
              (row) => row.typeId === 'body-fat-percentage',
            )}
          />
        </div>
      ) : null}
      {showForm ? (
        <HealthRecordModalShell
          open
          size="XL"
          onClose={() => {
            if (!formBusy) closeForm();
          }}
        >
          <TannerCaptureContent
            child={child}
            onClose={closeForm}
            onSavingChange={setFormBusy}
            onSaved={() => {
              nimiToast.success(i18nText('Tanner.redesign.saved'));
            }}
          />
        </HealthRecordModalShell>
      ) : null}
    </ProfileDetailShell>
  );
}
