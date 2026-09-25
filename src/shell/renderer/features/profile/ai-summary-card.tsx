import { Button, Surface } from '@nimiplatform/kit/ui';
/**
 * AISummaryCard — Reusable AI analysis summary for profile sub-pages.
 *
 * Displays a generated textual analysis based on the child's data for a given domain.
 * Caches results in AppSettings to avoid redundant AI calls.
 * When the summary cannot run, shows the typed cause with its recovery
 * (AI settings for configuration problems, retry for transient failures).
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RotateCw } from 'lucide-react';
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

// Why a summary could not run. Configuration problems are only fixable in AI
// settings (retrying fails again with the same reasonCode), so only host and
// runtime failures offer retry.
type AISummaryUnavailableReason = 'not-configured' | 'cloud-route' | 'host-absent' | 'runtime-failed';

const UNAVAILABLE_MESSAGE_KEYS: Record<AISummaryUnavailableReason, string> = {
  'not-configured': 'AISummary.unavailable.notConfigured',
  'cloud-route': 'AISummary.unavailable.cloudRoute',
  'host-absent': 'AISummary.unavailable.hostAbsent',
  'runtime-failed': 'AISummary.unavailable.runtimeFailed',
};

function unavailableReasonOf(error: unknown): AISummaryUnavailableReason {
  const reasonCode = error && typeof error === 'object' && 'reasonCode' in error
    ? error.reasonCode
    : null;
  switch (reasonCode) {
    case 'parentos-ai-capability-not-configured':
      return 'not-configured';
    case 'parentos-ai-cloud-route-not-admitted':
      return 'cloud-route';
    case 'nimi-shell-runtime-bridge-unavailable':
      return 'host-absent';
    default:
      return 'runtime-failed';
  }
}

function AISummaryUnavailableActions({
  reason,
  onRetry,
}: {
  reason: AISummaryUnavailableReason;
  onRetry: () => void;
}) {
  if (reason === 'not-configured' || reason === 'cloud-route') {
    return (
      <Button
        asChild
        tone="primary"
        size="sm"
        className="rounded-full"
        trailingIcon={<ArrowRight size={14} aria-hidden="true" />}
      >
        <Link to="/settings/ai">{i18nText('AISummary.configureAI')}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button
        onClick={onRetry}
        tone="secondary"
        size="sm"
        className="rounded-full"
        leadingIcon={<RotateCw size={13} aria-hidden="true" />}
      >
        {i18nText('AISummary.retry')}
      </Button>
      {reason === 'host-absent' ? null : (
        <Button asChild tone="ghost" size="sm" className="rounded-full">
          <Link to="/settings/ai">{i18nText('AISummary.openAISettings')}</Link>
        </Button>
      )}
    </>
  );
}

// Tinted glass card (styles.css `parentos-ai-summary-*`) that sets the AI
// summary apart from the plain data cards around it.
function AISummarySurface({ compact = false, children }: { compact?: boolean; children: ReactNode }) {
  return (
    <Surface
      tone="card"
      material="glass-regular"
      elevation="base"
      padding="none"
      className={`parentos-ai-summary-card mb-5 rounded-2xl px-5 ${compact ? 'py-3.5' : 'py-4'}`}
    >
      {children}
    </Surface>
  );
}

// @nimi-authority: rule.parentos.prof.r016
export function AISummaryCard(props: AISummaryCardProps) {
  const { domain, childId, dataContext } = props;
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<AISummaryUnavailableReason | null>(null);

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
    setUnavailableReason(null);
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
          // Carry the typed reasonCode so the card can show the matching recovery.
          throw Object.assign(new Error(result.error.message), { reasonCode: result.error.reasonCode });
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
    } catch (error) {
      setUnavailableReason(unavailableReasonOf(error));
    } finally {
      setLoading(false);
    }
  }, [childId, domain, dataContext, props]);

  useEffect(() => { void generate(); }, [generate]);

  // No data at all — show a subtle hint (吉祥物以非交互形态陪伴)
  if (!dataContext) {
    return (
      <AISummarySurface compact>
        <div className="flex items-center gap-3">
          <span className="parentos-ai-summary-avatar">
            <ParentosAiMascotStatic size={32} />
          </span>
          <p className="text-[14px] leading-6 text-[var(--nimi-text-secondary)]">{i18nText('AISummary.noDataHint')}</p>
        </div>
      </AISummarySurface>
    );
  }

  const regenerate = () => void generate(true);

  return (
    <AISummarySurface>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-[240px] flex-1 items-start gap-3.5">
          <span className="parentos-ai-summary-avatar">
            {unavailableReason === 'not-configured' || unavailableReason === 'cloud-route' ? (
              <ParentosAiMascotStatic size={44} />
            ) : (
              <ParentosAiMascotButton
                size={44}
                thinking={loading}
                onClick={regenerate}
                label={loading ? i18nText('AISummary.generating') : i18nText('AISummary.regenerate')}
              />
            )}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-[22px] text-[var(--nimi-text-primary)]">{i18nText('AISummary.title')}</h3>
              {loading ? (
                <span className="text-[12px] text-[var(--nimi-text-muted)]">{i18nText('AISummary.generating')}…</span>
              ) : null}
            </div>
            {loading && !summary ? (
              /* Skeleton */
              <div className="mt-3 space-y-2.5">
                <div className="parentos-ai-summary-shimmer w-full" />
                <div className="parentos-ai-summary-shimmer w-4/5" />
                <div className="parentos-ai-summary-shimmer w-3/5" />
              </div>
            ) : unavailableReason ? (
              <p className="mt-1 text-[14px] leading-6 text-[var(--nimi-text-secondary)]">
                {i18nText(UNAVAILABLE_MESSAGE_KEYS[unavailableReason])}
              </p>
            ) : summary ? (
              <p className="mt-1.5 text-[14px] leading-[1.75] text-[var(--nimi-text-primary)]">{summary}</p>
            ) : null}
          </div>
        </div>
        {unavailableReason ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AISummaryUnavailableActions reason={unavailableReason} onRetry={regenerate} />
          </div>
        ) : null}
      </div>
    </AISummarySurface>
  );
}
