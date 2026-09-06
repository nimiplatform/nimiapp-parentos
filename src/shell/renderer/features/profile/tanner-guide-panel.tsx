import { Surface } from '@nimiplatform/kit/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import {
  DETAIL_MAP,
  FEMALE_GUIDANCE,
  MALE_GUIDANCE,
  buildGuidanceSections,
  type GuidanceItem as TannerGuidanceItem,
  type GuidanceSectionId,
} from './tanner-page-shared.js';
import { ParentosAiMascotStatic } from './parentos-ai-mascot-button.js';
import { i18nText } from '../../i18n/index.js';


type TannerGuidePanelProps = {
  isFemale: boolean;
  latestBG: number | null;
  latestPH: number | null;
  childName: string;
  ageLabel: string;
  gender: string;
  /** Assessments sorted newest-first (sortAssessmentsDesc). */
  assessments: TannerAssessmentRow[];
};

// Pre-menarche preparation tips become obsolete once menarche has occurred.
const PRE_MENARCHE_OBSOLETE_IDS = new Set([
  'prepareMenstrualSupplies',
  'menstrualEmergencyKit',
  'talkMenstruationFear',
  'menarcheSoon',
]);

const TWELVE_MONTHS_MS = 365.25 * 24 * 60 * 60 * 1000;

// Admitted watch threshold (development.tanner-stage-reference →
// tanner-stage-two-stage-twelve-month-watch): stage delta ≥ 2 within 12 months.
function computeTwelveMonthStageDelta(assessments: TannerAssessmentRow[]): number | null {
  const staged = assessments.filter((row) => row.breastOrGenitalStage != null);
  if (staged.length < 2) return null;
  const latest = staged[0];
  if (!latest) return null;
  const latestTime = Date.parse(latest.assessedAt);
  if (Number.isNaN(latestTime)) return null;
  const windowStart = latestTime - TWELVE_MONTHS_MS;
  let earliest = latest;
  for (const row of staged) {
    const time = Date.parse(row.assessedAt);
    if (!Number.isNaN(time) && time >= windowStart) {
      earliest = row;
    }
  }
  if (earliest === latest) return null;
  return (latest.breastOrGenitalStage ?? 0) - (earliest.breastOrGenitalStage ?? 0);
}

