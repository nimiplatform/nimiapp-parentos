import type { NarrativeReportContent, ProfessionalSummary, ProfessionalSummarySection } from './structured-report.js';

// @nimi-authority: rule.parentos.advs.r009
export function isSparseReport(content: NarrativeReportContent): boolean {
  const evidence = content.metrics.find((metric) => metric.id === 'evidence')?.value;
  return content.format === 'narrative' && (evidence === '0' || evidence === '1');
}

// Match only the deterministic generator's absence messages. Never classify
// arbitrary prose or a parent's edited text as an empty record.
const emptyBodies: Record<string, string> = {
  growth: '本期未记录生长测量数据。',
  health: '本期未记录健康事件。',
  sleep: '本期未记录睡眠数据。',
  milestones: '本期未记录新达成的里程碑。',
  fitness: '本期未记录体能评估。',
  observation: '本期未累计可共享的一般性观察。',
};

export function isUnrecordedSection(summary: ProfessionalSummary, section: ProfessionalSummarySection): boolean {
  if (summary.format !== 'fallback' || section.body !== section.aiOriginal) return false;
  return section.body === emptyBodies[section.id]
    || (section.id === 'vaccine' && /^本期未新增疫苗记录（累计 \d+ 条）。$/.test(section.body));
}
