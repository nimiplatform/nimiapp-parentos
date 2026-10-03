import {
  REVIEWED_DOMAINS,
  SENSITIVE_PERIODS,
  SENSITIVE_PERIODS_CONTENT_VERSION,
  SENSITIVE_PERIOD_SOURCES,
  type AdvisorClassifierDomain,
  type SensitivePeriod,
} from '../../knowledge-base/index.js';
import { i18nText } from '../../i18n/index.js';

export interface AdvisorKnowledgeEntry {
  /** Turn-local citation id handed to the model, e.g. K1. */
  readonly citeId: string;
  readonly assetId: 'sensitive-periods';
  readonly entryId: string;
  readonly contentVersion: string;
  readonly domain: AdvisorClassifierDomain;
  readonly title: string;
  readonly body: string;
  readonly ageRangeMonths: { readonly start: number; readonly end: number };
  readonly citation: string;
  readonly url: string | null;
}

export type AdvisorMaterialCoverage = 'provided' | 'no-age-match' | 'no-material' | 'needs-review';

export interface AdvisorDomainCoverage {
  readonly domain: AdvisorClassifierDomain;
  readonly coverage: AdvisorMaterialCoverage;
  /** Age span the admitted material covers, when material exists. */
  readonly materialAgeMonths?: { readonly start: number; readonly end: number };
}

export interface AdvisorKnowledgeSelection {
  readonly entries: readonly AdvisorKnowledgeEntry[];
  readonly coverage: readonly AdvisorDomainCoverage[];
}

function sensitivePeriodBody(period: SensitivePeriod): string {
  const separator = i18nText('Advisor.knowledge.listSeparator');
  return i18nText('Advisor.knowledge.sensitivePeriodBody', {
    description: period.description,
    start: period.ageRange.startMonths,
    peak: period.ageRange.peakMonths,
    end: period.ageRange.endMonths,
    signs: period.observableSigns.join(separator),
    strategies: period.supportStrategies.join(separator),
    mistakes: period.commonMistakes.join(separator),
  });
}

function sensitivePeriodCitation(period: SensitivePeriod) {
  const source = SENSITIVE_PERIOD_SOURCES.find((item) => item.sourceId === period.source);
  return source && source.reviewStatus === 'reviewed' ? source : null;
}

/**
 * Admitted, age-applicable knowledge for the requested reviewed domains.
 * Readiness gates the domain; only entries with body text, reviewed
 * provenance and an age range containing the child's age become material.
 */
// @nimi-authority: rule.parentos.advs.r005
export function selectAdvisorKnowledge(input: {
  domains: readonly AdvisorClassifierDomain[];
  ageMonths: number;
}): AdvisorKnowledgeSelection {
  const entries: AdvisorKnowledgeEntry[] = [];
  const coverage: AdvisorDomainCoverage[] = [];
  for (const domain of input.domains) {
    if (!REVIEWED_DOMAINS.includes(domain)) {
      coverage.push({ domain, coverage: 'needs-review' });
      continue;
    }
    if (domain !== 'sensitivity') {
      coverage.push({ domain, coverage: 'no-material' });
      continue;
    }
    const admitted = SENSITIVE_PERIODS.filter((period) => sensitivePeriodCitation(period) !== null);
    const materialAgeMonths = admitted.length > 0
      ? {
        start: Math.min(...admitted.map((period) => period.ageRange.startMonths)),
        end: Math.max(...admitted.map((period) => period.ageRange.endMonths)),
      }
      : undefined;
    const applicable = admitted.filter((period) => (
      period.ageRange.startMonths <= input.ageMonths && input.ageMonths <= period.ageRange.endMonths
    ));
    if (applicable.length === 0) {
      coverage.push({ domain, coverage: admitted.length > 0 ? 'no-age-match' : 'no-material', ...(materialAgeMonths ? { materialAgeMonths } : {}) });
      continue;
    }
    for (const period of applicable) {
      const source = sensitivePeriodCitation(period);
      if (!source) continue;
      entries.push({
        citeId: `K${entries.length + 1}`,
        assetId: 'sensitive-periods',
        entryId: period.periodId,
        contentVersion: SENSITIVE_PERIODS_CONTENT_VERSION,
        domain,
        title: period.title,
        body: sensitivePeriodBody(period),
        ageRangeMonths: { start: period.ageRange.startMonths, end: period.ageRange.endMonths },
        citation: source.citation,
        url: source.url,
      });
    }
    coverage.push({ domain, coverage: 'provided', ...(materialAgeMonths ? { materialAgeMonths } : {}) });
  }
  return { entries, coverage };
}
