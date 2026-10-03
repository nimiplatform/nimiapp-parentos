import { describe, expect, it } from 'vitest';
import { SENSITIVE_PERIODS } from '../../knowledge-base/index.js';
import { selectAdvisorKnowledge } from './advisor-knowledge.js';

describe('selectAdvisorKnowledge', () => {
  it('provides only sensitive periods whose age range contains the child', () => {
    const selection = selectAdvisorKnowledge({ domains: ['sensitivity'], ageMonths: 48 });
    const expected = SENSITIVE_PERIODS
      .filter((period) => period.ageRange.startMonths <= 48 && 48 <= period.ageRange.endMonths)
      .map((period) => period.periodId);
    expect(selection.entries.map((entry) => entry.entryId)).toEqual(expected);
    expect(selection.entries.map((entry) => entry.citeId)).toEqual(expected.map((_, index) => `K${index + 1}`));
    expect(selection.entries.every((entry) => entry.ageRangeMonths.start <= 48 && entry.ageRangeMonths.end >= 48)).toBe(true);
    expect(selection.coverage).toEqual([{ domain: 'sensitivity', coverage: 'provided', materialAgeMonths: { start: 0, end: 84 } }]);
  });

  it('gives a 13-year-old no infant or preschool material and says why', () => {
    const selection = selectAdvisorKnowledge({ domains: ['sensitivity'], ageMonths: 156 });
    expect(selection.entries).toEqual([]);
    expect(selection.coverage).toEqual([{ domain: 'sensitivity', coverage: 'no-age-match', materialAgeMonths: { start: 0, end: 84 } }]);
  });

  it('never turns a domain source label into material', () => {
    const selection = selectAdvisorKnowledge({ domains: ['sleep', 'digital', 'outdoor', 'vision'], ageMonths: 156 });
    expect(selection.entries).toEqual([]);
    expect(selection.coverage).toEqual([
      { domain: 'sleep', coverage: 'no-material' },
      { domain: 'digital', coverage: 'no-material' },
      { domain: 'outdoor', coverage: 'no-material' },
      { domain: 'vision', coverage: 'needs-review' },
    ]);
  });
});
