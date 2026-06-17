import {
  HEALTH_CAPTURE_PROTOCOLS,
  HEALTH_METRIC_GROUPS,
  HEALTH_METRICS,
  type HealthCaptureProtocol,
  type HealthCaptureProtocolId,
  type HealthMetricDefinition,
  type HealthMetricGroup,
  type HealthMetricId,
} from '../../knowledge-base/index.js';
import {
  getHealthCaptureProtocol,
  getHealthMetricDefinition,
  recomputeDerivedHealthRecordValues,
  type HealthRecordEvent,
  type HealthRecordEventKind,
  type HealthRecordValue,
} from '../../engine/health-record-domain.js';

export type HealthCaptureLaunchMode = 'manual' | 'prefilled' | 'guided' | 'reminder' | 'ocr_confirm';
export type HealthCaptureOrigin =
  | 'profile_add_icon'
  | 'metric_row'
  | 'reminder'
  | 'detail_page'
  | 'ocr_confirm'
  | 'dashboard_task';
export type HealthCaptureSource = 'manual' | 'ocr' | 'imported' | 'reminder';

export interface LinkedHealthRecordReminder {
  childId?: string | null;
  stateId?: string | null;
  ruleId: string;
  repeatIndex?: number | null;
  scheduledFor?: string | null;
  dueDate?: string | null;
}

export interface HealthCaptureIntent {
  intentId: string;
  origin: HealthCaptureOrigin;
  childId: string;
  groupId: HealthMetricGroup['groupId'];
  metricIds: readonly HealthMetricId[];
  captureProtocolId?: HealthCaptureProtocolId | null;
  mode: HealthCaptureLaunchMode;
  recordedAtDefault: string;
  source: HealthCaptureSource;
  recorderId?: string | null;
  notes?: string | null;
  linkedReminder?: LinkedHealthRecordReminder | null;
  dashboardTaskId?: string | null;
  prefillValues?: Partial<Record<HealthMetricId, HealthCaptureDraftValue>>;
  postSaveBehavior?: 'close' | 'stay';
}

export interface HealthCaptureDraftValue {
  value: string;
  qualifier?: string | null;
}

export interface HealthCaptureBuildInput {
  childId: string;
  ageMonths: number;
  intent: HealthCaptureIntent;
  draftValues: Partial<Record<HealthMetricId, HealthCaptureDraftValue>>;
  nowIso: string;
  makeId: () => string;
}

export interface HealthCaptureEventInput {
  eventId: string;
  childId: string;
  protocolId: HealthCaptureProtocolId;
  groupId: HealthMetricGroup['groupId'];
  recordKind: HealthRecordEventKind;
  sourceSurface: HealthRecordEvent['sourceSurface'];
  recordedAt: string;
  effectiveDate: string;
  ageMonths: number;
  recorderId: string | null;
  linkedReminderStateId: string | null;
  linkedReminderRuleId: string | null;
  notes: string | null;
  metadataJson: string | null;
  now: string;
  values: HealthCaptureValueInput[];
}

export interface HealthCaptureValueInput {
  valueId: string;
  metricId: HealthMetricId;
  valueNumber: number | null;
  valueText: string | null;
  valueJson: string | null;
  unit: string | null;
  qualifier: string | null;
  recordKind: 'measured' | 'derived' | 'parent_confirmed_import';
  sourceValueIds: string | null;
}

export interface HealthCaptureProtocolOption {
  group: HealthMetricGroup;
  protocols: readonly HealthCaptureProtocol[];
}

export interface DefaultHealthCaptureIntentInput {
  intentId: string;
  origin: HealthCaptureOrigin;
  childId: string;
  groupId: HealthMetricGroup['groupId'];
  metricIds: readonly HealthMetricId[];
  mode: HealthCaptureLaunchMode;
  todayIso: string;
  source?: HealthCaptureSource;
  captureProtocolId?: HealthCaptureProtocolId | null;
  linkedReminder?: LinkedHealthRecordReminder | null;
  dashboardTaskId?: string | null;
}

const metricById = new Map(HEALTH_METRICS.map((metric) => [metric.metricId, metric]));

export function getHealthCaptureProtocolOptions(): HealthCaptureProtocolOption[] {
  return getHealthCaptureProtocolOptionsFor(() => true);
}

export function getHealthRecordEventCaptureProtocolOptions(): HealthCaptureProtocolOption[] {
  return getHealthCaptureProtocolOptionsFor((protocol) => protocol.storageTarget === 'health_record_event');
}

function getHealthCaptureProtocolOptionsFor(
  includeProtocol: (protocol: HealthCaptureProtocol) => boolean,
): HealthCaptureProtocolOption[] {
  return [...HEALTH_METRIC_GROUPS]
    .sort((left, right) => left.rank - right.rank)
    .map((group) => ({
      group,
      protocols: HEALTH_CAPTURE_PROTOCOLS.filter((protocol) => (
        protocol.groupId === group.groupId && includeProtocol(protocol)
      )),
    }))
    .filter((option) => option.protocols.length > 0);
}

