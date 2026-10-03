import { REVIEWED_DOMAINS, type AdvisorClassifierDomain } from '../../knowledge-base/index.js';
import {
  runParentosTextGenerate,
} from '../settings/parentos-ai-runtime.js';
import type { AdvisorFacts } from './advisor-context.js';
import { selectAdvisorKnowledge } from './advisor-knowledge.js';
import { i18nText, i18nTextForLanguage } from '../../i18n/index.js';

export type AdvisorSuggestion = {
  id: string;
  question: string;
};

const MIN_COUNT = 2;
const MAX_COUNT = 4;
const MIN_LEN = 4;
const MAX_LEN = 24;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hardBanPattern() {
  const terms = [i18nTextForLanguage('en', 'Advisor.suggestionPrompt.hardBanTerms'), i18nTextForLanguage('zh', 'Advisor.suggestionPrompt.hardBanTerms')]
    .join('|')
    .split('|')
    .map((term) => term.trim())
    .filter(Boolean)
    .map(escapeRegExp);
  return new RegExp(terms.join('|'), 'iu');
}

/**
 * What a starter question may lean on: record categories with recent rows,
 * and topics that have admitted material for this age. Nothing else.
 */
export function buildAdvisorSuggestionGrounding(facts: AdvisorFacts, ageMonths: number) {
  const recordedCategories = facts.groups
    .filter((group) => group.status === 'ok' && group.inPeriodCount > 0)
    .map((group) => ({ category: group.label, recordsInPeriod: group.inPeriodCount, latestRecordDate: group.latestRecordDate }));
  const knowledge = selectAdvisorKnowledge({ domains: REVIEWED_DOMAINS as AdvisorClassifierDomain[], ageMonths });
  const knowledgeTopics = knowledge.coverage
    .filter((entry) => entry.coverage === 'provided')
    .map((entry) => ({
      topic: i18nText(`Advisor.domain.${entry.domain}`),
      items: knowledge.entries.filter((item) => item.domain === entry.domain).map((item) => item.title),
    }));
  return { ageMonths, period: { start: facts.period.start, end: facts.period.end }, recordedCategories, knowledgeTopics };
}

function buildSystemPrompt() {
  return [
    i18nText('Advisor.suggestionPrompt.systemRole'),
    i18nText('Advisor.suggestionPrompt.systemTask', { minCount: MIN_COUNT, maxCount: MAX_COUNT }),
    '',
    i18nText('Advisor.suggestionPrompt.requirementsTitle'),
    i18nText('Advisor.suggestionPrompt.firstPerson', { minLen: MIN_LEN, maxLen: MAX_LEN }),
    i18nText('Advisor.suggestionPrompt.noRepeatSnapshot'),
    i18nText('Advisor.suggestionPrompt.grounding'),
    i18nText('Advisor.suggestionPrompt.safetyBoundary'),
    i18nText('Advisor.suggestionPrompt.jsonOnly'),
  ].join('\n');
}

function buildUserPrompt(grounding: ReturnType<typeof buildAdvisorSuggestionGrounding>) {
  return [
    i18nText('Advisor.suggestionPrompt.snapshotTitle'),
    JSON.stringify(grounding),
    '',
    i18nText('Advisor.suggestionPrompt.outputCount', { minCount: MIN_COUNT, maxCount: MAX_COUNT }),
  ].join('\n');
}

function stripCodeFence(text: string) {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractJsonArray(text: string): unknown {
  const stripped = stripCodeFence(text);
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start < 0 || end <= start) {
    throw new Error('suggestion output missing JSON array');
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

function extractStringsFallback(text: string): string[] {
  const matches = text.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
  if (!matches) return [];
  return matches
    .map((m) => m.slice(1, -1))
    .filter((s) => /[？?]\s*$/.test(s));
}

function normalizeQuestion(raw: string): string | null {
  const cleaned = raw.trim().replace(/^[-•\d.、\s]+/, '').replace(/[？?。.！!\s]+$/u, '').trim();
  if (cleaned.length < MIN_LEN || cleaned.length > MAX_LEN) return null;
  const q = `${cleaned}${/[㐀-鿿]/u.test(cleaned) ? '？' : '?'}`;
  if (hardBanPattern().test(q)) return null;
  return q;
}

export async function generateAdvisorSuggestions(
  facts: AdvisorFacts,
  options: { ageMonths: number; signal?: AbortSignal },
): Promise<AdvisorSuggestion[]> {
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  const grounding = buildAdvisorSuggestionGrounding(facts, options.ageMonths);
  // Without recent records or admitted material there is nothing answerable
  // to suggest; no invented starters.
  if (grounding.recordedCategories.length === 0 && grounding.knowledgeTopics.length === 0) {
    return [];
  }

  const generated = await runParentosTextGenerate({
    surfaceId: 'parentos.advisor',
    messages: [
      { role: 'system', content: [{ type: 'text', text: buildSystemPrompt() }] },
      { role: 'user', content: [{ type: 'text', text: buildUserPrompt(grounding) }] },
    ],
    defaults: {
      temperature: 0.7,
      maxTokens: 1024,
    },
    signal: options.signal,
  });
  if (!generated.ok) {
    throw generated.error.cause || new Error(generated.error.message);
  }
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const rawText = generated.text;
  let rawItems: string[] = [];
  try {
    const parsed = extractJsonArray(rawText);
    if (Array.isArray(parsed)) {
      rawItems = parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    rawItems = [];
  }
  if (rawItems.length === 0) {
    rawItems = extractStringsFallback(rawText);
  }

  const questions = rawItems
    .map(normalizeQuestion)
    .filter((item): item is string => item !== null);

  const deduped = Array.from(new Set(questions)).slice(0, MAX_COUNT);
  // Grounding can be narrow (one recorded category); a single grounded starter
  // beats padding the list with ungrounded ones.
  if (deduped.length === 0) {
    throw new Error('no suggestions left after filter');
  }

  return deduped.map((question, index) => ({
    id: `ai-${index}`,
    question,
  }));
}
