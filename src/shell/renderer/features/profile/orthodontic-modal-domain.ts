import type { OrthoClinicalEventType, OrthodonticApplianceType, OrthodonticStage, WritableOrthodonticCaseType } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


export const CASE_TYPE_OPTIONS: { value: WritableOrthodonticCaseType; label: string }[] = [
  { value: 'early-intervention', label: i18nText('Orthodontic.caseType.earlyIntervention') },
  { value: 'fixed-braces', label: i18nText('Orthodontic.caseType.fixedBraces') },
  { value: 'clear-aligners', label: i18nText('Orthodontic.caseType.clearAligners') },
];

export const STAGE_OPTIONS: { value: OrthodonticStage; label: string }[] = [
  { value: 'assessment', label: i18nText('Orthodontic.stage.assessment') },
  { value: 'planning', label: i18nText('Orthodontic.stage.planning') },
  { value: 'active', label: i18nText('Orthodontic.stage.active') },
  { value: 'retention', label: i18nText('Orthodontic.stage.retention') },
  { value: 'completed', label: i18nText('Orthodontic.stage.completed') },
];

export const CASE_CREATE_STAGE_OPTIONS = STAGE_OPTIONS.filter((option) => option.value !== 'completed');

export const ORTHO_CLINICAL_EVENT_OPTIONS: { value: OrthoClinicalEventType; label: string; desc: string }[] = [
  { value: 'ortho-review', label: i18nText('Orthodontic.clinicalEvent.review.label'), desc: i18nText('Orthodontic.clinicalEvent.review.description') },
  { value: 'ortho-adjustment', label: i18nText('Orthodontic.clinicalEvent.adjustment.label'), desc: i18nText('Orthodontic.clinicalEvent.adjustment.description') },
  { value: 'ortho-issue', label: i18nText('Orthodontic.clinicalEvent.issue.label'), desc: i18nText('Orthodontic.clinicalEvent.issue.description') },
  { value: 'ortho-end', label: i18nText('Orthodontic.clinicalEvent.end.label'), desc: i18nText('Orthodontic.clinicalEvent.end.description') },
];

export function eventTypeAdvancesReview(t: OrthoClinicalEventType): boolean {
  return t === 'ortho-review' || t === 'ortho-adjustment';
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function applianceRequiresPrescribedHours(applianceType: OrthodonticApplianceType): boolean {
  return applianceType === 'clear-aligner'
    || applianceType === 'twin-block'
    || applianceType === 'activator'
    || applianceType === 'retainer-removable';
}
