import { REVIEWED_DOMAINS } from '../../knowledge-base/index.js';
import {
  runParentosTextGenerate,
} from '../settings/parentos-ai-runtime.js';
import type { AdvisorSnapshot } from './advisor-boundary.js';
import { i18nText, i18nTextForLanguage } from '../../i18n/index.js';

export type AdvisorSuggestion = {
  id: string;
  question: string;
};

const MIN_COUNT = 3;
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

function summarizeLatestMeasurement(snapshot: AdvisorSnapshot) {
  const latest = [...snapshot.measurements]
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .slice(0, 3)
    .map((m) => `${m.typeId}:${m.value}@${m.measuredAt.slice(0, 10)}`);
  return latest.join(i18nText('Advisor.suggestionPrompt.itemSeparator')) || i18nText('Advisor.suggestionPrompt.none');
}

function buildCompactSnapshot(snapshot: AdvisorSnapshot) {
  return {
    childName: snapshot.child.displayName,
    gender: snapshot.child.gender,
    ageMonths: snapshot.ageMonths,
    nurtureMode: snapshot.child.nurtureMode,
    counts: {
      measurements: snapshot.measurements.length,
      vaccines: snapshot.vaccines.length,
      milestones: snapshot.milestones.length,
      journalEntries: snapshot.journalEntries.length,
      outdoorRecords: snapshot.outdoorRecords.length,
    },
    latestMeasurements: summarizeLatestMeasurement(snapshot),
    outdoorGoalMinutes: snapshot.outdoorGoalMinutes,
  };
}

function buildSystemPrompt() {
  return [
    i18nText('Advisor.suggestionPrompt.systemRole'),
    i18nText('Advisor.suggestionPrompt.systemTask', { minCount: MIN_COUNT, maxCount: MAX_COUNT }),
    '',
    i18nText('Advisor.suggestionPrompt.requirementsTitle'),
    i18nText('Advisor.suggestionPrompt.firstPerson', { minLen: MIN_LEN, maxLen: MAX_LEN }),
    i18nText('Advisor.suggestionPrompt.noRepeatSnapshot'),
    i18nText('Advisor.suggestionPrompt.reviewedDomains', {
      domains: REVIEWED_DOMAINS.join(i18nText('Advisor.suggestionPrompt.domainSeparator')),
    }),
    i18nText('Advisor.suggestionPrompt.safetyBoundary'),
    i18nText('Advisor.suggestionPrompt.jsonOnly'),
  ].join('\n');
}

function buildUserPrompt(snapshot: AdvisorSnapshot) {
  const compact = buildCompactSnapshot(snapshot);
  return [
    i18nText('Advisor.suggestionPrompt.snapshotTitle'),
    JSON.stringify(compact),
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
  const cleaned = raw.trim().replace(/^[-•\d.、\s]+/, '').trim();
  if (cleaned.length < MIN_LEN || cleaned.length > MAX_LEN) return null;
  const q = /[？?。.！!]$/.test(cleaned) ? cleaned.replace(/[。.！!]$/, '？') : `${cleaned}？`;
  if (hardBanPattern().test(q)) return null;
  return q;
}

export async function generateAdvisorSuggestions(
  snapshot: AdvisorSnapshot,
  options: { signal?: AbortSignal } = {},
): Promise<AdvisorSuggestion[]> {
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const generated = await runParentosTextGenerate({
    surfaceId: 'parentos.advisor',
    messages: [
      { role: 'system', content: [{ type: 'text', text: buildSystemPrompt() }] },
      { role: 'user', content: [{ type: 'text', text: buildUserPrompt(snapshot) }] },
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
  if (deduped.length < MIN_COUNT) {
    throw new Error(`insufficient suggestions after filter: ${deduped.length}`);
  }

  return deduped.map((question, index) => ({
    id: `ai-${index}`,
    question,
  }));
}
