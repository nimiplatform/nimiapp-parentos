import { PencilLine } from 'lucide-react';
import type { OutdoorRecordRow } from '../../bridge/sqlite-bridge.js';
import { i18nText } from '../../i18n/index.js';
import { formatDayLabel, parseDate, weekdayLabel } from './outdoor-helpers.js';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[length:var(--nimi-focus-ring-width)] focus-visible:ring-[color:var(--nimi-focus-ring-color)]';

/**
 * The selected week's outings as a short diary: one row per record, oldest
 * first to read alongside the day suns above, with a day's later outings
 * tucked under its date. A row opens the record for editing.
 */
export function OutdoorWeekJournal({ records, isCurrentWeek, onEdit, className = '' }: {
  records: OutdoorRecordRow[];
  isCurrentWeek: boolean;
  onEdit: (record: OutdoorRecordRow) => void;
  className?: string;
}) {
  const totalMinutes = records.reduce((sum, record) => sum + record.durationMinutes, 0);

  return (
    <section aria-labelledby="outdoor-journal-title" className={`min-w-0 ${className}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id="outdoor-journal-title" className="text-[17px] font-semibold text-[var(--nimi-text-primary)]">
          {isCurrentWeek ? i18nText('Outdoor.page.tracker.journal.titleCurrent') : i18nText('Outdoor.page.tracker.journal.titlePast')}
        </h3>
        {records.length > 0 ? (
          <span className="text-[13px] tabular-nums text-[var(--nimi-text-muted)]">
            {i18nText('Outdoor.page.tracker.journal.summary', { count: records.length, minutes: totalMinutes })}
          </span>
        ) : null}
      </header>

      {records.length === 0 ? (
        <p className="mt-4 max-w-[34rem] text-[13.5px] leading-[1.7] text-[var(--nimi-text-muted)]">
          {isCurrentWeek ? i18nText('Outdoor.page.tracker.journal.emptyCurrent') : i18nText('Outdoor.page.tracker.journal.emptyPast')}
        </p>
      ) : (
        <ul className="-mx-3 mt-3 flex flex-col">
          {records.map((record, index) => {
            const date = parseDate(record.activityDate);
            const sameDayAsPrevious = records[index - 1]?.activityDate === record.activityDate;
            return (
              <li key={record.recordId}>
                <button
                  type="button"
                  onClick={() => onEdit(record)}
                  aria-label={i18nText('Outdoor.page.tracker.journal.editAria', { date: formatDayLabel(record.activityDate) })}
                  className={`group flex w-full cursor-pointer items-center gap-4 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/60 ${FOCUS_RING}`}
                >
                  <span aria-hidden={sameDayAsPrevious} className="flex w-10 shrink-0 flex-col items-center leading-tight">
                    {sameDayAsPrevious ? null : (
                      <>
                        <span className="text-[11.5px] text-[var(--nimi-text-muted)]">{weekdayLabel(date)}</span>
                        <span className="text-[19px] font-semibold tabular-nums text-[var(--nimi-text-primary)]">{date.getDate()}</span>
                      </>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-[#fff0c7] px-3 py-0.5 text-[13.5px] font-semibold tabular-nums text-[#8a5200]">
                    {i18nText('Outdoor.page.duration.minutes', { minutes: record.durationMinutes })}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[14px] ${record.note ? 'text-[var(--nimi-text-secondary)]' : 'text-[color-mix(in_srgb,var(--nimi-text-muted)_70%,transparent)]'}`}>
                    {record.note || i18nText('Outdoor.page.tracker.journal.noNote')}
                  </span>
                  <PencilLine
                    size={15}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--nimi-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
