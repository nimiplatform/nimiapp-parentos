import { ADVISOR_DOMAIN_DEFINITIONS, NURTURE_MODES } from '../../knowledge-base/index.js';
import { formatAge } from '../../app-shell/app-store.js';
import { i18nText } from '../../i18n/index.js';
import type { ParentosTextTurnMessage } from '../settings/parentos-ai-text-turn.js';
import type { AdvisorPromptStrategy } from './advisor-boundary.js';
import {
  fitAdvisorFactsToBudget,
  modelFacingFacts,
  summarizeAdvisorFacts,
  type AdvisorChildContext,
  type AdvisorFacts,
  type AdvisorRecordGroupId,
} from './advisor-context.js';
import type { AdvisorHistoryTurn, AdvisorIntent } from './advisor-intent.js';
import type { AdvisorDomainCoverage, AdvisorKnowledgeSelection } from './advisor-knowledge.js';

/** App-side conservative starting budgets; not Nimi token or runtime limits. */
export const ADVISOR_ANSWER_BUDGET = { maxMessageBytes: 16 * 1024, maxPromptBytes: 24 * 1024 } as const;
export const ADVISOR_INTENT_BUDGET = { maxMessageBytes: 16 * 1024, maxPromptBytes: 16 * 1024 } as const;
export const ADVISOR_MAX_QUESTION_BYTES = 8 * 1024;
export const ADVISOR_MAX_HISTORY_TURNS = 6;
// Full views shrink by listed detail; the compact view (statuses plus the
// checklist's code-computed lines) is the last step. An overview goes straight
// to compact: its checklist already carries every category's key values.
type FactsLevel = { readonly view: 'full'; readonly budget: number } | { readonly view: 'compact' };
const FULL_LEVELS: readonly FactsLevel[] = [
  { view: 'full', budget: 9 * 1024 },
  { view: 'full', budget: 6 * 1024 },
  { view: 'full', budget: 4 * 1024 },
  { view: 'compact' },
];
const OVERVIEW_LEVELS: readonly FactsLevel[] = [{ view: 'compact' }];

