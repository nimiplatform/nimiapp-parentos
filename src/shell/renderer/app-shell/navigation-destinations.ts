import { HEALTH_METRIC_IDS, HEALTH_METRIC_GROUPS, OBSERVATION_DIMENSIONS } from '../knowledge-base/index.js';
import type { HealthMetricId, HealthMetricGroupId } from '../knowledge-base/index.js';

// @nimi-authority: rule.parentos.shell.r002
// These are catalog identifiers. They are never URLs or browser locations.
export const PARENTOS_DESTINATION_IDS = [
  '/timeline', '/profile', '/profile/health/:metricId', '/profile/growth', '/profile/milestones',
  '/profile/vaccines', '/profile/vision', '/profile/dental', '/profile/allergies', '/profile/sleep',
  '/profile/medical-events', '/profile/posture', '/profile/tanner', '/profile/fitness', '/profile/outdoor',
  '/profile/report-upload', '/journal', '/reminders', '/advisor', '/reports', '/settings', '/settings/children',
  '/settings/nurture-mode', '/settings/reminders', '/settings/ai', '/settings/privacy', '/settings/about',
] as const;
export type ParentOSDestinationId = typeof PARENTOS_DESTINATION_IDS[number];
export type ReminderReference = { readonly ruleId: string; readonly repeatIndex: number };
type PlainId = Exclude<ParentOSDestinationId, '/timeline' | '/profile' | '/profile/health/:metricId' | '/profile/growth' | '/profile/vision' | '/profile/dental' | '/journal' | '/reminders' | '/advisor' | '/settings/children' | '/settings'>;
export type ParentOSDestination =
  | { readonly id: PlainId }
  | { readonly id: '/timeline'; readonly focus?: 'growth'; readonly metric?: HealthMetricId }
  | { readonly id: '/profile'; readonly focus?: HealthMetricGroupId }
  | { readonly id: '/profile/health/:metricId'; readonly metricId: HealthMetricId }
  | { readonly id: '/profile/growth' | '/profile/vision'; readonly metric?: HealthMetricId }
  | { readonly id: '/profile/dental'; readonly tab?: 'history' | 'orthodontic' }
  | { readonly id: '/journal'; readonly filter?: 'all' | 'keepsake'; readonly dimensionId?: string; readonly reminder?: ReminderReference }
  | { readonly id: '/reminders'; readonly focus?: ReminderReference }
  | { readonly id: '/advisor'; readonly conversationId?: string; readonly journalEntryId?: string }
  | { readonly id: '/settings/children'; readonly returnTo?: 'profile' }
  | { readonly id: '/settings'; readonly focus?: 'data-backup' };

export type ParentOSIntent =
  | { readonly kind: 'capture'; readonly groupId?: string }
  | { readonly kind: 'add-child' }
  | { readonly kind: 'vaccine-record'; readonly ruleId: string }
  | { readonly kind: 'advisor-topic'; readonly topic?: string; readonly description?: string; readonly record?: ParentOSDestination; readonly reminder?: ReminderReference };

const ids = new Set<string>(PARENTOS_DESTINATION_IDS);
const metrics = new Set<string>(HEALTH_METRIC_IDS);
const groups = new Set<string>(HEALTH_METRIC_GROUPS.map(group => group.groupId));
const dimensions = new Set(OBSERVATION_DIMENSIONS.map(dimension => dimension.dimensionId));
const fields: Partial<Record<ParentOSDestinationId, readonly string[]>> = {
  '/timeline': ['focus', 'metric'], '/profile': ['focus'], '/profile/health/:metricId': ['metricId'],
  '/profile/growth': ['metric'], '/profile/vision': ['metric'], '/profile/dental': ['tab'],
  '/journal': ['filter', 'dimensionId', 'reminder'], '/reminders': ['focus'],
  '/advisor': ['conversationId', 'journalEntryId'], '/settings/children': ['returnTo'], '/settings': ['focus'],
};
function reference(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 256; }
function reminder(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(key => key === 'ruleId' || key === 'repeatIndex') && reference(v.ruleId) && Number.isSafeInteger(v.repeatIndex) && (v.repeatIndex as number) >= 0;
}
export function validateParentOSDestination(value: unknown): ParentOSDestination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ParentOS destination.');
  const v = value as Record<string, unknown>, id = v.id as ParentOSDestinationId;
  if (!ids.has(id) || Object.keys(v).some(key => key !== 'id' && !fields[id]?.includes(key))) throw new Error('Unknown ParentOS destination or parameter.');
  for (const [key, field] of Object.entries(v)) {
    if (field === undefined || key === 'id') continue;
    if ((key === 'metric' || key === 'metricId') && (typeof field !== 'string' || !metrics.has(field))) throw new Error('Unknown health metric.');
    if (key === 'dimensionId' && (typeof field !== 'string' || !dimensions.has(field))) throw new Error('Unknown observation dimension.');
    if (key === 'filter' && field !== 'all' && field !== 'keepsake') throw new Error('Unknown journal filter.');
    if (key === 'tab' && field !== 'history' && field !== 'orthodontic') throw new Error('Unknown dental tab.');
    if (key === 'returnTo' && field !== 'profile') throw new Error('Invalid child management return.');
    if (key === 'reminder' || (key === 'focus' && id === '/reminders')) { if (!reminder(field)) throw new Error('Invalid reminder reference.'); }
    else if (key === 'focus') { if (!reference(field) || (id === '/profile' && !groups.has(field)) || (id === '/timeline' && field !== 'growth') || (id === '/settings' && field !== 'data-backup')) throw new Error('Invalid focus.'); }
    if ((key === 'conversationId' || key === 'journalEntryId') && !reference(field)) throw new Error('Invalid local record reference.');
  }
  if (id === '/profile/health/:metricId' && !metrics.has(v.metricId as string)) throw new Error('Health detail requires a metric.');
  if (id === '/profile/growth' && v.metric && !(v.metric as string).startsWith('growth.')) throw new Error('Growth metric required.');
  if (id === '/profile/vision' && v.metric && !(v.metric as string).startsWith('vision.')) throw new Error('Vision metric required.');
  if (v.conversationId && v.journalEntryId) throw new Error('Conflicting advisor references.');
  if (id === '/profile/report-upload') return { id: '/profile' };
  const normalized = Object.fromEntries(Object.entries(v).filter(([, field]) => field !== undefined).sort(([left], [right]) => left.localeCompare(right)));
  for (const key of ['reminder', 'focus']) {
    if (normalized[key] && typeof normalized[key] === 'object') {
      const reference = normalized[key] as ReminderReference;
      normalized[key] = { repeatIndex: reference.repeatIndex, ruleId: reference.ruleId };
    }
  }
  return normalized as ParentOSDestination;
}

/** A registry's declared detail owner maps to a typed position, never a query URL. */
export function healthMetricDestination(metricId: HealthMetricId, detailId?: string | null): ParentOSDestination {
  if (detailId === '/profile/growth' || detailId === '/profile/vision') return validateParentOSDestination({ id: detailId, metric: metricId });
  if (detailId === '/profile/health/:metricId' || !detailId) return { id: '/profile/health/:metricId', metricId };
  return validateParentOSDestination({ id: detailId });
}