export function getCaptureMetrics(protocol: HealthCaptureProtocol): {
  required: readonly HealthMetricDefinition[];
  optional: readonly HealthMetricDefinition[];
} {
  const derived = new Set(protocol.derivedMetricIds ?? []);
  const required = protocol.requiredMetricIds
    .filter((metricId) => !derived.has(metricId))
    .map((metricId) => getHealthMetricDefinition(metricId));
  const optional = (protocol.optionalMetricIds ?? [])
    .filter((metricId) => !derived.has(metricId))
    .map((metricId) => getHealthMetricDefinition(metricId));
  return { required, optional };
}

export function createDefaultHealthCaptureIntent(
  input: DefaultHealthCaptureIntentInput,
): HealthCaptureIntent {
  return {
    intentId: requireNonBlank(input.intentId, 'Capture intent intentId'),
    origin: input.origin,
    childId: requireNonBlank(input.childId, 'Capture intent childId'),
    groupId: input.groupId,
    metricIds: [...input.metricIds],
    captureProtocolId: input.captureProtocolId ?? null,
    mode: input.mode,
    recordedAtDefault: defaultEffectiveDate(input.todayIso, input.linkedReminder),
    source: input.source ?? sourceForMode(input.mode),
    linkedReminder: input.linkedReminder ?? null,
    dashboardTaskId: input.dashboardTaskId ?? null,
  };
}

export function buildHealthCaptureEventInput(input: HealthCaptureBuildInput): HealthCaptureEventInput {
  const protocol = selectCaptureProtocol(input.intent, input.ageMonths);
  if (protocol.storageTarget !== 'health_record_event') {
    throw new Error(
      `Capture protocol ${protocol.protocolId} requires retained_table storage and must not be saved as a health_record_event`,
    );
  }

  const childId = requireNonBlank(input.childId, 'Capture intent childId');
  const intentChildId = requireNonBlank(input.intent.childId, 'Capture intent childId');
  if (childId !== intentChildId) {
    throw new Error('Capture intent childId must match build childId');
  }
  const effectiveDate = requireIsoDate(input.intent.recordedAtDefault, 'Capture intent recordedAtDefault');
  const linkedReminder = validateLinkedReminder(input.intent, childId, input.intent.linkedReminder);
  const eventId = input.makeId();
  const event: HealthRecordEvent = {
    eventId,
    childId,
    protocolId: protocol.protocolId,
    groupId: protocol.groupId,
    recordKind: eventKindForIntent(input.intent),
    sourceSurface: sourceSurfaceForIntent(input.intent),
    recordedAt: input.nowIso,
    effectiveDate,
    ageMonths: input.ageMonths,
    recorderId: input.intent.recorderId ?? null,
    linkedReminderStateId: linkedReminder?.stateId ?? null,
    linkedReminderRuleId: linkedReminder?.ruleId ?? null,
    notes: blankToNull(input.intent.notes),
    metadataJson: JSON.stringify({
      intentId: input.intent.intentId,
      origin: input.intent.origin,
      mode: input.intent.mode,
      source: input.intent.source,
      protocolId: protocol.protocolId,
      metricIds: input.intent.metricIds,
      linkedReminderRuleId: linkedReminder?.ruleId ?? null,
      dashboardTaskId: input.intent.dashboardTaskId ?? null,
    }),
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };

  const protocolMetricIds = new Set<HealthMetricId>(protocol.metricIds);
  const derivedMetricIds = new Set<HealthMetricId>(protocol.derivedMetricIds ?? []);
  const baseValues: HealthRecordValue[] = [];

  for (const [metricId, draft] of Object.entries(input.draftValues) as Array<[HealthMetricId, HealthCaptureDraftValue | undefined]>) {
    if (!draft || blankToNull(draft.value) == null) continue;
    if (!protocolMetricIds.has(metricId)) {
      throw new Error(`Metric ${metricId} is not admitted by protocol ${protocol.protocolId}`);
    }
    if (derivedMetricIds.has(metricId)) {
      throw new Error(`Derived metric ${metricId} cannot be authored by capture input`);
    }
    const metric = metricById.get(metricId);
    if (!metric) {
      throw new Error(`Unknown health metric id: ${metricId}`);
    }
    baseValues.push(buildValueFromDraft({
      event,
      metric,
      draft,
      nowIso: input.nowIso,
      valueId: input.makeId(),
      mode: input.intent.mode,
    }));
  }

  const baseMetricIds = new Set(baseValues.map((value) => value.metricId));
  const missingRequired = protocol.requiredMetricIds.filter(
    (metricId) => !derivedMetricIds.has(metricId) && !baseMetricIds.has(metricId),
  );
  if (missingRequired.length > 0) {
    throw new Error(`Missing required health metrics: ${missingRequired.join(', ')}`);
  }
  if (baseValues.length === 0) {
    throw new Error(`Capture protocol ${protocol.protocolId} requires at least one value`);
  }

  const withDerived = recomputeDerivedHealthRecordValues([event], baseValues, {
    nowIso: input.nowIso,
    makeValueId: () => input.makeId(),
  });

  return {
    eventId: event.eventId,
    childId: event.childId,
    protocolId: protocol.protocolId,
    groupId: protocol.groupId,
    recordKind: event.recordKind,
    sourceSurface: event.sourceSurface,
    recordedAt: event.recordedAt,
    effectiveDate: event.effectiveDate,
    ageMonths: event.ageMonths,
    recorderId: event.recorderId ?? null,
    linkedReminderStateId: event.linkedReminderStateId ?? null,
    linkedReminderRuleId: event.linkedReminderRuleId ?? null,
    notes: event.notes ?? null,
    metadataJson: event.metadataJson ?? null,
    now: input.nowIso,
    values: withDerived.map(toCaptureValueInput),
  };
}