function hasChecklist(strategy: AdvisorPromptStrategy) {
  return strategy !== 'generic-chat' && strategy !== 'unknown-clarifier';
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function strategyScope(strategy: AdvisorPromptStrategy, intent: AdvisorIntent): string[] {
  switch (strategy) {
    case 'reviewed-advice':
      return [i18nText('Advisor.answerPrompt.scope.reviewedAdvice')];
    case 'needs-review-descriptive':
      return intent.task === 'overview'
        ? [i18nText('Advisor.answerPrompt.scope.descriptive'), i18nText('Advisor.answerPrompt.scope.overview')]
        : [i18nText('Advisor.answerPrompt.scope.descriptive')];
    case 'unknown-clarifier':
      return [i18nText('Advisor.answerPrompt.scope.clarifier')];
    case 'generic-chat':
    default:
      return [i18nText('Advisor.answerPrompt.scope.chat')];
  }
}

function uncoveredReasons(entry: AdvisorDomainCoverage, ageMonths: number): string[] {
  const reasons: string[] = [];
  if (entry.coverage === 'no-age-match') {
    reasons.push(i18nText('Advisor.answerPrompt.uncovered.noAgeMatch', {
      startYears: Math.floor((entry.materialAgeMonths?.start ?? 0) / 12),
      endYears: Math.ceil((entry.materialAgeMonths?.end ?? 0) / 12),
      ageYears: Math.floor(ageMonths / 12),
    }));
  } else if (entry.coverage === 'needs-review') {
    reasons.push(i18nText('Advisor.answerPrompt.uncovered.needsReview'));
  } else {
    reasons.push(i18nText('Advisor.answerPrompt.uncovered.noMaterial'));
  }
  const recordGroups = ADVISOR_DOMAIN_DEFINITIONS.find((definition) => definition.domain === entry.domain)?.recordGroups ?? [];
  if (recordGroups.length === 0) {
    reasons.push(i18nText('Advisor.answerPrompt.uncovered.noRecordCategory'));
  }
  return reasons;
}

/**
 * Code-built list of every area the parent named (or, for an overview, every
 * category) with its key fact or coverage reason. It makes the answer cover
 * each part; the model still words the answer itself.
 */
function coverageChecklist(input: {
  intent: AdvisorIntent;
  facts: AdvisorFacts | null;
  knowledge: AdvisorKnowledgeSelection;
  ageMonths: number;
}): string[] {
  const { intent, facts, knowledge } = input;
  const separator = i18nText('Advisor.facts.partSeparator');
  const summaries = new Map(facts ? summarizeAdvisorFacts(facts).map((entry) => [entry.group, entry.lines]) : []);
  const groupState = (group: AdvisorRecordGroupId) => (summaries.get(group) ?? []).join(separator);
  const items: string[] = [];

  if (intent.task === 'overview' && facts) {
    // The period's records are itemized; older-only categories get one line
    // with their latest date, so old detail cannot crowd out the recent ones.
    const listSeparator = i18nText('Advisor.facts.dateSeparator');
    for (const group of facts.groups.filter((item) => item.status === 'ok' && item.inPeriodCount > 0)) {
      items.push(i18nText('Advisor.answerPrompt.checklist.item', { label: group.label, state: groupState(group.group) }));
    }
    const olderOnly = facts.groups
      .filter((item) => item.status === 'ok' && item.inPeriodCount === 0)
      .map((item) => i18nText('Advisor.answerPrompt.checklist.latestDate', { label: item.label, date: item.latestRecordDate ?? '' }));
    if (olderOnly.length > 0) {
      items.push(i18nText('Advisor.answerPrompt.checklist.olderOnly', { labels: olderOnly.join(listSeparator) }));
    }
    const empty = facts.groups.filter((item) => item.status === 'empty').map((item) => item.label);
    if (empty.length > 0) {
      items.push(i18nText('Advisor.answerPrompt.checklist.noRecordsAtAll', { labels: empty.join(listSeparator) }));
    }
  } else {
    const covered = new Set<AdvisorRecordGroupId>();
    for (const domain of intent.domains) {
      const recordGroups = ADVISOR_DOMAIN_DEFINITIONS.find((definition) => definition.domain === domain)?.recordGroups ?? [];
      const parts = recordGroups.filter((group) => summaries.has(group)).map((group) => {
        covered.add(group);
        return groupState(group);
      }).filter(Boolean);
      const coverage = knowledge.coverage.find((entry) => entry.domain === domain);
      if (coverage?.coverage === 'provided') {
        parts.push(i18nText('Advisor.answerPrompt.checklist.materialProvided'));
      } else if (coverage) {
        parts.push(...uncoveredReasons(coverage, input.ageMonths));
      }
      items.push(i18nText('Advisor.answerPrompt.checklist.item', { label: i18nText(`Advisor.domain.${domain}`), state: parts.join(separator) }));
    }
    for (const group of facts?.groups ?? []) {
      if (covered.has(group.group) || !summaries.has(group.group)) continue;
      items.push(i18nText('Advisor.answerPrompt.checklist.item', { label: group.label, state: groupState(group.group) }));
    }
  }
  return items.length > 0 ? [i18nText('Advisor.answerPrompt.checklist.title'), ...items] : [];
}

function coverageLine(entry: AdvisorDomainCoverage, ageMonths: number): string {
  const domain = i18nText(`Advisor.domain.${entry.domain}`);
  switch (entry.coverage) {
    case 'provided':
      return i18nText('Advisor.answerPrompt.coverage.provided', { domain });
    case 'no-age-match':
      return i18nText('Advisor.answerPrompt.coverage.noAgeMatch', {
        domain,
        start: entry.materialAgeMonths?.start ?? 0,
        end: entry.materialAgeMonths?.end ?? 0,
        age: ageMonths,
      });
    case 'needs-review':
      return i18nText('Advisor.answerPrompt.coverage.needsReview', { domain });
    case 'no-material':
    default:
      return i18nText('Advisor.answerPrompt.coverage.noMaterial', { domain });
  }
}

function nurtureModeLine(modeId: string): string | null {
  const mode = NURTURE_MODES.find((item) => item.modeId === modeId) ?? NURTURE_MODES.find((item) => item.modeId === 'balanced');
  if (!mode) return null;
  return i18nText('Advisor.answerPrompt.style.nurtureMode', {
    depth: mode.parameters.contentDepth,
    detail: mode.parameters.aiAnalysisDetail,
    tone: mode.parameters.toneStyle,
  });
}

function childLine(child: AdvisorChildContext, today: string): string {
  return i18nText('Advisor.answerPrompt.child', {
    name: child.displayName,
    age: formatAge(child.ageMonths),
    ageMonths: child.ageMonths,
    gender: i18nText(child.gender === 'female' ? 'Advisor.answerPrompt.genderFemale' : 'Advisor.answerPrompt.genderMale'),
    today,
  });
}

export interface AdvisorAnswerPromptInput {
  readonly strategy: AdvisorPromptStrategy;
  readonly intent: AdvisorIntent;
  readonly child: AdvisorChildContext;
  readonly today: string;
  readonly facts: AdvisorFacts | null;
  readonly knowledge: AdvisorKnowledgeSelection;
  readonly history: readonly AdvisorHistoryTurn[];
  readonly question: string;
}

export function buildAdvisorAnswerSystemPrompt(
  input: Omit<AdvisorAnswerPromptInput, 'history' | 'question'> & { historyTrimmed: boolean; factsView: object | null },
): string {
  const { strategy, intent, child, facts, knowledge } = input;
  const sections: string[] = [
    // 1. identity and task
    i18nText('Advisor.answerPrompt.identity'),
    i18nText('Advisor.answerPrompt.modelIdentity'),
    '',
    // 2. facts and knowledge boundary
    i18nText('Advisor.answerPrompt.boundaryTitle'),
    i18nText('Advisor.answerPrompt.boundary.currentFacts'),
    i18nText('Advisor.answerPrompt.boundary.exactNumbers'),
    i18nText('Advisor.answerPrompt.boundary.missingIsNotAbsent'),
    i18nText('Advisor.answerPrompt.boundary.statusFields'),
    i18nText('Advisor.answerPrompt.boundary.comparison'),
    i18nText('Advisor.answerPrompt.boundary.enoughQuestion'),
    i18nText('Advisor.answerPrompt.boundary.judgmentQuestion'),
    i18nText('Advisor.answerPrompt.boundary.parentWords'),
    i18nText('Advisor.answerPrompt.boundary.parentCorrection'),
    i18nText('Advisor.answerPrompt.boundary.safety'),
    '',
    // 3. what this turn allows
    i18nText('Advisor.answerPrompt.scopeTitle'),
    ...strategyScope(strategy, intent),
    ...(hasChecklist(strategy) ? coverageChecklist({ intent, facts, knowledge, ageMonths: child.ageMonths }) : []),
    '',
    // 4. expression
    i18nText('Advisor.answerPrompt.styleTitle'),
    i18nText('Advisor.answerPrompt.style.directAnswer'),
    ...(strategy === 'generic-chat' ? [] : [i18nText('Advisor.answerPrompt.style.recordAnswer')]),
    i18nText('Advisor.answerPrompt.style.coverEveryPart'),
    i18nText('Advisor.answerPrompt.style.length'),
    i18nText('Advisor.answerPrompt.style.format'),
    i18nText('Advisor.answerPrompt.style.noMenu'),
    i18nText('Advisor.answerPrompt.style.noSources'),
    i18nText('Advisor.answerPrompt.style.noInternalTerms'),
    ...(strategy === 'generic-chat' ? [] : [i18nText('Advisor.answerPrompt.style.basisQuestion')]),
    ...(intent.detail ? [i18nText('Advisor.answerPrompt.style.detailRequested')] : []),
    ...(strategy === 'generic-chat' ? [] : [nurtureModeLine(child.nurtureMode)].filter((line): line is string => Boolean(line))),
    i18nText('Advisor.answerPrompt.style.language'),
    '',
    i18nText('Advisor.answerPrompt.childTitle'),
    childLine(child, input.today),
  ];

  if (strategy !== 'generic-chat' && input.factsView) {
    sections.push(
      '',
      i18nText('Advisor.answerPrompt.factsTitle'),
      JSON.stringify(input.factsView),
    );
  }

  const requestedCoverage = knowledge.coverage;
  if (strategy !== 'generic-chat' && requestedCoverage.length > 0) {
    sections.push('', i18nText('Advisor.answerPrompt.coverageTitle'));
    sections.push(...requestedCoverage.map((entry) => coverageLine(entry, child.ageMonths)));
  }

  // rule.parentos.advs.r005: knowledge entries reach only reviewed-advice.
  if (strategy === 'reviewed-advice' && knowledge.entries.length > 0) {
    sections.push('', i18nText('Advisor.answerPrompt.knowledgeTitle'));
    for (const entry of knowledge.entries) {
      sections.push(i18nText('Advisor.answerPrompt.knowledgeEntry', {
        id: entry.citeId,
        title: entry.title,
        start: entry.ageRangeMonths.start,
        end: entry.ageRangeMonths.end,
        body: entry.body,
      }));
    }
  }

  if (input.historyTrimmed) {
    sections.push('', i18nText('Advisor.answerPrompt.historyTrimmed'));
  }
  return sections.join('\n');
}

export type AdvisorAnswerPromptResult =
  | {
    readonly ok: true;
    readonly messages: ParentosTextTurnMessage[];
    readonly facts: AdvisorFacts | null;
    /** The exact fact JSON the model received, for the frozen snapshot. */
    readonly factsView: object | null;
    readonly historyMessageIds: string[];
    readonly historyTrimmed: boolean;
  }
  | { readonly ok: false; readonly reason: 'input-over-budget' };

/**
 * Fits the answer input: facts shrink by listed detail first, then whole
 * oldest turns are dropped. The current question is never cut.
 */
export function buildAdvisorAnswerMessages(input: AdvisorAnswerPromptInput): AdvisorAnswerPromptResult {
  const candidateHistory = input.history.slice(-ADVISOR_MAX_HISTORY_TURNS);
  const earlierTurnsExist = input.history.length > candidateHistory.length;

  const levels = input.intent.task === 'overview' ? OVERVIEW_LEVELS : FULL_LEVELS;
  for (const level of levels) {
    const facts = input.facts && level.view === 'full' ? fitAdvisorFactsToBudget(input.facts, level.budget) : input.facts;
    const factsView = facts
      ? modelFacingFacts(facts, { view: level.view, digest: !hasChecklist(input.strategy) })
      : null;
    for (let keep = candidateHistory.length; keep >= 0; keep -= 1) {
      const history = candidateHistory.slice(candidateHistory.length - keep);
      const historyTrimmed = earlierTurnsExist || keep < candidateHistory.length;
      const system = buildAdvisorAnswerSystemPrompt({ ...input, facts, factsView, historyTrimmed });
      const messages: ParentosTextTurnMessage[] = [
        { role: 'system', text: system },
        ...history.flatMap((turn): ParentosTextTurnMessage[] => [
          { role: 'user', text: turn.user.content },
          { role: 'assistant', text: turn.assistant.content },
        ]),
        { role: 'user', text: input.question },
      ];
      const sizes = messages.map((message) => utf8Bytes(message.text));
      const total = sizes.reduce((sum, size) => sum + size, 0);
      if (sizes.every((size) => size <= ADVISOR_ANSWER_BUDGET.maxMessageBytes) && total <= ADVISOR_ANSWER_BUDGET.maxPromptBytes) {
        return {
          ok: true,
          messages,
          facts,
          factsView,
          historyMessageIds: history.flatMap((turn) => [turn.user.messageId, turn.assistant.messageId]),
          historyTrimmed,
        };
      }
      if (utf8Bytes(system) > ADVISOR_ANSWER_BUDGET.maxMessageBytes) break;
    }
  }
  return { ok: false, reason: 'input-over-budget' };
}
