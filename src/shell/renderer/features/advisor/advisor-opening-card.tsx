import { OBSERVATION_DIMENSIONS } from '../../knowledge-base/index.js';
import type { AdvisorSnapshot } from './advisor-boundary.js';
import type { JournalEntryRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';


const DIMENSION_NAME_BY_ID = new Map<string, string>(
  OBSERVATION_DIMENSIONS.map((d) => [d.dimensionId, d.displayName]),
);

type LatestFact = {
  icon: string;
  label: string;
  detail: string;
  dateIso: string;
};

function padDate(value: number) {
  return String(value).padStart(2, '0');
}

function humanizeDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return i18nText('Common.relative.today');
  if (diffDays === 1) return i18nText('Common.relative.yesterday');
  if (diffDays < 7) return i18nText('Common.relative.daysAgo', { days: diffDays });
  if (diffDays < 30) return i18nText('Common.relative.weeksAgo', { weeks: Math.floor(diffDays / 7) });
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`;
}

function pickJournalFact(
  entries: JournalEntryRow[],
  siblingNames: string[],
): LatestFact | null {
  const sorted = [...entries].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const containsSibling = (text: string) => {
    const head = text.trim().slice(0, 16);
    return siblingNames.some((n) => n.length > 0 && head.includes(n));
  };

  for (const entry of sorted) {
    const dimName = entry.dimensionId ? DIMENSION_NAME_BY_ID.get(entry.dimensionId) : null;
    if (dimName) {
      return { icon: '📝', label: i18nText('Advisor.fact.journal'), detail: dimName, dateIso: entry.recordedAt };
    }
    const text = entry.textContent?.trim() ?? '';
    if (text && !containsSibling(text)) {
      const short = text.length > 10 ? `${text.slice(0, 10)}…` : text;
      return { icon: '📝', label: i18nText('Advisor.fact.journal'), detail: short, dateIso: entry.recordedAt };
    }
  }

  const fallback = sorted[0];
  if (!fallback) return null;
  return { icon: '📝', label: i18nText('Advisor.fact.journal'), detail: i18nText('Advisor.fact.journal'), dateIso: fallback.recordedAt };
}

function pickLatestFacts(snapshot: AdvisorSnapshot, siblingNames: string[]): LatestFact[] {
  const facts: LatestFact[] = [];

  const latestMeasurement = [...snapshot.measurements]
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  if (latestMeasurement) {
    facts.push({
      icon: '📏',
      label: i18nText('Advisor.fact.latestMeasurement'),
      detail: `${latestMeasurement.typeId} ${latestMeasurement.value}`,
      dateIso: latestMeasurement.measuredAt,
    });
  }

  const latestVaccine = [...snapshot.vaccines]
    .sort((a, b) => b.vaccinatedAt.localeCompare(a.vaccinatedAt))[0];
  if (latestVaccine) {
    facts.push({
      icon: '💉',
      label: i18nText('Advisor.fact.latestVaccine'),
      detail: latestVaccine.vaccineName ?? i18nText('Advisor.fact.vaccineRecord'),
      dateIso: latestVaccine.vaccinatedAt,
    });
  }

  const achievedMilestones = snapshot.milestones.filter((m) => m.achievedAt);
  const latestMilestone = [...achievedMilestones]
    .sort((a, b) => (b.achievedAt ?? '').localeCompare(a.achievedAt ?? ''))[0];
  if (latestMilestone?.achievedAt) {
    facts.push({
      icon: '🌱',
      label: i18nText('Advisor.fact.milestone'),
      detail: latestMilestone.milestoneId ?? i18nText('Advisor.fact.achievedOne'),
      dateIso: latestMilestone.achievedAt,
    });
  }

  const latestOutdoor = [...snapshot.outdoorRecords]
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate))[0];
  if (latestOutdoor) {
    facts.push({
      icon: '☀️',
      label: i18nText('Advisor.fact.outdoor'),
      detail: i18nText('Common.duration.minutes', { minutes: latestOutdoor.durationMinutes }),
      dateIso: latestOutdoor.activityDate,
    });
  }

  const journalFact = pickJournalFact(snapshot.journalEntries, siblingNames);
  if (journalFact) {
    facts.push(journalFact);
  }

  return facts
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    .slice(0, 2);
}

export type AdvisorOpeningCardProps = {
  childName: string;
  ageLabel: string;
  snapshot: AdvisorSnapshot | null;
  siblingNames: string[];
};

export function AdvisorOpeningCard({ childName, ageLabel, snapshot, siblingNames }: AdvisorOpeningCardProps) {
  const facts = snapshot ? pickLatestFacts(snapshot, siblingNames) : [];

  return (
    <div className="shrink-0 px-5 pb-1 pt-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
          <div className="flex items-center gap-1.5 text-[14px] text-slate-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-700">{childName}</span>
            <span className="text-slate-400">· {ageLabel}</span>
          </div>
          {facts.map((fact) => (
            <span
              key={`${fact.label}-${fact.dateIso}`}
              className="inline-flex items-center gap-1 text-[13px] text-slate-500"
            >
              <span aria-hidden>{fact.icon}</span>
              <span className="text-slate-600">{fact.detail}</span>
              <span className="text-slate-400">· {humanizeDate(fact.dateIso)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
