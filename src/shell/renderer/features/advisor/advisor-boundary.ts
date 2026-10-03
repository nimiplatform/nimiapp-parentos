import { NEEDS_REVIEW_DOMAINS, REVIEWED_DOMAINS, type AdvisorRecordGroupId } from '../../knowledge-base/index.js';
import { filterAIResponse } from '../../engine/ai-safety-filter.js';
import { i18nText, i18nTextForLanguage } from '../../i18n/index.js';
import { stripReasoningMarkup, type AdvisorIntent } from './advisor-intent.js';
import type { AdvisorKnowledgeEntry, AdvisorKnowledgeSelection } from './advisor-knowledge.js';

export type AdvisorPromptStrategy =
  | 'reviewed-advice'
  | 'needs-review-descriptive'
  | 'unknown-clarifier'
  | 'generic-chat';

/**
 * Code, not the model, decides the answer scope. A parse result can narrow
 * the scope but never grants knowledge a needs-review domain lacks.
 */
// @nimi-authority: rule.parentos.advs.r002
export function resolveAdvisorPromptStrategy(
  intent: AdvisorIntent,
  groups: readonly AdvisorRecordGroupId[],
  knowledge: AdvisorKnowledgeSelection,
): AdvisorPromptStrategy {
  if (intent.task === 'chat') {
    return 'generic-chat';
  }
  if (intent.task === 'clarify' || (intent.domains.length === 0 && groups.length === 0)) {
    return 'unknown-clarifier';
  }
  if (intent.task === 'overview' || intent.domains.some((domain) => NEEDS_REVIEW_DOMAINS.includes(domain))) {
    return 'needs-review-descriptive';
  }
  if (
    intent.domains.length > 0
    && intent.domains.every((domain) => REVIEWED_DOMAINS.includes(domain))
    && knowledge.entries.length > 0
  ) {
    return 'reviewed-advice';
  }
  return 'needs-review-descriptive';
}