function buildValueFromDraft(input: {
  event: HealthRecordEvent;
  metric: HealthMetricDefinition;
  draft: HealthCaptureDraftValue;
  nowIso: string;
  valueId: string;
  mode: HealthCaptureLaunchMode;
}): HealthRecordValue {
  const rawValue = input.draft.value.trim();
  const parsed = parseMetricDraft(input.metric, rawValue);
  return {
    valueId: input.valueId,
    eventId: input.event.eventId,
    childId: input.event.childId,
    metricId: input.metric.metricId,
    valueNumber: parsed.valueNumber,
    valueText: parsed.valueText,
    valueJson: parsed.valueJson,
    unit: input.metric.unit ?? null,
    qualifier: input.draft.qualifier ?? null,
    recordKind: input.mode === 'ocr_confirm' ? 'parent_confirmed_import' : 'measured',
    createdAt: input.nowIso,
  };
}

function parseMetricDraft(metric: HealthMetricDefinition, rawValue: string) {
  if (metric.valueShape === 'number' || metric.valueShape === 'duration') {
    const valueNumber = Number(rawValue);
    if (!Number.isFinite(valueNumber)) {
      throw new Error(`${metric.metricId} requires a numeric value`);
    }
    return { valueNumber, valueText: null, valueJson: null };
  }
  if (metric.valueShape === 'composite') {
    JSON.parse(rawValue);
    return { valueNumber: null, valueText: null, valueJson: rawValue };
  }
  return { valueNumber: null, valueText: rawValue, valueJson: null };
}

function toCaptureValueInput(value: HealthRecordValue): HealthCaptureValueInput {
  return {
    valueId: value.valueId,
    metricId: value.metricId,
    valueNumber: value.valueNumber ?? null,
    valueText: value.valueText ?? null,
    valueJson: value.valueJson ?? null,
    unit: value.unit ?? null,
    qualifier: value.qualifier ?? null,
    recordKind: value.recordKind,
    sourceValueIds: value.sourceValueIds ?? null,
  };
}

function defaultEffectiveDate(todayIso: string, linkedReminder?: LinkedHealthRecordReminder | null) {
  return (linkedReminder?.scheduledFor ?? linkedReminder?.dueDate ?? todayIso).slice(0, 10);
}

function selectCaptureProtocol(intent: HealthCaptureIntent, ageMonths: number): HealthCaptureProtocol {
  const requestedMetricIds = normalizeMetricIds(intent.metricIds);
  if (requestedMetricIds.length === 0) {
    throw new Error('Capture intent metricIds must contain at least one metric');
  }
  for (const metricId of requestedMetricIds) {
    const metric = metricById.get(metricId);
    if (!metric) {
      throw new Error(`Unknown health metric id: ${metricId}`);
    }
    if (metric.groupId !== intent.groupId) {
      throw new Error(`Metric ${metricId} is not in capture intent group ${intent.groupId}`);
    }
  }
  if (intent.origin === 'dashboard_task') {
    requireNonBlank(intent.dashboardTaskId, 'Capture intent dashboardTaskId');
  }

  const candidates = HEALTH_CAPTURE_PROTOCOLS.filter((protocol) => {
    if (protocol.groupId !== intent.groupId) return false;
    if (!protocol.modeSupport.includes(intent.mode)) return false;
    if (!protocol.sourceSupport.includes(intent.source)) return false;
    return requestedMetricIds.every((metricId) => protocol.metricIds.includes(metricId));
  });
  const explicitProtocolId = blankToNull(intent.captureProtocolId ?? null);
  const protocols = explicitProtocolId
    ? [getHealthCaptureProtocol(explicitProtocolId)].filter((protocol) => candidates.includes(protocol))
    : candidates;

  if (protocols.length === 0) {
    throw new Error(
      `No health capture protocol admits group ${intent.groupId}, mode ${intent.mode}, source ${intent.source}, metrics ${requestedMetricIds.join(', ')}`,
    );
  }

  const selected = [...protocols].sort((left, right) => (
    protocolSelectionRank(left, intent, requestedMetricIds, ageMonths)
    - protocolSelectionRank(right, intent, requestedMetricIds, ageMonths)
  ))[0];
  if (!selected) {
    throw new Error('No health capture protocol selected after ranking');
  }
  return selected;
}