function GuidanceItem({
  item,
  toneClassName,
  childName,
  ageLabel,
  gender,
}: {
  item: TannerGuidanceItem;
  toneClassName: string;
  childName: string;
  ageLabel: string;
  gender: string;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const detail = DETAIL_MAP[item.id];
  const topic = item.text.replace(/\s*\[.*?\]\s*/g, '');
  const childGender = gender === 'female' ? i18nText('Tanner.page.gender.female') : i18nText('Tanner.page.gender.male');
  const aiDescription = i18nText('Tanner.guidePanel.aiDescription', { childName, ageLabel, gender: childGender });
  const aiUrl = `/advisor?topic=${encodeURIComponent(topic)}&desc=${encodeURIComponent(aiDescription)}&domain=tanner&record=/profile`;

  return (
    <div className={`overflow-hidden rounded-2xl ${toneClassName}`}>
      <div className="flex items-start gap-2 p-2.5">
        <span className="text-[12px] mt-1.5 shrink-0 text-[var(--nimi-text-muted)]">●</span>
        <p className="text-[13px] leading-relaxed flex-1 text-[var(--nimi-text-primary)]">{item.text}</p>
        <div className="flex items-center gap-1 shrink-0">
          {detail ? (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className={`rounded px-1.5 py-0.5 text-[12px] transition-colors ${showDetail ? 'bg-[var(--nimi-action-primary-bg)] text-[var(--nimi-action-primary-text)]' : 'bg-[color-mix(in_srgb,var(--nimi-text-primary)_6%,transparent)] text-[var(--nimi-text-muted)]'}`}
            >
              {showDetail ? i18nText('Tanner.action.collapse') : i18nText('Tanner.action.steps')}
            </button>
          ) : null}
          <Link
            to={aiUrl}
            title={i18nText('Tanner.guidePanel.askAdvisor')}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--nimi-status-info)] transition-colors hover:bg-[color-mix(in_srgb,var(--nimi-text-primary)_8%,transparent)]"
          >
            <ParentosAiMascotStatic size={20} />
          </Link>
        </div>
      </div>
      {showDetail && detail ? (
        <div className="px-7 pb-3 space-y-2">
          <div>
            <p className="text-[12px] font-semibold mb-1 text-[var(--nimi-text-primary)]">{i18nText('Tanner.guidePanel.actionSteps')}</p>
            {detail.steps.map((step, index) => (
              <p key={index} className="text-[12px] leading-relaxed pl-3 relative text-[var(--nimi-text-muted)]">
                <span className="absolute left-0">{index + 1}.</span> {step}
              </p>
            ))}
          </div>
          {detail.resources ? (
            <div>
              <p className="text-[12px] font-semibold mb-0.5 text-[var(--nimi-text-primary)]">{i18nText('Tanner.guidePanel.resources')}</p>
              {detail.resources.map((resource, index) => (
                <p key={index} className="text-[12px] leading-relaxed text-[var(--nimi-status-info)]">{i18nText('Tanner.guidePanel.resourcePrefix')} {resource}</p>
              ))}
            </div>
          ) : null}
          {detail.when ? (
            <p className="text-[12px] text-[var(--nimi-text-muted)]">
              <span className="font-semibold text-[var(--nimi-text-primary)]">{i18nText('Tanner.guidePanel.whenPrefix')}</span>{detail.when}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TannerGuidePanel({
  isFemale,
  latestBG,
  latestPH,
  childName,
  ageLabel,
  gender,
  assessments,
}: TannerGuidePanelProps) {
  const [expanded, setExpanded] = useState(true);
  // B/G is the primary axis: female milestones (menarche, growth deceleration) anchor to it,
  // and PH often runs ahead — taking max() would show guidance one stage too early.
  const currentStage = latestBG ?? latestPH ?? 1;
  const guidanceList = isFemale ? FEMALE_GUIDANCE : MALE_GUIDANCE;
  const guidance = guidanceList.find((item) => item.stage === currentStage) ?? guidanceList[0];

  if (!guidance) {
    return null;
  }

  const nextGuidance = currentStage < 5
    ? guidanceList.find((item) => item.stage === currentStage + 1)
    : undefined;
  // Assessments arrive newest-first, so the first occurred row is the latest menarche record.
  const latestMenarche = isFemale
    ? assessments.find((row) => row.menarcheStatus === 'occurred')
    : undefined;
  const stageDelta = computeTwelveMonthStageDelta(assessments);
  const sections = buildGuidanceSections(guidance).map((section) => (
    latestMenarche
      ? { ...section, items: section.items.filter((item) => !PRE_MENARCHE_OBSOLETE_IDS.has(item.id)) }
      : section
  )).filter((section) => section.items.length > 0);

  return (
    <Surface as="section" tone="card" material="glass-regular" elevation="raised" padding="none" className="mt-6 overflow-hidden rounded-3xl">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between bg-[linear-gradient(135deg,var(--nimi-action-primary-bg),var(--nimi-status-success))] px-5 py-4 text-left">
        <div>
          <h3 className="text-[16px] font-bold text-[var(--nimi-action-primary-text)]">
            {latestBG ? i18nText('Tanner.guidePanel.titleWithAssessment') : i18nText('Tanner.guidePanel.titleWithoutAssessment')}
          </h3>
          <p className="mt-0.5 text-[13px] text-[color-mix(in_srgb,var(--nimi-action-primary-text)_70%,transparent)]">
            {i18nText('Tanner.guidePanel.subtitle', {
              stageTitle: guidance.title,
              mode: latestBG ? i18nText('Tanner.guidePanel.modeStage') : i18nText('Tanner.guidePanel.modeAge'),
            })}
          </p>
          <p className="mt-0.5 text-[12px] text-[color-mix(in_srgb,var(--nimi-action-primary-text)_70%,transparent)]">
            {i18nText('Tanner.guidePanel.commonWindow', {
              primary: isFemale ? i18nText('Tanner.page.guide.primaryTimingFemale') : i18nText('Tanner.page.guide.primaryTimingMale'),
              pubicHair: isFemale ? i18nText('Tanner.page.guide.pubicHairTimingFemale') : i18nText('Tanner.page.guide.pubicHairTimingMale'),
            })}
          </p>
          {latestMenarche ? (
            <p className="mt-0.5 text-[12px] font-medium text-[var(--nimi-action-primary-text)]">
              {latestMenarche.menarcheDate
                ? i18nText('Tanner.guidePanel.menarcheOccurredWithDate', { date: latestMenarche.menarcheDate.split('T')[0] ?? latestMenarche.menarcheDate })
                : i18nText('Tanner.timeline.menarcheOccurred')}
            </p>
          ) : null}
          {stageDelta != null ? (
            <p className={`mt-0.5 text-[12px] ${stageDelta >= 2 ? 'font-medium text-[var(--nimi-action-primary-text)]' : 'text-[color-mix(in_srgb,var(--nimi-action-primary-text)_70%,transparent)]'}`}>
              {stageDelta >= 2
                ? i18nText('Tanner.guidePanel.progressionFast')
                : i18nText('Tanner.guidePanel.progressionStable')}
            </p>
          ) : null}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`text-[color-mix(in_srgb,var(--nimi-action-primary-text)_70%,transparent)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded ? (
        <div className="space-y-4 bg-[var(--nimi-surface-card)] p-5">
          {sections.map((section) => (
            <div key={section.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[16px]">{section.icon}</span>
                <h4 className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{section.title}</h4>
              </div>
              <div className="space-y-1.5 ml-6">
                {section.items.map((item, index) => (
                  <GuidanceItem
                    key={item.id || index}
                    item={item}
                    toneClassName={guidanceSectionToneClassName(section.id)}
                    childName={childName}
                    ageLabel={ageLabel}
                    gender={gender}
                  />
                ))}
              </div>
            </div>
          ))}
          {nextGuidance ? (
            <div className="rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3">
              <p className="text-[12px] font-medium text-[var(--nimi-text-muted)]">{i18nText('Tanner.guidePanel.nextStageTitle')}</p>
              <p className="mt-1 text-[13px] font-semibold text-[var(--nimi-text-primary)]">{nextGuidance.title}</p>
              {nextGuidance.physical[0] ? (
                <p className="mt-1 text-[12px] text-[var(--nimi-text-muted)]">
                  <span className="font-medium text-[var(--nimi-text-primary)]">{i18nText('Tanner.guidance.section.physical')}：</span>
                  {nextGuidance.physical[0].text}
                </p>
              ) : null}
              {nextGuidance.parentTips[0] ? (
                <p className="mt-0.5 text-[12px] text-[var(--nimi-text-muted)]">
                  <span className="font-medium text-[var(--nimi-text-primary)]">{i18nText('Tanner.guidance.section.parentTips')}：</span>
                  {nextGuidance.parentTips[0].text}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1 border-t border-[var(--nimi-border-subtle)] pt-3">
            <p className="text-[12px] font-medium text-[var(--nimi-text-muted)]">{i18nText('Tanner.referenceNotes.title')}</p>
            <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.referenceNotes.a')}</p>
            <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.referenceNotes.b')}</p>
            <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.referenceNotes.c')}</p>
            <p className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.referenceNotes.d')}</p>
            <p className="mt-1 text-[12px] text-[var(--nimi-text-muted)]">{i18nText('Tanner.referenceNotes.disclaimer')}</p>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}

function guidanceSectionToneClassName(id: GuidanceSectionId): string {
  if (id === 'physical') return 'bg-[color-mix(in_srgb,var(--nimi-status-success)_10%,var(--nimi-surface-card))]';
  if (id === 'psychological') return 'bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,var(--nimi-surface-card))]';
  if (id === 'nutrition') return 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))]';
  if (id === 'checkups') return 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))]';
  return 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_8%,var(--nimi-surface-card))]';
}