const CITATION_PATTERN = /[[【]\s*(K\d+)\s*[\]】]/gu;
const URL_PATTERN = /https?:\/\//iu;
// Raw fact JSON or its field names must never reach a parent.
const INTERNAL_FORMAT_PATTERN = /```|\b(?:periodNote|recordsInPeriod|latestBeforePeriod|latestRecordDate|recordsAllTime|thisWeekSoFar|minutesStillToWeeklyGoal|daysLeftThisWeekIncludingToday|latestChange|no-records)\b/u;

export type AdvisorAnswerCheck =
  | { readonly ok: true; readonly body: string; readonly cited: readonly AdvisorKnowledgeEntry[] }
  | { readonly ok: false; readonly reason: 'safety' | 'citation' | 'format' | 'empty' };

/**
 * Runs once on the completed answer: banned wording, citation ids that were
 * never provided, and model-written URLs all discard the whole answer.
 */
// @nimi-authority: rule.parentos.advs.r004
export function checkAdvisorAnswer(raw: string, entries: readonly AdvisorKnowledgeEntry[]): AdvisorAnswerCheck {
  const text = stripReasoningMarkup(raw);
  if (!text) {
    return { ok: false, reason: 'empty' };
  }
  if (!filterAIResponse(text).safe) {
    return { ok: false, reason: 'safety' };
  }
  const provided = new Map(entries.map((entry) => [entry.citeId, entry]));
  const order: string[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = match[1] ?? '';
    if (!provided.has(id)) {
      return { ok: false, reason: 'citation' };
    }
    if (!order.includes(id)) order.push(id);
  }
  if (URL_PATTERN.test(text)) {
    return { ok: false, reason: 'citation' };
  }
  if (INTERNAL_FORMAT_PATTERN.test(text)) {
    return { ok: false, reason: 'format' };
  }
  const body = stripSectionBrackets(stripModelSourceLines(text.replace(CITATION_PATTERN, (_match, id: string) => `[${order.indexOf(id) + 1}]`)));
  if (!body) {
    return { ok: false, reason: 'empty' };
  }
  return {
    ok: true,
    body,
    cited: order.map((id) => provided.get(id)).filter((entry): entry is AdvisorKnowledgeEntry => Boolean(entry)),
  };
}

function footerLabels(key: 'Advisor.sources.knowledgeTitle' | 'Advisor.sources.localFactsTitle') {
  return [i18nTextForLanguage('zh', key), i18nTextForLanguage('en', key)];
}

function sourceLabelStems() {
  return [...footerLabels('Advisor.sources.knowledgeTitle'), ...footerLabels('Advisor.sources.localFactsTitle')]
    .map((label) => label.replace(/[：:]\s*$/u, '').trim())
    .filter(Boolean);
}

// A model-written attribution heading such as "来源：…" or "Sources: …".
const MODEL_SOURCE_LABEL = /^\s*(?:[-*•>]\s*)?(?:\*\*)?(?:来源|资料来源|数据来源|信息来源|参考来源|参考文献|sources?|references?)(?:\*\*)?\s*[：:]/iu;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)、]|\[\d+\])\s*\S/u;

/**
 * Source lines are rendered by the app from provided entries and read
 * records only; a model-written "based on …" or "来源：…" line is removed
 * rather than shown, and a bare source heading takes its list with it.
 */
function stripModelSourceLines(text: string): string {
  const stems = sourceLabelStems();
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    let cut = MODEL_SOURCE_LABEL.test(line) ? 0 : -1;
    for (const stem of stems) {
      const match = new RegExp(`${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]`, 'u').exec(line);
      if (match && (cut < 0 || match.index < cut)) cut = match.index;
    }
    if (cut < 0) {
      kept.push(line);
      continue;
    }
    const head = line.slice(0, cut).replace(/[\s*>•-]+$/u, '');
    const rest = line.slice(cut).replace(/^[^：:]*[：:]/u, '').replace(/\*\*/g, '').trim();
    if (!head.trim() && !rest) {
      while (index + 1 < lines.length && LIST_ITEM.test(lines[index + 1] ?? '')) index += 1;
    }
    if (head.trim()) kept.push(head);
  }
  return kept
    .filter((line, index, all) => line.trim() !== '' || (index > 0 && all[index - 1]?.trim() !== ''))
    .join('\n')
    .trim();
}

const SECTION_TITLE_KEYS = [
  'Advisor.answerPrompt.factsTitle',
  'Advisor.answerPrompt.coverageTitle',
  'Advisor.answerPrompt.knowledgeTitle',
  'Advisor.answerPrompt.childTitle',
] as const;

/** An echoed instruction heading such as 【可用资料】 loses its brackets. */
function stripSectionBrackets(text: string): string {
  let out = text;
  for (const key of SECTION_TITLE_KEYS) {
    for (const language of ['zh', 'en']) {
      const bracketed = /^(【[^】]+】|\[[^\]]+\])/u.exec(i18nTextForLanguage(language, key))?.[1];
      if (bracketed) out = out.split(bracketed).join(bracketed.slice(1, -1));
    }
  }
  return out;
}

/** True for the persisted source block appended under an answer. */
export function isAdvisorSourceBlock(block: string): boolean {
  const labels = [...footerLabels('Advisor.sources.knowledgeTitle'), ...footerLabels('Advisor.sources.localFactsTitle')];
  return labels.some((label) => block.startsWith(label));
}

/** An earlier answer without its app-rendered source block, for model history. */
export function stripAdvisorSourceBlocks(content: string): string {
  return content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .filter((block) => !isAdvisorSourceBlock(block.trim()))
    .join('\n\n')
    .trim();
}

/**
 * The persisted assistant content: the checked answer plus a source block
 * built only from provided entries' own titles and provenance, or from the
 * local record categories and dates the answer was given.
 */
// @nimi-authority: rule.parentos.advs.r005
export function renderAdvisorAnswerContent(input: {
  body: string;
  cited: readonly AdvisorKnowledgeEntry[];
  localFactSources: string | null;
}): string {
  if (input.cited.length > 0) {
    const lines = input.cited.map((entry, index) => i18nText('Advisor.sources.knowledgeLine', {
      n: index + 1,
      title: entry.title,
      citation: entry.citation,
    }));
    return `${input.body}\n\n${i18nText('Advisor.sources.knowledgeTitle')}\n${lines.join('\n')}`;
  }
  if (input.localFactSources) {
    return `${input.body}\n\n${i18nText('Advisor.sources.localFactsTitle')}${input.localFactSources}`;
  }
  return input.body;
}
