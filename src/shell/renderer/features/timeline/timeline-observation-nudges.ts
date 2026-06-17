import type { ObservationDimension } from '../../knowledge-base/gen/observation-framework.gen.js';
import {
  OBSERVATION_NUDGE_COPY,
  OBSERVATION_NUDGE_FALLBACK,
} from '../../knowledge-base/index.js';
import { computeRecommendedPrompts, type GapAnalysisEntry } from '../journal/journal-recommended-prompts.js';

export interface ObservationNudge {
  dimensionId: string;
  displayName: string;
  nudgeText: string;
  parentQuestion: string;
}

const NUDGE_COPY_BY_DIMENSION = new Map(OBSERVATION_NUDGE_COPY.map((row) => [row.dimensionId, row.variants]));

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

/**
 * Pick a nudge text for a given dimensionId.
 * Uses a day-based index so it rotates naturally without randomness.
 */
function pickNudgeText(dimensionId: string, displayName: string): string {
  const variants = NUDGE_COPY_BY_DIMENSION.get(dimensionId);
  if (!variants || variants.length === 0) {
    return interpolate(OBSERVATION_NUDGE_FALLBACK.template, { displayName });
  }
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return variants[dayIndex % variants.length] ?? interpolate(OBSERVATION_NUDGE_FALLBACK.template, { displayName });
}

/**
 * Compute soft observation nudges for the timeline sidebar.
 *
 * Selects the least-observed dimensions (with 0 entries in the window)
 * and wraps them in warm, non-pressuring copy.
 */
export function computeObservationNudges(
  activeDimensions: readonly ObservationDimension[],
  journalEntries: readonly GapAnalysisEntry[],
  options?: { maxNudges?: number; windowDays?: number },
): ObservationNudge[] {
  const maxNudges = options?.maxNudges ?? 2;
  const windowDays = options?.windowDays ?? 14;

  const prompts = computeRecommendedPrompts(activeDimensions, journalEntries, {
    maxPrompts: maxNudges,
    windowDays,
  });

  // Only nudge dimensions with zero entries — keep it soft
  return prompts
    .filter((p) => p.entryCountLast14d === 0)
    .map((p) => ({
      dimensionId: p.dimensionId,
      displayName: p.displayName,
      nudgeText: pickNudgeText(p.dimensionId, p.displayName),
      parentQuestion: p.parentQuestion,
    }));
}
