// @nimi-authority: definition.parentos.structured.fitness.standard.tables
// @nimi-authority: rule.parentos.structured.fitness.standard.tables.binding
import {
  FITNESS_STANDARD_TABLES,
  type FitnessStandardBand,
  type FitnessStandardMetricThresholds,
  type FitnessStandardTier,
  type HealthMetricId,
} from '../knowledge-base/index.js';

export type { FitnessStandardBand, FitnessStandardMetricThresholds, FitnessStandardTier };

/** Admitted school-stage tiers, including the ungraded preschool band. */
export type FitnessAgeTier = 'preschool' | FitnessStandardTier;

/**
 * Single source of truth for school-stage tier resolution. Boundaries are
 * birth-month approximations of school grades: <6y preschool, 6-8y grade 1-2,
 * 8-10y grade 3-4, 10-12y grade 5-6, ≥12y grade 7+.
 */
export function fitnessAgeTier(ageMonths: number): FitnessAgeTier {
  if (ageMonths < 72) return 'preschool';
  if (ageMonths < 96) return 'grade12';
  if (ageMonths < 120) return 'grade34';
  if (ageMonths < 144) return 'grade56';
  return 'grade7plus';
}

/** Tier usable for standard grading; preschool has no national-standard table. */
export function fitnessStandardTier(ageMonths: number): FitnessStandardTier | null {
  const tier = fitnessAgeTier(ageMonths);
  return tier === 'preschool' ? null : tier;
}

export function resolveFitnessStandardThresholds(input: {
  metricId: string;
  tier: FitnessStandardTier;
  sex: 'male' | 'female';
}): FitnessStandardMetricThresholds | null {
  const table = FITNESS_STANDARD_TABLES.find(
    (row) => row.tier === input.tier && row.sex === input.sex,
  );
  const entry = table?.metrics.find((metric) => metric.metricId === input.metricId);
  return entry ?? null;
}

/**
 * Grade a recorded value against the admitted national-standard thresholds.
 * Returns null when the metric/tier/sex does not resolve to an admitted table
 * (preschool metrics, foot arch status, unknown ids) — callers map that to
 * `unrated` or simply render no badge.
 */
export function resolveFitnessStandardBand(input: {
  metricId: string;
  value: number;
  tier: FitnessStandardTier;
  sex: 'male' | 'female';
}): FitnessStandardBand | null {
  const thresholds = resolveFitnessStandardThresholds(input);
  if (!thresholds) return null;
  const { value } = input;
  if (thresholds.direction === 'lower_better') {
    if (value <= thresholds.excellent) return 'excellent';
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.pass) return 'pass';
    return 'below_pass';
  }
  if (value >= thresholds.excellent) return 'excellent';
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.pass) return 'pass';
  return 'below_pass';
}

/** Convenience: resolve a band straight from ageMonths instead of a tier. */
export function resolveFitnessStandardBandForAge(input: {
  metricId: HealthMetricId | string;
  value: number;
  ageMonths: number;
  sex: 'male' | 'female';
}): FitnessStandardBand | null {
  const tier = fitnessStandardTier(input.ageMonths);
  if (!tier) return null;
  return resolveFitnessStandardBand({ metricId: input.metricId, value: input.value, tier, sex: input.sex });
}
