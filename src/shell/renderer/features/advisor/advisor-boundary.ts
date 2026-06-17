import {
  ADVISOR_DOMAIN_KEYWORDS,
  ADVISOR_GENERIC_RUNTIME,
  KNOWLEDGE_SOURCES,
  NEEDS_REVIEW_DOMAINS,
  REVIEWED_DOMAINS,
} from '../../knowledge-base/index.js';
import type {
  JournalEntryRow,
  MeasurementRow,
  MilestoneRecordRow,
  OutdoorRecordRow,
  VaccineRecordRow,
} from '../../bridge/sqlite-bridge.js';
import {
  getJournalEntries,
  getMeasurements,
  getMilestoneRecords,
  getOutdoorGoal,
  getOutdoorRecords,
  getVaccineRecords,
} from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';

export interface AdvisorSnapshot {
  child: {
    childId: string;
    displayName: string;
    gender: string;
    birthDate: string;
    nurtureMode: string;
  };
  ageMonths: number;
  measurements: MeasurementRow[];
  vaccines: VaccineRecordRow[];
  milestones: MilestoneRecordRow[];
  journalEntries: JournalEntryRow[];
  outdoorRecords: OutdoorRecordRow[];
  outdoorGoalMinutes: number | null;
}

export interface BuildAdvisorSnapshotInput {
  childId: string;
  displayName: string;
  gender: string;
  birthDate: string;
  nurtureMode: string;
  ageMonths: number;
}

export type AdvisorPromptStrategy =
  | 'reviewed-advice'
  | 'needs-review-descriptive'
  | 'unknown-clarifier'
  | 'generic-chat';

function normalize(text: string) {
  return text.toLowerCase();
}

function getSourceLabels(domains: string[]) {
  return KNOWLEDGE_SOURCES
    .filter((source) => domains.includes(source.domain))
    .map((source) => `${source.domain}: ${source.source}`);
}

function advisorListJoin(items: string[]) {
  return items.join(i18nText('Advisor.structuredFallback.listSeparator'));
}

function summarizeMeasurements(measurements: MeasurementRow[]) {
  const latestByType = new Map<string, MeasurementRow>();
  for (const measurement of [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))) {
    if (!latestByType.has(measurement.typeId)) {
      latestByType.set(measurement.typeId, measurement);
    }
  }

  return [...latestByType.values()]
    .map((measurement) => `${measurement.typeId}: ${measurement.value} (${measurement.measuredAt.slice(0, 10)})`)
    .join('；');
}

function summarizeVaccines(vaccines: VaccineRecordRow[]) {
  if (vaccines.length === 0) {
    return i18nText('Advisor.structuredFallback.noVaccines');
  }

  const latest = [...vaccines].sort((a, b) => b.vaccinatedAt.localeCompare(a.vaccinatedAt))[0];
  if (!latest) {
    return i18nText('Advisor.structuredFallback.noVaccines');
  }

  return i18nText('Advisor.structuredFallback.latestVaccine', {
    count: vaccines.length,
    name: latest.vaccineName ?? i18nText('Advisor.structuredFallback.unknownVaccine'),
    date: latest.vaccinatedAt.slice(0, 10),
  });
}

function summarizeMilestones(milestones: MilestoneRecordRow[]) {
  const achieved = milestones.filter((item) => item.achievedAt);
  if (achieved.length === 0) {
    return i18nText('Advisor.structuredFallback.noMilestones');
  }

  const latest = [...achieved].sort((a, b) => (b.achievedAt ?? '').localeCompare(a.achievedAt ?? ''))[0];
  if (!latest?.achievedAt) {
    return i18nText('Advisor.structuredFallback.achievedMilestones', { count: achieved.length });
  }

  return i18nText('Advisor.structuredFallback.latestMilestone', {
    count: achieved.length,
    milestoneId: latest.milestoneId ?? i18nText('Advisor.structuredFallback.unknownMilestone'),
    date: latest.achievedAt.slice(0, 10),
  });
}

function summarizeOutdoor(records: OutdoorRecordRow[], goalMinutes: number | null) {
  if (records.length === 0) {
    return i18nText('Advisor.structuredFallback.noOutdoor');
  }

  // Compute this week's total
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + mondayOffset);
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  const thisWeek = records.filter((r) => r.activityDate >= weekStart);
  const thisWeekTotal = thisWeek.reduce((sum, r) => sum + r.durationMinutes, 0);
  const goal = goalMinutes ?? 630;

  return i18nText('Advisor.structuredFallback.outdoorSummary', {
    count: records.length,
    totalMinutes: thisWeekTotal,
    goalMinutes: goal,
  });
}

function summarizeJournal(journalEntries: JournalEntryRow[]) {
  const latest = journalEntries[0];
  if (!latest) {
    return i18nText('Advisor.structuredFallback.noJournal');
  }

  return i18nText('Advisor.structuredFallback.latestJournal', {
    date: latest.recordedAt.slice(0, 10),
    contentType: latest.contentType,
  });
}

