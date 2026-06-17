import type { ChildProfile } from '../../app-shell/app-store.js';
import { OBSERVATION_DIMENSIONS } from '../../knowledge-base/index.js';
import type { JournalEntryRow } from '../../bridge/sqlite-bridge.js';
import { getLocalDateKey, parseSelectedTags } from './journal-page-helpers.js';
import { i18nText } from '../../i18n/index.js';


type JournalEntryListProps = {
  child: ChildProfile;
  entries: JournalEntryRow[];
  onEdit?: (entryId: string) => void;
};

export function JournalEntryList({ child, entries, onEdit }: JournalEntryListProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">{i18nText('Journal.entryList.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const dimension = OBSERVATION_DIMENSIONS.find((item) => item.dimensionId === entry.dimensionId);
        const tags = parseSelectedTags(entry.selectedTags);
        const recorderName =
          child.recorderProfiles?.find((item) => item.id === entry.recorderId)?.name ?? null;
        const bodyText = entry.textContent?.trim()
          || (entry.voicePath ? i18nText('Journal.entryList.voiceSaved') : i18nText('Journal.entryList.noText'));

        return (
          <div key={entry.entryId} className="rounded-lg border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">{getLocalDateKey(entry.recordedAt)}</span>
              {onEdit && (
                <button onClick={() => onEdit(entry.entryId)} title={i18nText('Journal.entryList.edit')}
                  className="ml-auto w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
                  style={{ color: '#475569' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              )}
              {entry.observationMode ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {entry.observationMode}
                </span>
              ) : null}
              {dimension ? (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                  {i18nText('Journal.entryList.dimension', { dimension: dimension.displayName })}
                </span>
              ) : null}
              {entry.voicePath ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                  {entry.contentType === 'mixed' ? i18nText('Journal.entryList.voiceMixed') : i18nText('Journal.entryList.voice')}
                </span>
              ) : null}
              {recorderName ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {recorderName}
                </span>
              ) : null}
              {entry.keepsake === 1 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  {i18nText('Journal.entryList.keepsake')}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-gray-800">{bodyText}</p>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="mr-1 text-xs text-gray-400">{i18nText('Journal.entryList.tagsLabel')}</span>
                {tags.map((tag) => (
                  <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
