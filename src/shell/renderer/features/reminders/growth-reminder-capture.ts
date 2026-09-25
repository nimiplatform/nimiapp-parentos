import { saveHealthRecordCapture } from '../../bridge/sqlite-bridge.js';
import { computeAgeMonthsAt } from '../../app-shell/app-store.js';
import {
  completeRecordDataReminderWithProof,
  ensureReminderStateRow,
} from '../../engine/reminder-actions.js';
import {
  HEALTH_REMINDER_CAPTURE_TARGETS,
  type HealthMetricId,
  type HealthReminderCaptureTarget,
} from '../../knowledge-base/index.js';
import {
  buildHealthCaptureEventInput,
  createDefaultHealthCaptureIntent,
  type HealthCaptureDraftValue,
  type HealthCaptureEventInput,
  type LinkedHealthRecordReminder,
} from '../profile/health-capture-orchestrator.js';
import { isGrowthRecordReminderRuleId } from './reminder-activity.js';

const targetByRuleId = new Map(HEALTH_REMINDER_CAPTURE_TARGETS.map((target) => [target.ruleId as string, target]));

export function growthReminderCaptureTarget(ruleId: string): HealthReminderCaptureTarget | null {
  if (!isGrowthRecordReminderRuleId(ruleId)) return null;
  return targetByRuleId.get(ruleId) ?? null;
}

/** True when every metric the reminder's capture target asks for has a value. */
export function growthCaptureCoversTarget(
  target: HealthReminderCaptureTarget,
  values: Partial<Record<HealthMetricId, number | null>>,
): boolean {
  return target.targetMetricIds.every((metricId) => typeof values[metricId] === 'number' && Number.isFinite(values[metricId]));
}

/**
 * The completion policy of a growth capture target, evaluated on the event
 * that was persisted: one event of the target child, linked to the reminder
 * rule, holds a measured value for every target metric.
 */
export function growthEventSatisfiesTarget(
  target: HealthReminderCaptureTarget,
  childId: string,
  event: Pick<HealthCaptureEventInput, 'childId' | 'linkedReminderRuleId' | 'values'>,
): boolean {
  if (event.childId !== childId || event.linkedReminderRuleId !== target.ruleId) return false;
  return target.targetMetricIds.every((metricId) => event.values.some((value) => (
    value.metricId === metricId && value.recordKind === 'measured' && typeof value.valueNumber === 'number'
  )));
}

// @nimi-authority: rule.parentos.remi.r013
/**
 * Saves a reminder-linked growth capture as one event of the reminder's
 * capture protocol through the capture orchestrator, then completes the round
 * only after the persisted event proves the target. Failure at any step leaves
 * the reminder open and is reported to the caller.
 */
export async function saveGrowthReminderCapture(input: {
  readonly childId: string;
  readonly birthDate: string;
  readonly linkedReminder: LinkedHealthRecordReminder;
  readonly effectiveDate: string;
  readonly notes: string | null;
  readonly values: Partial<Record<HealthMetricId, number | null>>;
  readonly now: string;
  readonly makeId: () => string;
}): Promise<{ readonly eventId: string }> {
  const target = growthReminderCaptureTarget(input.linkedReminder.ruleId);
  if (!target) throw new Error(`Reminder ${input.linkedReminder.ruleId} is not a growth record reminder`);
  const repeatIndex = input.linkedReminder.repeatIndex ?? 0;
  const state = await ensureReminderStateRow({
    childId: input.childId,
    ruleId: target.ruleId,
    repeatIndex,
    kind: 'task',
    now: input.now,
  });
  const draftValues: Partial<Record<HealthMetricId, HealthCaptureDraftValue>> = {};
  for (const metricId of target.targetMetricIds) {
    const value = input.values[metricId];
    if (typeof value === 'number') draftValues[metricId] = { value: String(value) };
  }
  const intent = {
    ...createDefaultHealthCaptureIntent({
      intentId: input.makeId(),
      origin: 'reminder',
      childId: input.childId,
      groupId: 'growth',
      metricIds: target.targetMetricIds,
      mode: 'reminder',
      todayIso: input.effectiveDate,
      source: 'reminder',
      captureProtocolId: target.captureProtocolId,
      linkedReminder: { ...input.linkedReminder, childId: input.childId, stateId: state.stateId, repeatIndex },
    }),
    recordedAtDefault: input.effectiveDate,
    notes: input.notes,
  };
  const event = buildHealthCaptureEventInput({
    childId: input.childId,
    ageMonths: computeAgeMonthsAt(input.birthDate, input.effectiveDate),
    intent,
    draftValues,
    nowIso: input.now,
    makeId: input.makeId,
  });
  const saved = await saveHealthRecordCapture(event);
  const persisted = saved.eventId === event.eventId && saved.persistedValueCount === event.values.length;
  await completeRecordDataReminderWithProof({
    childId: input.childId,
    ruleId: target.ruleId,
    repeatIndex,
    state,
    proof: { eventId: saved.eventId, satisfiesTarget: persisted && growthEventSatisfiesTarget(target, input.childId, event) },
    now: input.now,
  });
  return { eventId: saved.eventId };
}
