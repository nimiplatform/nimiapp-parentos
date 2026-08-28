import { Button, Surface } from '@nimiplatform/kit/ui';
import { useEffect, useState } from 'react';
import { useAppStore, computeAgeMonths, computeAgeMonthsAt } from '../../app-shell/app-store.js';
import { insertTannerAssessment, getTannerAssessments, getMeasurements, insertMeasurement } from '../../bridge/sqlite-bridge.js';
import type { TannerAssessmentRow, MeasurementRow } from '../../bridge/sqlite-bridge.js';
import { ulid, isoNow } from '../../bridge/ulid.js';
import { AISummaryCard } from './ai-summary-card.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { NoActiveChildPlaceholder } from './_shared/no-active-child-placeholder.js';
import { ProfileDetailShell } from './_shared/profile-detail-shell.js';
import { TannerAssessmentForm } from './tanner-assessment-form.js';
import { TannerGuidePanel } from './tanner-guide-panel.js';
import { TannerOverviewCards } from './tanner-overview-cards.js';
import { TannerTimeline } from './tanner-timeline.js';
import {
  BREAST_STAGES,
  GENITAL_STAGES,
  pubicHairStages,
  sortAssessmentsDesc,
  type MenarcheStatus,
} from './tanner-page-shared.js';
import { i18nText } from '../../i18n/index.js';

function formatTannerAge(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (ageMonths < 24) return i18nText('Common.age.months', { months: ageMonths });
  return months > 0
    ? i18nText('Common.age.yearsMonths', { years, months })
    : i18nText('Common.age.years', { years });
}

