import { describe, expect, it } from 'vitest';
import {
  buildHealthCaptureEventInput,
  createDefaultHealthCaptureIntent,
  getHealthCaptureProtocolOptions,
  type HealthCaptureDraftValue,
  type HealthCaptureLaunchMode,
  type HealthCaptureOrigin,
  type HealthCaptureSource,
  type LinkedHealthRecordReminder,
} from './health-capture-orchestrator.js';
import type { HealthMetricGroupId, HealthMetricId } from '../../knowledge-base/index.js';

function ids() {
  let index = 0;
  return () => `id-${++index}`;
}

function intent(input: {
  childId?: string;
  groupId: HealthMetricGroupId;
  metricIds: readonly HealthMetricId[];
  mode?: HealthCaptureLaunchMode;
  origin?: HealthCaptureOrigin;
  source?: HealthCaptureSource;
  linkedReminder?: LinkedHealthRecordReminder | null;
}) {
  return createDefaultHealthCaptureIntent({
    intentId: `intent-${input.groupId}`,
    origin: input.origin ?? 'profile_add_icon',
    childId: input.childId ?? 'child-1',
    groupId: input.groupId,
    metricIds: input.metricIds,
    mode: input.mode ?? 'manual',
    source: input.source,
    linkedReminder: input.linkedReminder,
    todayIso: '2026-05-02',
  });
}

