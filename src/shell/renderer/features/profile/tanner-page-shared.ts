import type { TannerAssessmentRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';

export interface StageDesc {
  stage: number;
  title: string;
  desc: string;
  howToJudge: string;
}

export interface GuidanceItem {
  id: string;
  text: string;
}

export interface StageGuidance {
  stage: number;
  title: string;
  physical: GuidanceItem[];
  psychological: GuidanceItem[];
  nutrition: GuidanceItem[];
  checkups: GuidanceItem[];
  parentTips: GuidanceItem[];
}

export type GuidanceSectionId = 'physical' | 'psychological' | 'nutrition' | 'checkups' | 'parentTips';

export interface GuidanceSection {
  id: GuidanceSectionId;
  icon: string;
  title: string;
  items: GuidanceItem[];
  color: string;
}

export interface GuidanceDetail {
  steps: string[];
  resources?: string[];
  when?: string;
}

const ASSESSED_BY_LABEL_KEYS: Record<string, string> = {
  self: 'Tanner.assessedBy.self',
  parent: 'Tanner.assessedBy.parent',
  physician: 'Tanner.assessedBy.physician',
};

function stageDesc(kind: 'breast' | 'genital' | 'pubicHair', stage: number): StageDesc {
  const keyPrefix = `Tanner.stage.${kind}.${stage}`;
  return {
    stage,
    title: i18nText(`${keyPrefix}.title`),
    desc: i18nText(`${keyPrefix}.desc`),
    howToJudge: i18nText(`${keyPrefix}.howToJudge`),
  };
}

function guidanceItem(id: string): GuidanceItem {
  return {
    id,
    text: i18nText(`Tanner.guidance.item.${id}`),
  };
}

function guidanceItems(ids: string[]): GuidanceItem[] {
  return ids.map(guidanceItem);
}

function detail(id: string, steps: number, options: { resources?: number; when?: boolean } = {}): GuidanceDetail {
  const keyPrefix = `Tanner.guidance.detail.${id}`;
  return {
    steps: Array.from({ length: steps }, (_, index) => i18nText(`${keyPrefix}.steps.${index + 1}`)),
    resources: options.resources
      ? Array.from({ length: options.resources }, (_, index) => i18nText(`${keyPrefix}.resources.${index + 1}`))
      : undefined,
    when: options.when ? i18nText(`${keyPrefix}.when`) : undefined,
  };
}

export const BREAST_STAGES: StageDesc[] = [1, 2, 3, 4, 5].map((stage) => stageDesc('breast', stage));
export const GENITAL_STAGES: StageDesc[] = [1, 2, 3, 4, 5].map((stage) => stageDesc('genital', stage));
export const PUBIC_HAIR_STAGES: StageDesc[] = [1, 2, 3, 4, 5].map((stage) => stageDesc('pubicHair', stage));

export const FEMALE_GUIDANCE: StageGuidance[] = [
  {
    stage: 1,
    title: i18nText('Tanner.guidance.female.1.title'),
    physical: guidanceItems(['femalePrepubertalSleepExercise', 'growthVelocityWindow']),
    psychological: guidanceItems(['bodyBasicsBooks', 'openCommunicationFull']),
    nutrition: guidanceItems(['calcium4To10', 'vitaminDWithTest', 'avoidSugarFatPrecocious']),
    checkups: guidanceItems(['femaleEarlyBreastCheck', 'routineGrowthCurveCheck']),
    parentTips: guidanceItems(['dietHabitFoundation', 'reduceBpa']),
  },
  {
    stage: 2,
    title: i18nText('Tanner.guidance.female.2.title'),
    physical: guidanceItems(['femaleGrowthSpurtStarting', 'trainingBra', 'pubertyDuration']),
    psychological: guidanceItems(['femalePubertyEducation', 'hormoneMoodNormal', 'bodyPrivacyProtection']),
    nutrition: guidanceItems(['femaleIronPreparation', 'calcium11', 'femaleProtein10To12']),
    checkups: guidanceItems(['boneAgeAdultHeight', 'femaleB2TimingReferral', 'heightEveryHalfYear']),
    parentTips: guidanceItems(['femalePubertyStartWindow', 'menarcheAfterB2', 'prepareMenstrualSupplies']),
  },
  {
    stage: 3,
    title: i18nText('Tanner.guidance.female.3.title'),
    physical: guidanceItems(['femalePhvBeforeMenarche', 'femaleFatRedistribution']),
    psychological: guidanceItems(['healthyBodyImage', 'peerComparisonMood']),
    nutrition: guidanceItems(['ironCalciumZincVitaminD', 'avoidDieting']),
    checkups: guidanceItems(['menarcheSoon', 'earlyMenstrualIrregular']),
    parentTips: guidanceItems(['menstrualEmergencyKit', 'talkMenstruationFear']),
  },
  {
    stage: 4,
    title: i18nText('Tanner.guidance.female.4.title'),
    physical: guidanceItems(['menarcheAroundB4', 'postMenarcheGrowthSlow', 'bodyShapeMaturing']),
    psychological: guidanceItems(['selfAwarenessBodyAnxiety', 'bodyFunctionFocus']),
    nutrition: guidanceItems(['menstrualIron', 'balancedNoTonic']),
    checkups: guidanceItems(['irregular2YearsSeekCare', 'hpvTiming']),
    parentTips: guidanceItems(['crampsWarmRest', 'openDialogue']),
  },
  {
    stage: 5,
    title: i18nText('Tanner.guidance.female.5.title'),
    physical: guidanceItems(['developmentMostlyCompleteFemale', 'cycleRegularizing']),
    psychological: guidanceItems(['moodStabilizing', 'positiveBodyImageConfidence']),
    nutrition: guidanceItems(['maintenanceNutritionCalciumIron']),
    checkups: guidanceItems(['annualCheckup', 'abnormalMenstrualCare']),
    parentTips: guidanceItems(['pubertyHardPartPassing']),
  },
];

export const MALE_GUIDANCE: StageGuidance[] = [
  {
    stage: 1,
    title: i18nText('Tanner.guidance.male.1.title'),
    physical: guidanceItems(['maleSleepExercise', 'maleGrowthSpurtLater']),
    psychological: guidanceItems(['basicBodyEducation', 'openCommunicationHabit']),
    nutrition: guidanceItems(['calcium4To10', 'vitaminD', 'avoidHighCaloriePubertyTiming']),
    checkups: guidanceItems(['maleEarlyTestisCheck', 'routineGrowthCurveCheck']),
    parentTips: guidanceItems(['malePubertyLaterNoAnxiety', 'reduceEndocrineDisruptors']),
  },
  {
    stage: 2,
    title: i18nText('Tanner.guidance.male.2.title'),
    physical: guidanceItems(['testicularEnlargementFirstSignal', 'maleGrowthSpurtAfterG2', 'pubertyDurationMale']),
    psychological: guidanceItems(['malePubertyEducation', 'maleBodyCuriosityAnxiety', 'bodyPrivacyProtection']),
    nutrition: guidanceItems(['maleProteinIncrease', 'calcium11', 'zincImportant']),
    checkups: guidanceItems(['boneAgeProgress', 'maleG2TimingReferral', 'heightEveryHalfYearShort']),
    parentTips: guidanceItems(['maleMayNotInitiateTalk', 'sameGenderCaregiver', 'onlineSearchGuidance']),
  },
  {
    stage: 3,
    title: i18nText('Tanner.guidance.male.3.title'),
    physical: guidanceItems(['maleHeightRapidGrowth', 'voiceChanging', 'acneFirstEmission']),
    psychological: guidanceItems(['moodIrritableWithdrawn', 'curiosityTowardOppositeSex', 'strongerSelfEsteemCommunication']),
    nutrition: guidanceItems(['higherEnergyProtein', 'doNotRestrictCarbs', 'milkSoyCalcium']),
    checkups: guidanceItems(['scoliosisRapidGrowth', 'severeAcneDermatology']),
    parentTips: guidanceItems(['nocturnalEmissionNormal', 'faceCleaningAcne', 'exerciseGrowthHormone']),
  },
  {
    stage: 4,
    title: i18nText('Tanner.guidance.male.4.title'),
    physical: guidanceItems(['malePhv', 'muscleMassIncrease', 'bodyHairVoiceDeep']),
    psychological: guidanceItems(['independence', 'autonomyWithBoundaries']),
    nutrition: guidanceItems(['protein15To17', 'sportsCarbsWater']),
    checkups: guidanceItems(['spinePostureMonitor', 'sportsInjuryPrevention']),
    parentTips: guidanceItems(['privacyOpenDoor', 'sexEducationValues']),
  },
  {
    stage: 5,
    title: i18nText('Tanner.guidance.male.5.title'),
    physical: guidanceItems(['developmentMostlyCompleteMale', 'muscleFilling']),
    psychological: guidanceItems(['moodStabilizing', 'identityBuilding']),
    nutrition: guidanceItems(['maintenanceBalanced']),
    checkups: guidanceItems(['annualCheckup']),
    parentTips: guidanceItems(['maintainParentChildRelationship']),
  },
];

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

export function sortAssessmentsDesc(assessments: TannerAssessmentRow[]) {
  return [...assessments].sort((left, right) => right.assessedAt.localeCompare(left.assessedAt));
}

export const DETAIL_MAP: Record<string, GuidanceDetail> = {
  bodyBasicsBooks: detail('bodyBasicsBooks', 3, { resources: 2, when: true }),
  openCommunicationFull: detail('openCommunication', 3, { when: true }),
  openCommunicationHabit: detail('openCommunication', 3, { when: true }),
  femalePubertyEducation: detail('femalePubertyEducation', 4, { resources: 2, when: true }),
  malePubertyEducation: detail('malePubertyEducation', 4, { resources: 1, when: true }),
  calcium4To10: detail('calcium4To10', 3, { when: true }),
  vitaminDWithTest: detail('vitaminDWithTest', 4, { when: true }),
  femaleIronPreparation: detail('femaleIronPreparation', 4),
  boneAgeAdultHeight: detail('boneAge', 4, { when: true }),
  boneAgeProgress: detail('boneAge', 4, { when: true }),
  femaleEarlyBreastCheck: detail('femaleEarlyBreastCheck', 4, { when: true }),
  maleEarlyTestisCheck: detail('maleEarlyTestisCheck', 4, { when: true }),
  menarcheAfterB2: detail('menarcheAfterB2', 4, { resources: 1, when: true }),
  nocturnalEmissionNormal: detail('nocturnalEmissionNormal', 4, { when: true }),
};

export function buildGuidanceSections(guidance: StageGuidance): GuidanceSection[] {
  return [
    { id: 'physical', icon: '💪', title: i18nText('Tanner.guidance.section.physical'), items: guidance.physical, color: '#e8f5e9' },
    { id: 'psychological', icon: '🧠', title: i18nText('Tanner.guidance.section.psychological'), items: guidance.psychological, color: '#e3f2fd' },
    { id: 'nutrition', icon: '🥗', title: i18nText('Tanner.guidance.section.nutrition'), items: guidance.nutrition, color: '#fff3e0' },
    { id: 'checkups', icon: '🏥', title: i18nText('Tanner.guidance.section.checkups'), items: guidance.checkups, color: '#fce4ec' },
    { id: 'parentTips', icon: '💡', title: i18nText('Tanner.guidance.section.parentTips'), items: guidance.parentTips, color: '#f3e5f5' },
  ];
}
