import type { AttachmentRow, DentalRecordRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


/**
 * Event types admitted by the generic dental event picker for NEW writes.
 *
 * `ortho-start` is intentionally absent: per PO-PROF-008 and the
 * orthodontic-contract, new orthodontic treatment state must be modeled
 * through `orthodontic_cases` + `orthodontic_appliances`. Historical
 * `ortho-start` rows remain read-only — the dental timeline still renders
 * them (see DENTAL_HISTORY_TONE_TABLE in dental-history-record-list.tsx and
 * DENTAL_READ_ONLY_EVENT_LABELS below), but the Rust command layer rejects
 * new writes (see src-tauri/src/sqlite/queries/health_records.rs).
 *
 * The ortho-review / ortho-adjustment / ortho-issue / ortho-end events are
 * likewise NOT user-pickable here — they are written exclusively by the
 * orthodontic workflow's clinical-event shortcut, not via this generic picker.
 */
export const EVENT_TYPES = [
  { key: 'eruption', label: i18nText('Dental.eventType.eruption.label'), emoji: '🌱', desc: i18nText('Dental.eventType.eruption.description'), minAge: 0 },
  { key: 'loss', label: i18nText('Dental.eventType.loss.label'), emoji: '🦷', desc: i18nText('Dental.eventType.loss.description'), minAge: 60 },
  { key: 'caries', label: i18nText('Dental.eventType.caries.label'), emoji: '🔴', desc: i18nText('Dental.eventType.caries.description'), minAge: 12 },
  { key: 'filling', label: i18nText('Dental.eventType.filling.label'), emoji: '🔧', desc: i18nText('Dental.eventType.filling.description'), minAge: 24 },
  { key: 'cleaning', label: i18nText('Dental.eventType.cleaning.label'), emoji: '✨', desc: i18nText('Dental.eventType.cleaning.description'), minAge: 24 },
  { key: 'fluoride', label: i18nText('Dental.eventType.fluoride.label'), emoji: '💧', desc: i18nText('Dental.eventType.fluoride.description'), minAge: 6 },
  { key: 'sealant', label: i18nText('Dental.eventType.sealant.label'), emoji: '🛡️', desc: i18nText('Dental.eventType.sealant.description'), minAge: 36 },
  { key: 'ortho-assessment', label: i18nText('Dental.eventType.orthoAssessment.label'), emoji: '📐', desc: i18nText('Dental.eventType.orthoAssessment.description'), minAge: 84 },
  { key: 'checkup', label: i18nText('Dental.eventType.checkup.label'), emoji: '🔍', desc: i18nText('Dental.eventType.checkup.description'), minAge: 0 },
] as const;

/** Labels for dental eventTypes that are DISPLAY-ONLY (no new write path from the UI). */
export const DENTAL_READ_ONLY_EVENT_LABELS: Record<string, { label: string; emoji: string }> = {
  'ortho-start': { label: i18nText('Dental.readOnlyEvent.orthoStart.label'), emoji: '🦷' },
  'ortho-review': { label: i18nText('Dental.readOnlyEvent.orthoReview.label'), emoji: '📋' },
  'ortho-adjustment': { label: i18nText('Dental.readOnlyEvent.orthoAdjustment.label'), emoji: '🔧' },
  'ortho-issue': { label: i18nText('Dental.readOnlyEvent.orthoIssue.label'), emoji: '⚠️' },
  'ortho-end': { label: i18nText('Dental.readOnlyEvent.orthoEnd.label'), emoji: '✅' },
};

/**
 * Filter-chip group: the dental history view collapses every orthodontic
 * eventType (evaluation, in-flight reviews/adjustments/issues, end) into a
 * single orthodontic chip. The chip's filter key is `ORTHO_GROUP_FILTER_KEY`;
 * individual rows still display their own specific label inside the card.
 */
export const ORTHO_EVENT_TYPES: ReadonlySet<string> = new Set([
  'ortho-assessment',
  'ortho-start',
  'ortho-review',
  'ortho-adjustment',
  'ortho-issue',
  'ortho-end',
]);
export const ORTHO_GROUP_FILTER_KEY = '__ortho__';
export const ORTHO_GROUP_FILTER_LABEL = i18nText('Dental.orthoGroupLabel');

/**
 * Resolve a dental eventType to its display label + emoji. Consults the
 * pickable `EVENT_TYPES` first, then `DENTAL_READ_ONLY_EVENT_LABELS` for
 * orthodontic events that the dental UI only renders (orthodontic-workflow
 * writes those rows). Falls back to the raw key + a generic tooth emoji so
 * a brand-new type never crashes the timeline — but the raw key fallback
 * is a code smell signaling the maps drifted from the schema.
 */
export function dentalEventLabelAndEmoji(key: string): { label: string; emoji: string } {
  const pickable = EVENT_TYPES.find((e) => e.key === key);
  if (pickable) return { label: pickable.label, emoji: pickable.emoji };
  const readOnly = DENTAL_READ_ONLY_EVENT_LABELS[key];
  if (readOnly) return readOnly;
  return { label: key, emoji: '🦷' };
}

export const SEVERITY_LABELS: Record<string, string> = {
  mild: i18nText('Dental.severity.mild'),
  moderate: i18nText('Dental.severity.moderate'),
  severe: i18nText('Dental.severity.severe'),
};

export const NEEDS_SEVERITY = new Set(['caries']);
export const NEEDS_TOOTH = new Set(['eruption', 'loss', 'caries', 'filling', 'sealant']);

export const PRIMARY_UPPER_R = ['55', '54', '53', '52', '51'];
export const PRIMARY_UPPER_L = ['61', '62', '63', '64', '65'];
export const PRIMARY_LOWER_L = ['71', '72', '73', '74', '75'];
export const PRIMARY_LOWER_R = ['85', '84', '83', '82', '81'];

export const PERM_UPPER_R = ['18', '17', '16', '15', '14', '13', '12', '11'];
export const PERM_UPPER_L = ['21', '22', '23', '24', '25', '26', '27', '28'];
export const PERM_LOWER_L = ['31', '32', '33', '34', '35', '36', '37', '38'];
export const PERM_LOWER_R = ['48', '47', '46', '45', '44', '43', '42', '41'];

export const TOOTH_NAMES: Record<string, string> = {
  '11': i18nText('Dental.toothName.11'), '12': i18nText('Dental.toothName.12'), '13': i18nText('Dental.toothName.13'), '14': i18nText('Dental.toothName.14'), '15': i18nText('Dental.toothName.15'), '16': i18nText('Dental.toothName.16'), '17': i18nText('Dental.toothName.17'), '18': i18nText('Dental.toothName.18'),
  '21': i18nText('Dental.toothName.21'), '22': i18nText('Dental.toothName.22'), '23': i18nText('Dental.toothName.23'), '24': i18nText('Dental.toothName.24'), '25': i18nText('Dental.toothName.25'), '26': i18nText('Dental.toothName.26'), '27': i18nText('Dental.toothName.27'), '28': i18nText('Dental.toothName.28'),
  '31': i18nText('Dental.toothName.31'), '32': i18nText('Dental.toothName.32'), '33': i18nText('Dental.toothName.33'), '34': i18nText('Dental.toothName.34'), '35': i18nText('Dental.toothName.35'), '36': i18nText('Dental.toothName.36'), '37': i18nText('Dental.toothName.37'), '38': i18nText('Dental.toothName.38'),
  '41': i18nText('Dental.toothName.41'), '42': i18nText('Dental.toothName.42'), '43': i18nText('Dental.toothName.43'), '44': i18nText('Dental.toothName.44'), '45': i18nText('Dental.toothName.45'), '46': i18nText('Dental.toothName.46'), '47': i18nText('Dental.toothName.47'), '48': i18nText('Dental.toothName.48'),
  '51': i18nText('Dental.toothName.51'), '52': i18nText('Dental.toothName.52'), '53': i18nText('Dental.toothName.53'), '54': i18nText('Dental.toothName.54'), '55': i18nText('Dental.toothName.55'),
  '61': i18nText('Dental.toothName.61'), '62': i18nText('Dental.toothName.62'), '63': i18nText('Dental.toothName.63'), '64': i18nText('Dental.toothName.64'), '65': i18nText('Dental.toothName.65'),
  '71': i18nText('Dental.toothName.71'), '72': i18nText('Dental.toothName.72'), '73': i18nText('Dental.toothName.73'), '74': i18nText('Dental.toothName.74'), '75': i18nText('Dental.toothName.75'),
  '81': i18nText('Dental.toothName.81'), '82': i18nText('Dental.toothName.82'), '83': i18nText('Dental.toothName.83'), '84': i18nText('Dental.toothName.84'), '85': i18nText('Dental.toothName.85'),
};

export interface EventEntry {
  eventType: string;
  toothIds: string[];
  toothSet: 'primary' | 'permanent';
  severity: string;
}

export interface PendingDentalPhoto {
  base64: string;
  mimeType: string;
  fileName: string;
}

export const PHOTO_MAX = 9;

export function makeEventEntry(ageMonths: number): EventEntry {
  return {
    eventType: 'eruption',
    toothIds: [],
    toothSet: ageMonths < 72 ? 'primary' : 'permanent',
    severity: '',
  };
}

export function parseDentalToothIds(toothId: string | null): string[] {
  if (!toothId) return [];
  return toothId
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function joinDentalToothIds(toothIds: string[]): string | null {
  const normalized = [...new Set(toothIds.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized.join(',') : null;
}

export function formatDentalToothLabel(toothId: string | null): string | null {
  const toothIds = parseDentalToothIds(toothId);
  if (toothIds.length === 0) {
    return null;
  }
  return toothIds
    .map((id) => `${id}${TOOTH_NAMES[id] ? ` ${TOOTH_NAMES[id]}` : ''}`)
    .join(i18nText('Dental.toothLabel.separator'));
}

export function buildDentalAttachmentMap(attachments: AttachmentRow[]) {
  const next = new Map<string, AttachmentRow[]>();
  for (const attachment of attachments) {
    if (attachment.ownerTable !== 'health_record_events') continue;
    const existing = next.get(attachment.ownerId);
    if (existing) existing.push(attachment);
    else next.set(attachment.ownerId, [attachment]);
  }
  return next;
}

type EruptionState = 'unerupted' | 'primary_present' | 'lost_waiting' | 'permanent_erupted';
type HealthState = 'healthy' | 'caries' | 'treated';

interface OverviewCell {
  eruption: EruptionState;
  health: HealthState;
  displayId: string;
}

const PRIMARY_TO_PERMANENT: Record<string, string> = {
  '55': '15', '54': '14', '53': '13', '52': '12', '51': '11',
  '61': '21', '62': '22', '63': '23', '64': '24', '65': '25',
  '71': '31', '72': '32', '73': '33', '74': '34', '75': '35',
  '85': '45', '84': '44', '83': '43', '82': '42', '81': '41',
};

const OVERVIEW_UPPER_R = ['18', '17', '16', '55', '54', '53', '52', '51'];
const OVERVIEW_UPPER_L = ['61', '62', '63', '64', '65', '26', '27', '28'];
const OVERVIEW_LOWER_L = ['71', '72', '73', '74', '75', '36', '37', '38'];
const OVERVIEW_LOWER_R = ['48', '47', '46', '85', '84', '83', '82', '81'];

function deriveHealth(events: string[]): HealthState {
  let health: HealthState = 'healthy';
  for (const eventType of events) {
    if (eventType === 'caries') health = 'caries';
    else if (eventType === 'filling' || eventType === 'sealant') health = 'treated';
  }
  return health;
}

export function computeDentalOverviewStates(records: DentalRecordRow[]): Map<string, OverviewCell> {
  const byTooth = new Map<string, string[]>();
  const sorted = [...records].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  for (const record of sorted) {
    for (const toothId of parseDentalToothIds(record.toothId)) {
      const events = byTooth.get(toothId);
      if (events) events.push(record.eventType);
      else byTooth.set(toothId, [record.eventType]);
    }
  }

  const hasAnyEvent = (id: string) => (byTooth.get(id)?.length ?? 0) > 0;
  const hasHealthEvent = (id: string) =>
    (byTooth.get(id) ?? []).some((eventType) => eventType === 'caries' || eventType === 'filling' || eventType === 'sealant');
  const hasEvent = (id: string, type: string) => (byTooth.get(id) ?? []).includes(type);

  const output = new Map<string, OverviewCell>();
  const positions = [...OVERVIEW_UPPER_R, ...OVERVIEW_UPPER_L, ...OVERVIEW_LOWER_L, ...OVERVIEW_LOWER_R];
  for (const positionId of positions) {
    const permanentId = PRIMARY_TO_PERMANENT[positionId];
    if (permanentId) {
      if (hasAnyEvent(permanentId)) {
        output.set(positionId, {
          eruption: 'permanent_erupted',
          health: deriveHealth(byTooth.get(permanentId) ?? []),
          displayId: permanentId,
        });
      } else if (hasEvent(positionId, 'loss')) {
        output.set(positionId, { eruption: 'lost_waiting', health: 'healthy', displayId: positionId });
      } else if (hasEvent(positionId, 'eruption') || hasHealthEvent(positionId)) {
        output.set(positionId, {
          eruption: 'primary_present',
          health: deriveHealth(byTooth.get(positionId) ?? []),
          displayId: positionId,
        });
      } else {
        output.set(positionId, { eruption: 'unerupted', health: 'healthy', displayId: positionId });
      }
    } else if (hasAnyEvent(positionId)) {
      output.set(positionId, {
        eruption: 'permanent_erupted',
        health: deriveHealth(byTooth.get(positionId) ?? []),
        displayId: positionId,
      });
    } else {
      output.set(positionId, { eruption: 'unerupted', health: 'healthy', displayId: positionId });
    }
  }
  return output;
}

export type { EruptionState, HealthState, OverviewCell };
