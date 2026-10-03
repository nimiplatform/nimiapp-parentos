import type { ReactNode } from 'react';
import type { AdvisorFacts, AdvisorRecordGroupId } from './advisor-context.js';
import { AdvisorHeroMascot } from './advisor-mascot.js';
import { i18nText } from '../../i18n/index.js';


const GROUP_ICONS: Partial<Record<AdvisorRecordGroupId, string>> = {
  growth: '📏',
  vision: '👁️',
  fitness: '🏃',
  sleep: '🌙',
  outdoor: '☀️',
  vaccine: '💉',
  dental: '🦷',
  medical: '🩺',
  development: '🌱',
  posture: '🧍',
  journal: '📝',
};

type LatestFact = {
  icon: string;
  label: string;
  dateIso: string;
};

function padDate(value: number) {
  return String(value).padStart(2, '0');
}

function humanizeDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return i18nText('Common.relative.today');
  if (diffDays === 1) return i18nText('Common.relative.yesterday');
  if (diffDays < 7) return i18nText('Common.relative.daysAgo', { days: diffDays });
  if (diffDays < 30) return i18nText('Common.relative.weeksAgo', { weeks: Math.floor(diffDays / 7) });
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`;
}

/** The two most recently recorded categories the advisor can read. */
function pickLatestFacts(facts: AdvisorFacts): LatestFact[] {
  return facts.groups
    .filter((group) => group.status === 'ok' && group.latestRecordDate)
    .map((group) => ({ icon: GROUP_ICONS[group.group] ?? '•', label: group.label, dateIso: group.latestRecordDate as string }))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    .slice(0, 2);
}

export type AdvisorOpeningCardProps = {
  childName: string;
  ageLabel: string;
  facts: AdvisorFacts | null;
  /** Starter questions, shown under the greeting. */
  children?: ReactNode;
};

/** Greeting that fills an empty conversation: the mascot, the child context it reads, and starters. */
export function AdvisorOpeningCard({ childName, ageLabel, facts: openingFacts, children }: AdvisorOpeningCardProps) {
  const facts = openingFacts ? pickLatestFacts(openingFacts) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 pb-4 pt-8">
      <div className="my-auto flex flex-col items-center text-center">
        <AdvisorHeroMascot size={76} />
        <h2 className="mt-9 text-[20px] font-bold leading-snug tracking-tight text-[var(--nimi-text-primary)]">
          {i18nText('Advisor.opening.title', { childName })}
        </h2>
        <div className="mt-3.5 flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <span className="advisor-context-chip">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--nimi-status-success)]" aria-hidden="true" />
            <span className="font-medium text-[var(--nimi-text-primary)]">{childName}</span>
            <span className="text-[var(--nimi-text-muted)]">· {ageLabel}</span>
          </span>
          {facts.map((fact) => (
            <span key={`${fact.label}-${fact.dateIso}`} className="advisor-context-chip">
              <span aria-hidden>{fact.icon}</span>
              <span>{fact.label}</span>
              <span className="text-[var(--nimi-text-muted)]">· {humanizeDate(fact.dateIso)}</span>
            </span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