function normalizeMetricIds(metricIds: readonly HealthMetricId[]) {
  return [...new Set(metricIds.map((metricId) => metricId.trim()).filter(Boolean) as HealthMetricId[])];
}

function protocolSelectionRank(
  protocol: HealthCaptureProtocol,
  intent: HealthCaptureIntent,
  requestedMetricIds: readonly HealthMetricId[],
  ageMonths: number,
) {
  const ageRank = intent.groupId === 'growth'
    ? growthProtocolAgeRank(protocol.protocolId, requestedMetricIds, ageMonths)
    : 0;
  const requiredMisses = protocol.requiredMetricIds.filter(
    (metricId) => !(protocol.derivedMetricIds ?? []).includes(metricId) && !requestedMetricIds.includes(metricId),
  ).length;
  const coverageSlack = protocol.metricIds.length - requestedMetricIds.length;
  return ageRank * 1_000 + requiredMisses * 100 + coverageSlack;
}

function growthProtocolAgeRank(
  protocolId: HealthCaptureProtocolId,
  requestedMetricIds: readonly HealthMetricId[],
  ageMonths: number,
) {
  const preferred = requestedMetricIds.includes('growth.head_circumference')
    ? 'growth-infant-monthly'
    : ageMonths <= 36
      ? 'growth-infant-monthly'
      : ageMonths >= 84
        ? 'growth-school-biannual'
        : 'growth-child-quarterly';
  return protocolId === preferred ? 0 : 1;
}

function sourceForMode(mode: HealthCaptureLaunchMode): HealthCaptureSource {
  if (mode === 'reminder') return 'reminder';
  if (mode === 'ocr_confirm') return 'ocr';
  return 'manual';
}

function eventKindForIntent(intent: HealthCaptureIntent): HealthRecordEventKind {
  if (intent.mode === 'reminder' || intent.origin === 'reminder' || intent.source === 'reminder') return 'reminder_linked';
  if (intent.mode === 'ocr_confirm' || intent.origin === 'ocr_confirm' || intent.source === 'ocr') return 'ocr_confirmed';
  if (intent.source === 'imported') return 'imported';
  return 'manual';
}

function sourceSurfaceForIntent(intent: HealthCaptureIntent): HealthRecordEvent['sourceSurface'] {
  if (intent.mode === 'reminder' || intent.origin === 'reminder' || intent.source === 'reminder') return 'reminder';
  if (intent.mode === 'ocr_confirm' || intent.origin === 'ocr_confirm' || intent.source === 'ocr') return 'ocr_tool';
  if (intent.source === 'imported') return 'import';
  if (intent.origin === 'detail_page' || intent.origin === 'metric_row') return 'profile_detail';
  return 'profile_console';
}

function validateLinkedReminder(
  intent: HealthCaptureIntent,
  childId: string,
  linkedReminder: LinkedHealthRecordReminder | null | undefined,
): LinkedHealthRecordReminder | null {
  const requiresReminder = intent.mode === 'reminder' || intent.origin === 'reminder' || intent.source === 'reminder';
  if (!requiresReminder) {
    return linkedReminder ?? null;
  }
  if (!linkedReminder) {
    throw new Error('Reminder capture requires linkedReminder');
  }
  const reminderChildId = requireNonBlank(linkedReminder.childId, 'Reminder capture linkedReminder.childId');
  if (reminderChildId !== childId) {
    throw new Error('Reminder capture linkedReminder.childId must match capture childId');
  }
  const stateId = requireNonBlank(linkedReminder.stateId, 'Reminder capture linkedReminder.stateId');
  const ruleId = requireNonBlank(linkedReminder.ruleId, 'Reminder capture linkedReminder.ruleId');
  return {
    ...linkedReminder,
    childId: reminderChildId,
    stateId,
    ruleId,
  };
}

function requireNonBlank(value: string | null | undefined, label: string) {
  const trimmed = blankToNull(value);
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function requireIsoDate(value: string | null | undefined, label: string) {
  const trimmed = requireNonBlank(value, label);
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    throw new Error(`${label} must be an ISO 8601 date`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid ISO 8601 date`);
  }
  return trimmed;
}

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