export default function TannerPage() {
  const { activeChildId, children } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);
  const [assessments, setAssessments] = useState<TannerAssessmentRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const [boneAgeMeasurements, setBoneAgeMeasurements] = useState<MeasurementRow[]>([]);
  const [bodyFatMeasurements, setBodyFatMeasurements] = useState<MeasurementRow[]>([]);
  const [heightMeasurements, setHeightMeasurements] = useState<MeasurementRow[]>([]);

  const [formAssessedAt, setFormAssessedAt] = useState(new Date().toISOString().slice(0, 10));
  const [formBG, setFormBG] = useState(1);
  const [formPH, setFormPH] = useState(1);
  const [formAssessedBy, setFormAssessedBy] = useState('parent');
  const [formNotes, setFormNotes] = useState('');
  const [formBoneAge, setFormBoneAge] = useState('');
  const [formBodyFat, setFormBodyFat] = useState('');
  const [formMenarcheStatus, setFormMenarcheStatus] = useState<MenarcheStatus>('not_yet');
  const [formMenarcheDate, setFormMenarcheDate] = useState('');

  const loadAll = async (cid: string) => {
    const [ta, ms] = await Promise.all([getTannerAssessments(cid), getMeasurements(cid)]);
    setAssessments(ta);
    setBoneAgeMeasurements(ms.filter((m) => m.typeId === 'bone-age'));
    setBodyFatMeasurements(ms.filter((m) => m.typeId === 'body-fat-percentage'));
    setHeightMeasurements(ms.filter((m) => m.typeId === 'height'));
  };

  useEffect(() => {
    if (activeChildId) loadAll(activeChildId).catch(catchLog('tanner', 'action:load-tanner-data-failed'));
  }, [activeChildId]);

  if (!child) {
    return (
      <ProfileDetailShell title={i18nText('Tanner.page.title')}>
        <NoActiveChildPlaceholder />
      </ProfileDetailShell>
    );
  }

  const ageMonths = computeAgeMonths(child.birthDate);
  const isFemale = child.gender === 'female';
  const bgLabel = isFemale ? i18nText('Tanner.page.breastStageLabel') : i18nText('Tanner.page.genitalStageLabel');
  const bgStages = isFemale ? BREAST_STAGES : GENITAL_STAGES;
  const ageLabel = formatTannerAge(ageMonths);
  const genderLabel = isFemale ? i18nText('Tanner.page.gender.female') : i18nText('Tanner.page.gender.male');

  const sorted = sortAssessmentsDesc(assessments);

  const resetForm = () => {
    setFormAssessedAt(new Date().toISOString().slice(0, 10));
    setFormBG(1); setFormPH(1); setFormAssessedBy('parent'); setFormNotes('');
    setFormBoneAge(''); setFormBodyFat(''); setFormMenarcheStatus('not_yet'); setFormMenarcheDate('');
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!formAssessedAt || formBG < 1 || formBG > 5 || formPH < 1 || formPH > 5) return;
    if (isFemale && formMenarcheStatus === 'occurred' && !formMenarcheDate) return;
    const now = isoNow();
    const am = computeAgeMonthsAt(child.birthDate, formAssessedAt);
    try {
      await insertTannerAssessment({
        assessmentId: ulid(), childId: child.childId, assessedAt: formAssessedAt,
        ageMonths: am, breastOrGenitalStage: formBG, pubicHairStage: formPH,
        assessedBy: formAssessedBy || null, notes: formNotes || null, now,
        menarcheStatus: isFemale ? formMenarcheStatus : null,
        menarcheDate: isFemale && formMenarcheStatus === 'occurred' ? formMenarcheDate : null,
      });
      // Save bone age as measurement if provided.
      if (formBoneAge.trim()) {
        await insertMeasurement({
          measurementId: ulid(), childId: child.childId, typeId: 'bone-age',
          value: parseFloat(formBoneAge), measuredAt: formAssessedAt,
          ageMonths: am, percentile: null, source: 'manual', notes: null, now,
        });
      }
      // Save body fat as measurement if provided.
      if (formBodyFat.trim()) {
        await insertMeasurement({
          measurementId: ulid(), childId: child.childId, typeId: 'body-fat-percentage',
          value: parseFloat(formBodyFat), measuredAt: formAssessedAt,
          ageMonths: am, percentile: null, source: 'manual', notes: null, now,
        });
      }
      await loadAll(child.childId);
      resetForm();
    } catch { /* bridge */ }
  };

  return (
    <ProfileDetailShell
      title={
        <span className="flex items-center gap-2">
          <span>{i18nText('Tanner.page.title')}</span>
          <span className="group relative inline-flex">
            <span className="flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full text-[var(--nimi-text-muted)] hover:bg-[var(--nimi-action-ghost-hover)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <span className="pointer-events-none absolute left-0 top-7 z-50 w-[320px] rounded-xl bg-[var(--nimi-surface-overlay)] p-4 text-[13px] leading-relaxed text-[var(--nimi-text-secondary)] opacity-0 shadow-[var(--nimi-elevation-floating)] transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
              <span className="mb-2 block text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Tanner.page.reference.title')}</span>
              <ul className="space-y-2">
                <li>
                  <span className="font-medium text-[var(--nimi-action-primary-bg)]">{i18nText('Tanner.page.reference.tannerStandard')}</span>
                  <span className="mt-0.5 block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.page.reference.tannerCitation')}</span>
                  <span className="block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.page.reference.tannerJournal')}</span>
                </li>
                <li>
                  <span className="font-medium text-[var(--nimi-action-primary-bg)]">{i18nText('Tanner.page.reference.chinaReference')}</span>
                  <span className="mt-0.5 block text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.page.reference.chinaCitation')}</span>
                </li>
              </ul>
              <span className="mt-2 block border-t border-[color-mix(in_srgb,var(--nimi-border-subtle)_70%,transparent)] pt-2 text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.page.reference.normalTiming')}</span>
            </span>
          </span>
        </span>
      }
      actions={
        <>
          <button onClick={() => setShowGuide(!showGuide)}
            className={`flex items-center gap-1 rounded-2xl px-3 py-1.5 text-[13px] font-medium transition-all ${showGuide ? 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]' : 'bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-muted)]'}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {i18nText('Tanner.page.guideToggle')}
          </button>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} tone="primary" size="sm" className="rounded-2xl">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              {i18nText('Tanner.page.addAssessment')}
            </Button>
          )}
        </>
      }
      aiSummary={
        <AISummaryCard domain="tanner" childName={child.displayName} childId={child.childId}
          ageLabel={ageLabel} gender={child.gender}
          dataContext={assessments.length > 0 ? i18nText('Tanner.page.assessmentDataContext', { count: assessments.length }) : ''} />
      }
    >
      <div className="mb-4">
        <p className="text-[13px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.page.summary', { gender: genderLabel, count: assessments.length })}</p>
      </div>

      <TannerOverviewCards
        boneAgeMeasurements={boneAgeMeasurements}
        bodyFatMeasurements={bodyFatMeasurements}
        heightMeasurements={heightMeasurements}
      />

      {/* ── Guide ────────────────────────────────────────── */}
      {showGuide && (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="none" className="mb-5 overflow-hidden rounded-3xl">
          <div className="bg-[linear-gradient(135deg,var(--nimi-status-info),var(--nimi-action-primary-bg))] px-5 py-4">
            <h3 className="mb-1 text-[16px] font-bold text-[var(--nimi-action-primary-text)]">{i18nText('Tanner.page.guide.title')}</h3>
            <p className="text-[13px] text-[color-mix(in_srgb,var(--nimi-action-primary-text)_70%,transparent)]">{i18nText('Tanner.page.guide.description', { bodySystem: isFemale ? i18nText('Tanner.page.guide.bodySystem.breast') : i18nText('Tanner.page.guide.bodySystem.genital') })}</p>
          </div>
          <div className="space-y-4 bg-[var(--nimi-surface-card)] p-5">
            <div>
              <h4 className="text-[14px] font-semibold mb-1 text-[var(--nimi-text-primary)]">{i18nText('Tanner.page.guide.howToJudgeTitle')}</h4>
              <p className="text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">
                {isFemale
                  ? i18nText('Tanner.page.guide.howToJudgeFemale')
                  : i18nText('Tanner.page.guide.howToJudgeMale')}
              </p>
            </div>
            <div>
              <h4 className="text-[14px] font-semibold mb-1 text-[var(--nimi-text-primary)]">{i18nText('Tanner.page.guide.timingTitle')}</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3">
                  <p className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">{isFemale ? i18nText('Tanner.page.guide.primarySignalFemale') : i18nText('Tanner.page.guide.primarySignalMale')}</p>
                  <p className="text-[12px] text-[var(--nimi-text-muted)]">{isFemale ? i18nText('Tanner.page.guide.primaryTimingFemale') : i18nText('Tanner.page.guide.primaryTimingMale')}</p>
                  <p className="text-[12px] mt-1 text-[var(--nimi-status-danger)]">{isFemale ? i18nText('Tanner.page.guide.primaryAttentionFemale') : i18nText('Tanner.page.guide.primaryAttentionMale')}</p>
                </div>
                <div className="rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3">
                  <p className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Tanner.page.guide.pubicHairSignal')}</p>
                  <p className="text-[12px] text-[var(--nimi-text-muted)]">{isFemale ? i18nText('Tanner.page.guide.pubicHairTimingFemale') : i18nText('Tanner.page.guide.pubicHairTimingMale')}</p>
                  <p className="text-[12px] mt-1 text-[var(--nimi-text-muted)]">{i18nText('Tanner.page.guide.pubicHairNote')}</p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-[14px] font-semibold mb-1 text-[var(--nimi-text-primary)]">{i18nText('Tanner.page.guide.medicalHelpTitle')}</h4>
              <ul className="text-[13px] leading-relaxed space-y-0.5 text-[var(--nimi-text-muted)]">
                <li>• {isFemale ? i18nText('Tanner.page.guide.medicalEarlyFemale') : i18nText('Tanner.page.guide.medicalEarlyMale')}</li>
                <li>• {isFemale ? i18nText('Tanner.page.guide.medicalDelayFemale') : i18nText('Tanner.page.guide.medicalDelayMale')}</li>
                <li>• {i18nText('Tanner.page.guide.medicalRapidProgress')}</li>
                <li>• {i18nText('Tanner.page.guide.medicalBoneAge')}</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end border-t border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-5 py-3">
            <Button onClick={() => setShowGuide(false)} tone="primary" size="sm" className="rounded-2xl">{i18nText('Tanner.page.guide.confirm')}</Button>
          </div>
        </Surface>
      )}

      {showForm && (
        <TannerAssessmentForm
          isFemale={isFemale}
          bgLabel={bgLabel}
          bgStages={bgStages}
          phStages={pubicHairStages(isFemale)}
          formAssessedAt={formAssessedAt}
          setFormAssessedAt={setFormAssessedAt}
          formBG={formBG}
          setFormBG={setFormBG}
          formPH={formPH}
          setFormPH={setFormPH}
          formAssessedBy={formAssessedBy}
          setFormAssessedBy={setFormAssessedBy}
          formNotes={formNotes}
          setFormNotes={setFormNotes}
          formBoneAge={formBoneAge}
          setFormBoneAge={setFormBoneAge}
          formBodyFat={formBodyFat}
          setFormBodyFat={setFormBodyFat}
          formMenarcheStatus={formMenarcheStatus}
          setFormMenarcheStatus={setFormMenarcheStatus}
          formMenarcheDate={formMenarcheDate}
          setFormMenarcheDate={setFormMenarcheDate}
          onClose={resetForm}
          onSave={() => void handleSubmit()}
        />
      )}

      <TannerGuidePanel
        isFemale={isFemale}
        latestBG={sorted[0]?.breastOrGenitalStage ?? null}
        latestPH={sorted[0]?.pubicHairStage ?? null}
        childName={child.displayName}
        ageLabel={ageLabel}
        gender={child.gender}
        assessments={sorted}
      />

      <h2 className="text-[14px] font-semibold mb-3 mt-6 text-[var(--nimi-text-primary)]">
        {sorted.length > 0 ? i18nText('Tanner.page.historyTitle', { count: sorted.length }) : i18nText('Tanner.page.historyEmpty')}
      </h2>
      <TannerTimeline assessments={sorted} bgStages={bgStages} isFemale={isFemale} showForm={showForm} />
    </ProfileDetailShell>
  );
}
