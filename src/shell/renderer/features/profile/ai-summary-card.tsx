import { Button, Surface } from '@nimiplatform/kit/ui';
/**
 * AISummaryCard — Reusable AI analysis summary for profile sub-pages.
 *
 * Displays a generated textual analysis based on the child's data for a given domain.
 * Caches results in AppSettings to avoid redundant AI calls.
 * Falls back gracefully when the AI runtime is unavailable.
 */
import { useState, useEffect, useCallback } from 'react';
import { getAppSetting, setAppSetting } from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';
import { filterAIResponse } from '../../engine/ai-safety-filter.js';
import {
  runParentosTextGenerate,
} from '../settings/parentos-ai-runtime.js';
import { i18nText } from '../../i18n/index.js';
import { ParentosAiMascotButton, ParentosAiMascotStatic } from './parentos-ai-mascot-button.js';


interface AISummaryCardProps {
  /** Unique domain key, e.g. 'growth', 'vaccine', 'vision' */
  domain: string;
  /** Child's name for display */
  childName: string;
  /** Child ID for cache key */
  childId: string;
  /** Age description, e.g. "9 years 4 months" */
  ageLabel: string;
  /** Gender: 'male' | 'female' */
  gender: string;
  /**
   * Structured data context to send to AI.
   * Should be a human-readable summary of the page's data.
   * Pass empty string if no data exists.
   */
  dataContext: string;
}

const DOMAIN_LABEL_KEYS: Record<string, string> = {
  overview: 'AISummary.domain.overview',
  growth: 'AISummary.domain.growth',
  milestone: 'AISummary.domain.milestone',
  vaccine: 'AISummary.domain.vaccine',
  vision: 'AISummary.domain.vision',
  dental: 'AISummary.domain.dental',
  allergy: 'AISummary.domain.allergy',
  sleep: 'AISummary.domain.sleep',
  medical: 'AISummary.domain.medical',
  tanner: 'AISummary.domain.tanner',
  fitness: 'AISummary.domain.fitness',
};

function cacheKey(childId: string, domain: string) {
  // v5: cache entry now carries a dataHash so a summary is invalidated when
  // the underlying records change, not only after the TTL elapses.
  return `ai_summary_v5_${childId}_${domain}`;
}

