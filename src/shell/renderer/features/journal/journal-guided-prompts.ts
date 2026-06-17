import {
  JOURNAL_GUIDED_PROMPTS,
  JOURNAL_GUIDED_PROMPT_FALLBACK,
} from '../../knowledge-base/index.js';

/**
 * Guided prompts for journal entries triggered from stage focus reminders.
 *
 * When a user clicks the record action from a reminder, the journal shows topic-specific
 * guided questions instead of the generic prompt. The answers become structured
 * observation data stored in the `guidedAnswers` field.
 *
 * Map: ruleId → guided questions (2-3 per rule).
 */

const RULE_PROMPTS = new Map(JOURNAL_GUIDED_PROMPTS.map((row) => [row.ruleId, row.prompts]));

export interface GuidedPromptContext {
  title: string;
  description: string;
  prompts: string[];
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

/**
 * Look up guided prompts for a reminder rule.
 * Returns null if no rule found or no prompts available.
 */
export function getGuidedPrompts(
  ruleId: string,
  rules: readonly { ruleId: string; title: string; description: string; actionType: string }[],
): GuidedPromptContext | null {
  const rule = rules.find((r) => r.ruleId === ruleId);
  if (!rule) return null;
  if (!['observe', 'read_guide', 'ai_consult'].includes(rule.actionType)) return null;

  const prompts = RULE_PROMPTS.get(ruleId);
  if (prompts) {
    return {
      title: rule.title,
      description: rule.description,
      prompts: [...prompts],
    };
  }

  return {
    title: rule.title,
    description: rule.description,
    prompts: [
      interpolate(JOURNAL_GUIDED_PROMPT_FALLBACK.observedChangeTemplate, { title: rule.title }),
      JOURNAL_GUIDED_PROMPT_FALLBACK.responseEffect,
    ],
  };
}