describe('health-capture-orchestrator', () => {
  it('builds a protocol-backed health record event and derived BMI value', () => {
    const captureIntent = intent({
      groupId: 'growth',
      metricIds: ['growth.height', 'growth.weight'],
    });
    const input = buildHealthCaptureEventInput({
      childId: 'child-1',
      ageMonths: 65,
      intent: captureIntent,
      draftValues: {
        'growth.height': { value: '118.2' },
        'growth.weight': { value: '22.4' },
      },
      nowIso: '2026-05-02T10:00:00.000Z',
      makeId: ids(),
    });

    expect(input.protocolId).toBe('growth-child-quarterly');
    expect(input.values.map((value) => value.metricId)).toEqual([
      'growth.height',
      'growth.weight',
      'growth.bmi',
    ]);
    expect(input.values.find((value) => value.metricId === 'growth.bmi')?.recordKind).toBe('derived');
    expect(input.values.find((value) => value.metricId === 'growth.bmi')?.sourceValueIds).toBe(
      JSON.stringify(['id-2', 'id-3']),
    );
  });

  it('rejects missing required metrics and user-authored derived metrics', () => {
    const captureIntent = intent({
      groupId: 'growth',
      metricIds: ['growth.height', 'growth.weight'],
    });

    expect(() =>
      buildHealthCaptureEventInput({
        childId: 'child-1',
        ageMonths: 65,
        intent: captureIntent,
        draftValues: { 'growth.height': { value: '118.2' } },
        nowIso: '2026-05-02T10:00:00.000Z',
        makeId: ids(),
      }),
    ).toThrow(/Missing required health metrics/);

    expect(() =>
      buildHealthCaptureEventInput({
        childId: 'child-1',
        ageMonths: 65,
        intent: captureIntent,
        draftValues: {
          'growth.height': { value: '118.2' },
          'growth.weight': { value: '22.4' },
          'growth.bmi': { value: '16.0' },
        },
        nowIso: '2026-05-02T10:00:00.000Z',
        makeId: ids(),
      }),
    ).toThrow(/Derived metric growth\.bmi cannot be authored/);
  });

  it('keeps reminder-launched capture linked without completing reminders', () => {
    const captureIntent = intent({
      groupId: 'outdoor',
      metricIds: ['outdoor.activity_minutes'],
      mode: 'reminder',
      origin: 'reminder',
      linkedReminder: {
        childId: 'child-1',
        stateId: 'state-1',
        ruleId: 'PO-REM-OUTD-002',
        scheduledFor: '2026-05-01',
      },
    });

    const input = buildHealthCaptureEventInput({
      childId: 'child-1',
      ageMonths: 65,
      intent: captureIntent,
      draftValues: { 'outdoor.activity_minutes': { value: '45' } },
      nowIso: '2026-05-02T10:00:00.000Z',
      makeId: ids(),
    });

    expect(input.recordKind).toBe('reminder_linked');
    expect(input.sourceSurface).toBe('reminder');
    expect(input.effectiveDate).toBe('2026-05-01');
    expect(input.linkedReminderStateId).toBe('state-1');
    expect(input.linkedReminderRuleId).toBe('PO-REM-OUTD-002');
  });

  it('fails closed before building a saveable event for invalid child ids', () => {
    expect(() =>
      intent({
        childId: '  ',
        groupId: 'outdoor',
        metricIds: ['outdoor.activity_minutes'],
      }),
    ).toThrow(/childId is required/);
  });

  it('fails closed when reminder mode has no concrete linked reminder rule', () => {
    const missingReminder = intent({
      groupId: 'outdoor',
      metricIds: ['outdoor.activity_minutes'],
      mode: 'reminder',
      origin: 'reminder',
    });
    const blankRuleReminder = intent({
      groupId: 'outdoor',
      metricIds: ['outdoor.activity_minutes'],
      mode: 'reminder',
      origin: 'reminder',
      linkedReminder: {
        childId: 'child-1',
        stateId: 'state-1',
        ruleId: ' ',
        scheduledFor: '2026-05-01',
      },
    });

    for (const captureIntent of [missingReminder, blankRuleReminder]) {
      expect(() =>
        buildHealthCaptureEventInput({
          childId: 'child-1',
          ageMonths: 65,
          intent: captureIntent,
          draftValues: { 'outdoor.activity_minutes': { value: '45' } },
          nowIso: '2026-05-02T10:00:00.000Z',
          makeId: ids(),
        }),
      ).toThrow(/linkedReminder|ruleId/);
    }
  });

  it('fails closed when effective date is missing or invalid', () => {
    const invalidDates = [' ', '2026-02-30', '2026/05/02'];

    for (const effectiveDate of invalidDates) {
      const captureIntent = intent({
        groupId: 'outdoor',
        metricIds: ['outdoor.activity_minutes'],
      });
      captureIntent.recordedAtDefault = effectiveDate;

      expect(() =>
        buildHealthCaptureEventInput({
          childId: 'child-1',
          ageMonths: 65,
          intent: captureIntent,
          draftValues: { 'outdoor.activity_minutes': { value: '45' } },
          nowIso: '2026-05-02T10:00:00.000Z',
          makeId: ids(),
        }),
      ).toThrow(/recordedAtDefault/);
    }
  });

  it('keeps retained-table protocols in the orchestrator protocol model', () => {
    const protocolIds = getHealthCaptureProtocolOptions()
      .flatMap((option) => option.protocols)
      .map((protocol) => protocol.protocolId);
    expect(protocolIds).toContain('growth-child-quarterly');
    expect(protocolIds).toContain('medical-event');
    expect(protocolIds).toContain('vaccine-administration');
    expect(protocolIds).toContain('milestone-achievement');
  });

  it('fails closed instead of misrouting retained-table protocols into health record events', () => {
    const captureIntent = intent({
      groupId: 'vaccine',
      metricIds: ['vaccine.administration'],
    });

    expect(() =>
      buildHealthCaptureEventInput({
        childId: 'child-1',
        ageMonths: 65,
        intent: captureIntent,
        draftValues: { 'vaccine.administration': { value: '{"ruleId":"PO-REM-VAC-001","vaccineName":"MMR"}' } },
        nowIso: '2026-05-02T10:00:00.000Z',
        makeId: ids(),
      }),
    ).toThrow(/retained_table storage/);
  });

  it('rejects metrics outside the selected protocol', () => {
    const captureIntent = intent({
      groupId: 'vision',
      metricIds: ['vision.left_visual_acuity', 'vision.right_visual_acuity'],
    });
    expect(() =>
      buildHealthCaptureEventInput({
        childId: 'child-1',
        ageMonths: 65,
        intent: captureIntent,
        draftValues: {
          'vision.left_visual_acuity': { value: '1.0' },
          'vision.right_visual_acuity': { value: '1.0' },
          ['growth.height' as HealthMetricId]: { value: '118.2' } as HealthCaptureDraftValue,
        },
        nowIso: '2026-05-02T10:00:00.000Z',
        makeId: ids(),
      }),
    ).toThrow(/not admitted by protocol/);
  });
});
