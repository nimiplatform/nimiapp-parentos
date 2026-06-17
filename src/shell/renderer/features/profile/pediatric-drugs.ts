import type { PediatricDrug } from '../../knowledge-base/index.js';

export { PEDIATRIC_DRUGS } from '../../knowledge-base/index.js';
export type { PediatricDrug } from '../../knowledge-base/index.js';

/**
 * Fuzzy-match drugs by name, generic, pinyin initials, or aliases.
 * Returns matched drugs sorted by relevance.
 */
export function matchDrugs(query: string, drugs: readonly PediatricDrug[]): PediatricDrug[] {
  if (!query.trim()) return [...drugs];
  const q = query.trim().toLowerCase();
  return drugs.filter((d) =>
    d.name.toLowerCase().includes(q) ||
    d.generic?.toLowerCase().includes(q) ||
    d.py.includes(q) ||
    d.aliases?.some((a) => a.toLowerCase().includes(q)),
  );
}
