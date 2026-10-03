import { ArrowRight } from 'lucide-react';
import { AdvisorHeroMascot } from './advisor-mascot.js';
import { AdvisorRuntimeGateNotice } from './advisor-runtime-gate.js';
import { i18nText } from '../../i18n/index.js';


export type JournalEntryAdvisorContext = {
  entryId: string;
  recordedAt: string;
  contentType: string;
  textContent: string | null;
  dimensionName: string | null;
  tags: string[];
  recorderName: string | null;
};

const JOURNAL_CONTEXT_STARTER_KEYS = [
  'Advisor.journalContext.starter.keyInfo',
  'Advisor.journalContext.starter.moreObservation',
  'Advisor.journalContext.starter.signals',
] as const;

function formatContextDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ').slice(0, 16);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type AdvisorJournalContextProps = {
  context: JournalEntryAdvisorContext;
  runtimeAvailable: boolean | null;
  onSelectStarter: (starter: string) => void;
};

export function AdvisorJournalContext({ context, runtimeAvailable, onSelectStarter }: AdvisorJournalContextProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-6 pb-[5vh] pt-10">
      <div className="my-auto flex w-full max-w-md flex-col items-center">
        <AdvisorHeroMascot size={76} />
        <h2 className="mb-5 mt-9 text-center text-[20px] font-bold leading-snug tracking-tight text-[var(--nimi-text-primary)]">
          {i18nText('Advisor.journalContext.title')}
        </h2>

        {/* Journal entry preview card */}
        <div className="advisor-journal-preview mb-4 w-full rounded-2xl p-4 text-left">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {context.dimensionName && (
              <span className="rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">
                {context.dimensionName}
              </span>
            )}
            <span className="text-[12px] text-slate-400">
              {formatContextDateTime(context.recordedAt)}
            </span>
            {context.recorderName && (
              <span className="text-[12px] text-slate-400">
                {i18nText('Advisor.journalContext.recorder', { recorderName: context.recorderName })}
              </span>
            )}
          </div>
          {context.tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {context.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[12px] text-slate-600">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="line-clamp-3 text-[14px] leading-relaxed text-slate-700">
            {context.textContent?.trim() || i18nText('Advisor.journalContext.voiceOrImageOnly')}
          </p>
        </div>

        {/* Starter buttons */}
        {runtimeAvailable === false ? (
          <div className="w-full">
            <AdvisorRuntimeGateNotice />
          </div>
        ) : (
        <div className="flex w-full flex-col gap-2">
          {JOURNAL_CONTEXT_STARTER_KEYS.map((starterKey) => {
            const starter = i18nText(starterKey);
            return (
            <button
              key={starterKey}
              type="button"
              onClick={() => onSelectStarter(starter)}
              className="advisor-suggestion-chip group flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-[14px] text-[var(--nimi-text-primary)]"
            >
              <span>{starter}</span>
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="shrink-0 text-[var(--nimi-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--nimi-action-primary-bg)]"
              />
            </button>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
