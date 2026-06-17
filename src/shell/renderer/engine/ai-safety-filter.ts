/**
 * Deterministic client-side safety filter for ParentOS AI output.
 *
 * Fail-close: if a response contains banned diagnostic, medication, or anxiety
 * wording, discard the original text and show the structured fallback instead.
 */

import {
  AI_BOUNDARY_BANNED_TERM_RULES,
  AI_BOUNDARY_FALLBACK_MESSAGE,
} from '../knowledge-base/index.js';

interface BannedTermRule {
  label: string;
  pattern: RegExp;
}

const BANNED_TERM_RULES: readonly BannedTermRule[] = AI_BOUNDARY_BANNED_TERM_RULES.map((rule) => ({
  label: rule.label,
  pattern: new RegExp(rule.pattern, rule.flags),
}));

export const BANNED_TERMS: readonly string[] = BANNED_TERM_RULES.map((rule) => rule.label);

function findTriggeredRule(text: string) {
  return BANNED_TERM_RULES.find((rule) => rule.pattern.test(text)) ?? null;
}

export function containsBannedTerm(text: string): boolean {
  return findTriggeredRule(text) !== null;
}

export interface SafetyFilterResult {
  safe: boolean;
  filtered: string;
  triggeredTerm: string | null;
}

export function filterAIResponse(text: string): SafetyFilterResult {
  const triggeredRule = findTriggeredRule(text);
  if (triggeredRule) {
    return { safe: false, filtered: AI_BOUNDARY_FALLBACK_MESSAGE, triggeredTerm: triggeredRule.label };
  }

  return { safe: true, filtered: text, triggeredTerm: null };
}
