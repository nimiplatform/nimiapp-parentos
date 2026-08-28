import { describe, expect, it } from 'vitest';

import {
  fitnessAgeTier,
  fitnessStandardTier,
  resolveFitnessStandardBand,
  resolveFitnessStandardBandForAge,
  resolveFitnessStandardThresholds,
} from './fitness-standard-grade.js';
import {
  buildHealthRecordSnapshot,
  type HealthRecordEvent,
  type HealthRecordValue,
} from './health-record-domain.js';

describe('fitness-standard-grade tier resolution', () => {
  it('maps age months to admitted school-stage tiers', () => {
    expect(fitnessAgeTier(53)).toBe('preschool');
    expect(fitnessAgeTier(71)).toBe('preschool');
    expect(fitnessAgeTier(72)).toBe('grade12');
    expect(fitnessAgeTier(95)).toBe('grade12');
    expect(fitnessAgeTier(96)).toBe('grade34');
    expect(fitnessAgeTier(120)).toBe('grade56');
    expect(fitnessAgeTier(143)).toBe('grade56');
    expect(fitnessAgeTier(144)).toBe('grade7plus');
    expect(fitnessAgeTier(216)).toBe('grade7plus');
  });

  it('resolves no standard tier for preschool ages', () => {
    expect(fitnessStandardTier(53)).toBeNull();
    expect(fitnessStandardTier(96)).toBe('grade34');
  });
});

describe('fitness-standard-grade band resolution', () => {
  it('grades lower_better timed runs against 初一 thresholds', () => {
    // 初一女生 800米: pass 295 / good 245 / excellent 229 (seconds)
    const base = { metricId: 'fitness.run_800m', tier: 'grade7plus' as const, sex: 'female' as const };
    expect(resolveFitnessStandardBand({ ...base, value: 222 })).toBe('excellent');
    expect(resolveFitnessStandardBand({ ...base, value: 229 })).toBe('excellent');
    expect(resolveFitnessStandardBand({ ...base, value: 230 })).toBe('good');
    expect(resolveFitnessStandardBand({ ...base, value: 245 })).toBe('good');
    expect(resolveFitnessStandardBand({ ...base, value: 246 })).toBe('pass');
    expect(resolveFitnessStandardBand({ ...base, value: 295 })).toBe('pass');
    expect(resolveFitnessStandardBand({ ...base, value: 296 })).toBe('below_pass');
  });

  it('grades higher_better metrics against 一年级 thresholds', () => {
    // 一年级男生 跳绳: pass 17 / good 87 / excellent 99
    const base = { metricId: 'fitness.rope_skipping', tier: 'grade12' as const, sex: 'male' as const };
    expect(resolveFitnessStandardBand({ ...base, value: 99 })).toBe('excellent');
    expect(resolveFitnessStandardBand({ ...base, value: 90 })).toBe('good');
    expect(resolveFitnessStandardBand({ ...base, value: 17 })).toBe('pass');
    expect(resolveFitnessStandardBand({ ...base, value: 16 })).toBe('below_pass');
  });

  it('returns null when the metric or stage has no admitted table', () => {
    expect(
      resolveFitnessStandardThresholds({ metricId: 'fitness.run_10m_shuttle', tier: 'grade12', sex: 'male' }),
    ).toBeNull();
    expect(
      resolveFitnessStandardThresholds({ metricId: 'fitness.pull_ups', tier: 'grade12', sex: 'female' }),
    ).toBeNull();
    expect(
      resolveFitnessStandardBandForAge({ metricId: 'fitness.run_50m', value: 9, ageMonths: 53, sex: 'male' }),
    ).toBeNull();
  });
});

describe('fitness.standard-grade policy evaluation in snapshots', () => {
  const event = (overrides: Partial<HealthRecordEvent>): HealthRecordEvent => ({
    eventId: 'evt-fit-1',
    childId: 'child-1',
    protocolId: 'fitness-school-assessment',
    groupId: 'fitness',
    recordKind: 'manual',
    sourceSurface: 'profile_detail',
    recordedAt: '2026-08-20T09:00:00.000Z',
    effectiveDate: '2026-08-20',
    ageMonths: 159,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  });
  const value = (overrides: Partial<HealthRecordValue> & Pick<HealthRecordValue, 'valueId' | 'metricId'>): HealthRecordValue => ({
    eventId: 'evt-fit-1',
    childId: 'child-1',
    recordKind: 'measured',
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  });

  function evaluationFor(metricId: string, events: HealthRecordEvent[], values: HealthRecordValue[], sex?: 'male' | 'female', ageMonths = 159) {
    const snapshot = buildHealthRecordSnapshot({
      childId: 'child-1',
      ageMonths,
      events,
      values,
      nowIso: '2026-08-28T00:00:00.000Z',
      sex,
    });
    const fitness = snapshot.groups.find((group) => group.group.groupId === 'fitness');
    return fitness?.metrics.find((item) => item.metric.metricId === metricId)?.evaluation;
  }

  it('marks values meeting the pass line as on_track with the resolved band', () => {
    const evaluation = evaluationFor(
      'fitness.run_800m',
      [event({})],
      [value({ valueId: 'v-1', metricId: 'fitness.run_800m', valueNumber: 222, unit: 's' })],
      'female',
    );
    expect(evaluation?.status).toBe('on_track');
    expect(evaluation?.statusReasonCode).toBe('meets_standard_pass_threshold');
    expect(evaluation?.inputs).toMatchObject({ band: 'excellent', tier: 'grade7plus', sex: 'female' });
  });

  it('marks values below the pass line as watch', () => {
    const evaluation = evaluationFor(
      'fitness.run_800m',
      [event({})],
      [value({ valueId: 'v-1', metricId: 'fitness.run_800m', valueNumber: 320, unit: 's' })],
      'female',
    );
    expect(evaluation?.status).toBe('watch');
    expect(evaluation?.statusReasonCode).toBe('below_standard_pass_threshold');
    expect(evaluation?.inputs).toMatchObject({ band: 'below_pass' });
  });

  it('stays unrated for metrics without an admitted table for the stage', () => {
    const evaluation = evaluationFor(
      'fitness.run_10m_shuttle',
      [event({ ageMonths: 53 })],
      [value({ valueId: 'v-1', metricId: 'fitness.run_10m_shuttle', valueNumber: 8.4, unit: 's' })],
      'female',
      53,
    );
    expect(evaluation?.status).toBe('unrated');
    expect(evaluation?.statusReasonCode).toBe('standard_table_not_available_for_stage');
  });

  it('stays unrated for enum metrics like foot arch status', () => {
    const evaluation = evaluationFor(
      'fitness.foot_arch_status',
      [event({})],
      [value({ valueId: 'v-1', metricId: 'fitness.foot_arch_status', valueText: 'normal' })],
      'female',
    );
    expect(evaluation?.status).toBe('unrated');
    expect(evaluation?.statusReasonCode).toBe('numeric_value_required');
  });

  it('stays unrated when the child sex is unavailable', () => {
    const evaluation = evaluationFor(
      'fitness.run_800m',
      [event({})],
      [value({ valueId: 'v-1', metricId: 'fitness.run_800m', valueNumber: 222, unit: 's' })],
    );
    expect(evaluation?.status).toBe('unrated');
    expect(evaluation?.statusReasonCode).toBe('sex_required');
  });
});