// A cached summary stays valid for 7 days, but only while the data it was
// generated from is unchanged (see dataHash check below).
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Cheap non-cryptographic hash; only used to detect that dataContext changed.
function hashDataContext(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (Math.imul(hash, 31) + input.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Heuristic: a well-formed summary ends with a terminal punctuation mark.
 * If it doesn't, the model was cut off (token limit, transport, etc.) and
 * we should not persist it to the 24h cache.
 */
const TERMINAL_PUNCTUATION = /[。！？.!?"'”’）)]\s*$/u;

function looksTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return !TERMINAL_PUNCTUATION.test(trimmed);
}

function buildPrompt(props: AISummaryCardProps): string {
  const labelKey = DOMAIN_LABEL_KEYS[props.domain];
  const label = labelKey ? i18nText(labelKey) : props.domain;
  const gender = props.gender === 'female'
    ? i18nText('AISummary.prompt.genderFemale')
    : i18nText('AISummary.prompt.genderMale');
  return [
    i18nText('AISummary.prompt.role', { label }),
    i18nText('AISummary.prompt.task'),
    i18nText('AISummary.prompt.requirementsTitle'),
    i18nText('AISummary.prompt.tone'),
    i18nText('AISummary.prompt.allowedLanguage'),
    i18nText('AISummary.prompt.bannedLanguage'),
    i18nText('AISummary.prompt.dataSufficiency'),
    i18nText('AISummary.prompt.outputOnly'),
    ``,
    i18nText('AISummary.prompt.childInfo', {
      childName: props.childName,
      ageLabel: props.ageLabel,
      gender,
    }),
    ``,
    i18nText('AISummary.prompt.dataLabel', { label }),
    props.dataContext || i18nText('AISummary.prompt.noRecords'),
  ].join('\n');
}

export function AISummaryCard(props: AISummaryCardProps) {
  const { domain, childId, dataContext } = props;
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const generate = useCallback(async (skipCache = false) => {
    if (!dataContext) return; // no data to analyze

    const dataHash = hashDataContext(dataContext);

    // Check cache first
    if (!skipCache) {
      try {
        const cached = await getAppSetting(cacheKey(childId, domain));
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as { text: string; ts: string; dataHash?: string };
            const withinTtl = Date.now() - new Date(parsed.ts).getTime() < CACHE_TTL_MS;
            // Reuse the cache only when it is fresh AND derived from the same
            // data; a new measurement changes the hash and forces a regen.
            if (withinTtl && parsed.dataHash === dataHash) {
              setSummary(parsed.text);
              return;
            }
          } catch { /* stale cache, regenerate */ }
        }
      } catch { /* bridge unavailable */ }
    }

    setLoading(true);
    setError(false);
    try {
      const surfaceId = `parentos.profile.summary.${domain}` as const;
      // Prompt asks for 2-4 sentence Chinese summary (~80-200 tokens). The
      // user's global text.generate maxTokens can be set very low in AI
      // settings, which would starve this surface and produce a mid-sentence
      // cutoff. Enforce a floor so the summary always has room to complete,
      // and auto-retry with a larger budget if the first attempt is cut off.
      const SUMMARY_MIN_MAX_TOKENS = 512;
      const SUMMARY_RETRY_MAX_TOKENS = 1536;
      const runGenerate = async (budget: number) => {
        const result = await runParentosTextGenerate({
          surfaceId,
          messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(props) }] }],
          defaults: { temperature: 0.3, maxTokens: budget },
        });
        if (!result.ok) {
          throw result.error.cause || new Error(result.error.message);
        }
        return {
          text: result.text,
          finishReason: result.finishReason,
        };
      };

      const firstBudget = SUMMARY_MIN_MAX_TOKENS;
      let output = await runGenerate(firstBudget);
      // If the model hit the token cap or text looks mid-sentence, retry
      // once with a much larger budget so low global settings can't starve
      // this surface.
      if (output.finishReason === 'length' || looksTruncated(output.text)) {
        const retryBudget = Math.max(firstBudget * 2, SUMMARY_RETRY_MAX_TOKENS);
        try {
          const retry = await runGenerate(retryBudget);
          if (retry.text && retry.text.trim()) {
            output = retry;
          }
        } catch { /* retry failed, fall through with first attempt */ }
      }

      const filtered = filterAIResponse(output.text);
      const wasTruncated = output.finishReason === 'length' || looksTruncated(output.text);
      const baseText = filtered.safe ? filtered.filtered : i18nText('AISummary.safeFallback');
      // Tag visibly-truncated output so the user isn't left staring at a
      // mid-sentence summary with no indication of what happened.
      const text = filtered.safe && wasTruncated
        ? `${baseText.replace(/[，、\s]+$/u, '')}…${i18nText('AISummary.truncatedSuffix')}`
        : baseText;
      setSummary(text);

      // Never cache a truncated response: it would pin the mid-sentence
      // summary for 24h.
      if (!wasTruncated) {
        try {
          await setAppSetting(cacheKey(childId, domain), JSON.stringify({ text, ts: isoNow(), dataHash }), isoNow());
        } catch { /* cache write failure is non-critical */ }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [childId, domain, dataContext, props]);

  useEffect(() => { void generate(); }, [generate]);

  // No data at all — show a subtle hint (吉祥物以非交互形态陪伴)
  if (!dataContext) {
    return (
      <Surface tone="card" material="solid" elevation="base" padding="md" className="mb-5 flex items-center gap-3">
        <ParentosAiMascotStatic size={28} />
        <p className="text-[14px] text-[var(--nimi-text-muted)]">{i18nText('AISummary.noDataHint')}</p>
      </Surface>
    );
  }

  return (
    <Surface tone="card" material="solid" elevation="raised" padding="lg" className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <ParentosAiMascotButton
            thinking={loading}
            onClick={() => void generate(true)}
            label={loading ? i18nText('AISummary.generating') : i18nText('AISummary.regenerate')}
          />
          <h3 className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('AISummary.title')}</h3>
        </div>
        {loading ? (
          <span className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('AISummary.generating')}…</span>
        ) : null}
      </div>

      {loading && !summary ? (
        /* Skeleton */
        <div className="space-y-2 animate-pulse">
          <div className="h-3 rounded-full w-full bg-[var(--nimi-surface-active)]" />
          <div className="h-3 rounded-full w-4/5 bg-[var(--nimi-surface-active)]" />
          <div className="h-3 rounded-full w-3/5 bg-[var(--nimi-surface-active)]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-[var(--nimi-text-muted)]">{i18nText('AISummary.runtimeUnavailable')}</span>
          <Button onClick={() => void generate(true)} tone="secondary" size="sm">
            {i18nText('AISummary.retry')}
          </Button>
        </div>
      ) : summary ? (
        <p className="text-[14px] leading-relaxed text-[var(--nimi-text-primary)]">{summary}</p>
      ) : null}
    </Surface>
  );
}
