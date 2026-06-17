import { i18nText } from '../../i18n/index.js';

export interface ExperimentTemplate {
  dimensionId: string;
  title: string;
}

/**
 * Static micro-experiment templates per observation dimension.
 * Each experiment is a short, actionable, time-bounded suggestion
 * that parents can try and then observe the result.
 *
 * Covered dimensions: the 8 most commonly used across all age ranges.
 * No AI dependency — works fully offline.
 */
const EXPERIMENT_TEMPLATE_COUNTS: Record<string, number> = {
  'PO-OBS-CONC-001': 4,
  'PO-OBS-EMOT-001': 4,
  'PO-OBS-SOCL-001': 4,
  'PO-OBS-CHOI-001': 4,
  'PO-OBS-INDP-001': 4,
  'PO-OBS-RELQ-001': 5,
  'PO-OBS-ATTC-001': 4,
  'PO-OBS-EXEC-001': 4,
};

/**
 * Pick one experiment suggestion for the given dimension.
 * Returns null if the dimension is not covered or dimensionId is null.
 */
export function getExperimentSuggestion(
  dimensionId: string | null,
): ExperimentTemplate | null {
  if (!dimensionId) return null;
  const templateCount = EXPERIMENT_TEMPLATE_COUNTS[dimensionId];
  if (!templateCount) return null;
  const index = Math.floor(Math.random() * templateCount);
  return { dimensionId, title: i18nText(`Journal.experimentTemplate.${dimensionId}.${index}`) };
}