export async function buildAdvisorSnapshot(input: BuildAdvisorSnapshotInput): Promise<AdvisorSnapshot> {
  const [measurements, vaccines, milestones, journalEntries, outdoorRecords, outdoorGoal] = await Promise.all([
    getMeasurements(input.childId),
    getVaccineRecords(input.childId),
    getMilestoneRecords(input.childId),
    getJournalEntries(input.childId, 20),
    getOutdoorRecords(input.childId),
    getOutdoorGoal(input.childId),
  ]);

  return {
    child: {
      childId: input.childId,
      displayName: input.displayName,
      gender: input.gender,
      birthDate: input.birthDate,
      nurtureMode: input.nurtureMode,
    },
    ageMonths: input.ageMonths,
    measurements,
    vaccines,
    milestones,
    journalEntries,
    outdoorRecords,
    outdoorGoalMinutes: outdoorGoal,
  };
}

export function buildMinimalAdvisorSnapshot(input: BuildAdvisorSnapshotInput): AdvisorSnapshot {
  return {
    child: {
      childId: input.childId,
      displayName: input.displayName,
      gender: input.gender,
      birthDate: input.birthDate,
      nurtureMode: input.nurtureMode,
    },
    ageMonths: input.ageMonths,
    measurements: [],
    vaccines: [],
    milestones: [],
    journalEntries: [],
    outdoorRecords: [],
    outdoorGoalMinutes: null,
  };
}

export function serializeAdvisorSnapshot(snapshot: AdvisorSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseAdvisorSnapshot(raw: string): AdvisorSnapshot {
  const parsed = JSON.parse(raw) as AdvisorSnapshot;
  if (!parsed?.child?.childId || !Array.isArray(parsed.measurements) || !Array.isArray(parsed.vaccines)
    || !Array.isArray(parsed.milestones) || !Array.isArray(parsed.journalEntries)) {
    throw new Error('advisor snapshot payload is malformed');
  }
  return parsed;
}

export function inferRequestedDomains(question: string): string[] {
  const normalized = normalize(question);
  return ADVISOR_DOMAIN_KEYWORDS
    .filter((row) => row.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
    .map((row) => row.domain);
}

export function canUseAdvisorRuntime(domains: string[]) {
  return domains.length > 0 && domains.every((domain) => REVIEWED_DOMAINS.includes(domain));
}

export function canUseAdvisorGenericRuntime(question: string, domains: string[]) {
  if (domains.length > 0) {
    return false;
  }
  const normalized = question.trim();
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();
  if (ADVISOR_GENERIC_RUNTIME.phraseIncludes.some((phrase) => lower.includes(phrase.toLowerCase()))) {
    return true;
  }
  const compact = lower.replace(new RegExp(ADVISOR_GENERIC_RUNTIME.compactPunctuationPattern, 'gu'), '');
  return ADVISOR_GENERIC_RUNTIME.exactGreetings.some((phrase) => compact === phrase.toLowerCase());
}

export function resolveAdvisorPromptStrategy(question: string, domains: string[]): AdvisorPromptStrategy {
  if (canUseAdvisorGenericRuntime(question, domains)) {
    return 'generic-chat';
  }
  if (domains.length === 0) {
    return 'unknown-clarifier';
  }
  if (canUseAdvisorRuntime(domains)) {
    return 'reviewed-advice';
  }
  return 'needs-review-descriptive';
}

export function appendAdvisorSources(text: string, domains: string[]) {
  const sources = getSourceLabels(domains);
  if (sources.length === 0) {
    return text.trim();
  }

  return `${text.trim()}\n\n${i18nText('Advisor.structuredFallback.sources', {
    sources: advisorListJoin(sources),
  })}`;
}

export function buildAdvisorRuntimeUserMessage(
  question: string,
  domains: string[],
  snapshot: AdvisorSnapshot,
) {
  const domainText = domains.join(i18nText('Advisor.runtimePrompt.domainSeparator'));
  return [
    i18nText('Advisor.runtimePrompt.reviewed.localOnly'),
    i18nText('Advisor.runtimePrompt.reviewed.insufficientEvidence'),
    i18nText('Advisor.runtimePrompt.question', { question }),
    i18nText('Advisor.runtimePrompt.reviewed.domains', { domains: domainText }),
    i18nText('Advisor.runtimePrompt.snapshot', { snapshot: serializeAdvisorSnapshot(snapshot) }),
  ].join('\n');
}

export function buildAdvisorGenericRuntimeUserMessage(question: string) {
  return [
    i18nText('Advisor.runtimePrompt.generic.scope'),
    i18nText('Advisor.runtimePrompt.generic.allowed'),
    i18nText('Advisor.runtimePrompt.generic.boundary'),
    i18nText('Advisor.runtimePrompt.userMessage', { question }),
  ].join('\n');
}

export function buildAdvisorNeedsReviewRuntimeUserMessage(
  question: string,
  domains: string[],
  snapshot: AdvisorSnapshot,
) {
  const domainText = domains.join(i18nText('Advisor.runtimePrompt.domainSeparator'));
  return [
    i18nText('Advisor.runtimePrompt.needsReview.scope'),
    i18nText('Advisor.runtimePrompt.needsReview.localFactsOnly'),
    i18nText('Advisor.runtimePrompt.needsReview.forbidden'),
    i18nText('Advisor.runtimePrompt.needsReview.expertBoundary'),
    i18nText('Advisor.runtimePrompt.question', { question }),
    i18nText('Advisor.runtimePrompt.needsReview.domains', { domains: domainText }),
    i18nText('Advisor.runtimePrompt.snapshot', { snapshot: serializeAdvisorSnapshot(snapshot) }),
  ].join('\n');
}

export function buildAdvisorUnknownClarifierRuntimeUserMessage(
  question: string,
  snapshot: AdvisorSnapshot,
) {
  return [
    i18nText('Advisor.runtimePrompt.unknown.scope'),
    i18nText('Advisor.runtimePrompt.unknown.noConclusion'),
    i18nText('Advisor.runtimePrompt.unknown.useRecordCategories'),
    i18nText('Advisor.runtimePrompt.userMessage', { question }),
    i18nText('Advisor.runtimePrompt.unknown.localSummary', {
      measurements: snapshot.measurements.length,
      vaccines: snapshot.vaccines.length,
      milestones: snapshot.milestones.length,
      journals: snapshot.journalEntries.length,
    }),
  ].join('\n');
}

export function buildStructuredAdvisorFallback(
  question: string,
  domains: string[],
  snapshot: AdvisorSnapshot,
  options: {
    note?: string;
  } = {},
) {
  const allDomains = domains.length > 0 ? domains : ['profile'];
  const sourceLabels = getSourceLabels(domains);
  const lines = [
    i18nText('Advisor.structuredFallback.question', { question }),
    i18nText('Advisor.structuredFallback.childLine', {
      name: snapshot.child.displayName,
      ageMonths: snapshot.ageMonths,
      mode: snapshot.child.nurtureMode,
    }),
    i18nText('Advisor.structuredFallback.profileFacts', {
      birthDate: snapshot.child.birthDate,
      gender: snapshot.child.gender,
    }),
  ];

  if (allDomains.includes('growth')) {
    lines.push(i18nText('Advisor.structuredFallback.growthRecords', {
      summary: summarizeMeasurements(snapshot.measurements) || i18nText('Advisor.structuredFallback.noGrowthData'),
    }));
  }

  if (allDomains.includes('vaccine')) {
    lines.push(i18nText('Advisor.structuredFallback.vaccineRecords', { summary: summarizeVaccines(snapshot.vaccines) }));
  }

  if (allDomains.includes('milestone')) {
    lines.push(i18nText('Advisor.structuredFallback.milestoneRecords', { summary: summarizeMilestones(snapshot.milestones) }));
  }

  if (allDomains.includes('observation')) {
    lines.push(i18nText('Advisor.structuredFallback.observationRecords', { summary: summarizeJournal(snapshot.journalEntries) }));
  }

  if (allDomains.includes('outdoor') || allDomains.includes('vision')) {
    lines.push(i18nText('Advisor.structuredFallback.outdoorRecords', { summary: summarizeOutdoor(snapshot.outdoorRecords, snapshot.outdoorGoalMinutes) }));
  }

  if (allDomains.length === 1 && allDomains[0] === 'profile') {
    lines.push(
      i18nText('Advisor.structuredFallback.profileRecords', {
        measurements: snapshot.measurements.length,
        vaccines: snapshot.vaccines.length,
        milestones: snapshot.milestones.length,
        journals: snapshot.journalEntries.length,
      }),
    );
  }

  if (domains.some((domain) => NEEDS_REVIEW_DOMAINS.includes(domain))) {
    lines.push(i18nText('Advisor.structuredFallback.needsReviewLine'));
    lines.push(i18nText('Advisor.structuredFallback.expertLine'));
  } else if (domains.length === 0) {
    lines.push(i18nText('Advisor.structuredFallback.unknownDomainLine'));
    lines.push(i18nText('Advisor.structuredFallback.clarifyLine', {
      domains: advisorListJoin([...REVIEWED_DOMAINS]),
    }));
  } else {
    lines.push(i18nText('Advisor.structuredFallback.runtimeFallbackLine'));
  }

  if (sourceLabels.length > 0) {
    lines.push(i18nText('Advisor.structuredFallback.sources', { sources: advisorListJoin(sourceLabels) }));
  }

  if (options.note) {
    lines.push(options.note);
  }

  return lines.join('\n');
}
