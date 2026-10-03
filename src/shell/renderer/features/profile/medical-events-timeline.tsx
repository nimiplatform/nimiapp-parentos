import {
  Button,
  IconButton,
  StatusBadge,
  Surface,
  Timeline,
  TimelineDivider,
  TimelineGroup,
  cn,
  type StatusTone,
} from '@nimiplatform/kit/ui';
import { Pencil, Search, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { formatAge } from '../../app-shell/app-store.js';
import type { MedicalEventRow } from '../../bridge/sqlite-bridge.js';
import { formatDateLabel } from '../journal/journal-page-helpers.js';
import {
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  eventDurationDays,
  groupByDate,
  LAB_ITEMS,
  labRangeFor,
  parseLabReport,
  RESULT_LABELS,
  SEVERITY_LABELS,
  splitMedicationEntries,
  type LabRange,
  type LabReportData,
} from './medical-events-page-shared.js';
import { ParentosAiMascotButton, ParentosAiMascotStatic } from './parentos-ai-mascot-button.js';
import { parseScreeningEvent } from './vision-data.js';
import { i18nText } from '../../i18n/index.js';


const EVENT_TYPE_TONE_CLASS_DEFAULT = 'bg-[color-mix(in_srgb,var(--nimi-status-neutral)_14%,transparent)] text-[var(--nimi-status-neutral)]';
const EVENT_TYPE_TONE_CLASS: Record<string, string> = {
  visit: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_14%,transparent)] text-[var(--nimi-status-info)]',
  emergency: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_12%,transparent)] text-[var(--nimi-status-danger)]',
  hospitalization: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_14%,transparent)] text-[var(--nimi-status-warning)]',
  checkup: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_14%,transparent)] text-[var(--nimi-status-info)]',
  medication: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_14%,transparent)] text-[var(--nimi-status-success)]',
  'lab-report': 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,transparent)] text-[var(--nimi-action-primary-bg)]',
  other: EVENT_TYPE_TONE_CLASS_DEFAULT,
};

const LAB_RANGE_PILL_CLASS: Record<LabRange['tone'], { pill: string; dot: string }> = {
  success: {
    pill: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_12%,transparent)] text-[var(--nimi-status-success)]',
    dot: 'bg-[var(--nimi-status-success)]',
  },
  warning: {
    pill: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_14%,transparent)] text-[var(--nimi-status-warning)]',
    dot: 'bg-[var(--nimi-status-warning)]',
  },
  danger: {
    pill: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_12%,transparent)] text-[var(--nimi-status-danger)]',
    dot: 'bg-[var(--nimi-status-danger)]',
  },
};

// Same segmented-pill look as the dental history filter.
const FILTER_TRACK_CLASS = 'rounded-full border border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-border-subtle)_45%,transparent)]';

function severityTone(severity: string): StatusTone {
  if (severity === 'severe') return 'danger';
  if (severity === 'moderate') return 'warning';
  return 'neutral';
}

function resultTone(result: string): StatusTone {
  if (result === 'pass') return 'success';
  if (result === 'fail') return 'danger';
  return 'warning';
}

export type MedicalFilterTab = { key: string; label: string };

type EventActions = {
  eventAiLoading: string | null;
  eventAiResult: Record<string, string>;
  onEdit: (event: MedicalEventRow) => void;
  onAnalyze: (event: MedicalEventRow) => void;
  onCloseAI: (eventId: string) => void;
};

/* ── History section — header, filters, timeline, empty states ───── */

export function MedicalEventsHistorySection({
  totalCount,
  filteredEvents,
  filterTabs,
  filterType,
  onFilterTypeChange,
  searchQuery,
  onSearchQueryChange,
  ...actions
}: EventActions & {
  totalCount: number;
  filteredEvents: MedicalEventRow[];
  filterTabs: MedicalFilterTab[];
  filterType: string;
  onFilterTypeChange: (next: string) => void;
  searchQuery: string;
  onSearchQueryChange: (next: string) => void;
}) {
  if (totalCount === 0) {
    return (
      <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="rounded-3xl p-8 text-center">
        <span className="text-[24px]">🏥</span>
        <p className="mt-2 text-[14px] font-medium text-[var(--nimi-text-primary)]">{i18nText('MedicalEvents.timeline.emptyTitle')}</p>
        <p className="mt-1 text-[13px] text-[var(--nimi-text-muted)]">{i18nText('MedicalEvents.timeline.emptyDescription')}</p>
      </Surface>
    );
  }

  const searching = searchQuery.trim() !== '';

  return (
    <section>
      <div className="mt-2 mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2">
          <h3 className="m-0 text-[15px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('Profile.rich.common.history')}</h3>
          <span className="font-mono text-[12px] text-[var(--nimi-text-muted)]">
            {i18nText('Profile.rich.common.recordsCount', { count: totalCount })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {filterTabs.length > 0 ? (
            <div role="group" aria-label={i18nText('MedicalEvents.page.filterTypeAria')} className={cn('flex gap-0.5 p-[3px]', FILTER_TRACK_CLASS)}>
              {filterTabs.map((tab) => {
                const active = filterType === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFilterTypeChange(tab.key)}
                    className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[12px] transition-all ${active ? 'bg-[var(--nimi-surface-card)] font-semibold text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)]' : 'bg-transparent font-normal text-[var(--nimi-text-muted)]'}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <HistorySearch value={searchQuery} onChange={onSearchQueryChange} />
        </div>
      </div>

      {searching && filteredEvents.length > 0 ? (
        <p className="-mt-1.5 mb-3 px-1 text-[12px] text-[var(--nimi-text-muted)]">
          {i18nText('MedicalEvents.timeline.searchResultCount', { count: filteredEvents.length })}
        </p>
      ) : null}

      {filteredEvents.length === 0 ? (
        <Surface tone="card" material="glass-regular" elevation="raised" padding="lg" className="rounded-3xl p-6 text-center">
          <p className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{i18nText('MedicalEvents.timeline.noMatchTitle')}</p>
          <p className="mt-1 text-[13px] text-[var(--nimi-text-muted)]">{i18nText('MedicalEvents.timeline.noMatchDescription')}</p>
          <Button
            tone="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              onFilterTypeChange('all');
              onSearchQueryChange('');
            }}
          >
            {i18nText('MedicalEvents.timeline.clearFilters')}
          </Button>
        </Surface>
      ) : (
        <MedicalEventsTimeline events={filteredEvents} {...actions} />
      )}
    </section>
  );
}

/* ── Search — a round icon that expands into a field on demand ──── */

function HistorySearch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = open || value !== '';

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    // Cleared from outside (e.g. "clear filters") while not being typed in:
    // fold back to the icon instead of leaving an empty field behind.
    if (value === '' && document.activeElement !== inputRef.current) setOpen(false);
  }, [value]);

  const collapse = () => {
    onChange('');
    setOpen(false);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={i18nText('MedicalEvents.page.searchAria')}
        title={i18nText('MedicalEvents.page.searchAria')}
        className={cn('grid h-9 w-9 shrink-0 cursor-pointer place-items-center text-[var(--nimi-text-muted)] transition-colors hover:text-[var(--nimi-text-primary)]', FILTER_TRACK_CLASS)}
      >
        <Search size={15} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={1.8}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nimi-text-muted)]"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!value.trim()) collapse();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') collapse();
        }}
        placeholder={i18nText('MedicalEvents.page.searchPlaceholder')}
        aria-label={i18nText('MedicalEvents.page.searchAria')}
        className="h-9 w-56 rounded-full border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] pl-8 pr-8 text-[13px] text-[var(--nimi-text-primary)] outline-none transition-colors placeholder:text-[var(--nimi-text-muted)] focus:border-[var(--nimi-action-primary-bg)]"
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={collapse}
        aria-label={i18nText('MedicalEvents.page.clearSearch')}
        title={i18nText('MedicalEvents.page.clearSearch')}
        className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)] hover:text-[var(--nimi-text-primary)]"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ── Timeline — one group per day, a divider when the year changes ── */

function MedicalEventsTimeline({ events, ...actions }: EventActions & { events: MedicalEventRow[] }) {
  const groups = useMemo(() => groupByDate(events), [events]);
  const currentYear = new Date().getFullYear();

  return (
    <Timeline>
      {groups.map((group, gi) => {
        const previousYear = gi === 0 ? currentYear : groups[gi - 1]!.year;
        return (
          <Fragment key={group.date}>
            {group.year !== previousYear ? (
              <TimelineDivider label={i18nText('MedicalEvents.timeline.yearDivider', { year: group.year })} />
            ) : null}
            <TimelineGroup
              variant="past"
              date={formatDateLabel(group.date)}
              secondaryLabel={i18nText('Profile.rich.common.recordsCount', { count: group.events.length })}
              isLast={gi === groups.length - 1}
            >
              {group.events.map((event) => (
                <MedicalEventCard
                  key={event.eventId}
                  event={event}
                  aiLoading={actions.eventAiLoading === event.eventId}
                  aiResult={actions.eventAiResult[event.eventId] ?? null}
                  onEdit={actions.onEdit}
                  onAnalyze={actions.onAnalyze}
                  onCloseAI={actions.onCloseAI}
                />
              ))}
            </TimelineGroup>
          </Fragment>
        );
      })}
    </Timeline>
  );
}

/* ── Record card — mirrors the dental history card ───────────────── */

function MedicalEventCard({
  event,
  aiLoading,
  aiResult,
  onEdit,
  onAnalyze,
  onCloseAI,
}: {
  event: MedicalEventRow;
  aiLoading: boolean;
  aiResult: string | null;
  onEdit: (event: MedicalEventRow) => void;
  onAnalyze: (event: MedicalEventRow) => void;
  onCloseAI: (eventId: string) => void;
}) {
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
  const labData = parseLabReport(event.notes);
  // Vision screenings keep a `vision:<key>` marker line in notes; show only
  // the parent's own words.
  const notes = labData ? null : parseScreeningEvent(event).userNotes?.trim() || null;
  const durationDays = eventDurationDays(event);
  const medicationEntries = splitMedicationEntries(event.medication);
  const meta = [
    typeLabel !== event.title ? typeLabel : null,
    formatAge(event.ageMonths),
    event.hospital,
    durationDays ? i18nText('MedicalEvents.timeline.duration', { days: durationDays }) : null,
  ].filter(Boolean).join(' · ');
  const editLabel = i18nText('MedicalEvents.timeline.edit');

  return (
    <Surface
      as="article"
      tone="card"
      material="solid"
      elevation="raised"
      padding="none"
      className="group rounded-lg p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-sm text-[16px]', EVENT_TYPE_TONE_CLASS[event.eventType] ?? EVENT_TYPE_TONE_CLASS_DEFAULT)}>
            <span className="leading-none">{EVENT_TYPE_ICONS[event.eventType] ?? '📋'}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--nimi-text-primary)]">
              <span>{event.title}</span>
              {event.severity ? (
                <StatusBadge tone={severityTone(event.severity)} className="px-2 py-0.5 text-[10px]">
                  {SEVERITY_LABELS[event.severity] ?? event.severity}
                </StatusBadge>
              ) : null}
              {event.result ? (
                <StatusBadge tone={resultTone(event.result)} className="px-2 py-0.5 text-[10px]">
                  {RESULT_LABELS[event.result] ?? event.result}
                </StatusBadge>
              ) : null}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--nimi-text-muted)]">{meta}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ParentosAiMascotButton
            thinking={aiLoading}
            onClick={() => onAnalyze(event)}
            label={i18nText('MedicalEvents.timeline.aiAnalysis')}
            size={24}
          />
          <div className="opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
            <IconButton
              onClick={() => onEdit(event)}
              tone="ghost"
              size="sm"
              className="h-6 min-h-6 w-6 text-[var(--nimi-text-muted)]"
              title={editLabel}
              aria-label={editLabel}
              icon={<Pencil size={13} strokeWidth={1.6} />}
            />
          </div>
        </div>
      </div>

      {notes ? (
        <p className="mt-3.5 whitespace-pre-line text-[13.5px] leading-[1.75] tracking-normal text-[var(--nimi-text-primary)]">
          {notes}
        </p>
      ) : null}

      {labData ? <LabValueGrid data={labData} /> : null}

      {medicationEntries.length > 0 || event.dosage ? (
        <MedicationChips entries={medicationEntries} dosage={event.dosage} />
      ) : null}

      {aiResult ? (
        <div className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_6%,transparent)] px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ParentosAiMascotStatic size={16} />
              <span className="text-[12px] font-semibold text-[var(--nimi-text-primary)]">{i18nText('MedicalEvents.timeline.aiAnalysis')}</span>
            </div>
            <button
              type="button"
              onClick={() => onCloseAI(event.eventId)}
              className="cursor-pointer rounded-full border-0 bg-transparent px-2 py-0.5 text-[12px] text-[var(--nimi-text-muted)] transition-colors hover:bg-[var(--nimi-action-ghost-hover)]"
            >
              {i18nText('MedicalEvents.timeline.collapse')}
            </button>
          </div>
          <p className="text-[13px] leading-[1.7] text-[var(--nimi-text-primary)]">{aiResult}</p>
        </div>
      ) : null}
    </Surface>
  );
}

function MedicationChips({ entries, dosage }: { entries: string[]; dosage: string | null }) {
  const chipClass = 'inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--nimi-status-success)_10%,transparent)] px-2.5 py-1 text-[12px] text-[var(--nimi-text-primary)]';
  // A single drug keeps its legacy free-text dosage inline; otherwise the
  // dosage cannot be attributed to one entry and stands on its own.
  const inlineDosage = entries.length === 1 ? dosage : null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {entries.map((entry, index) => (
        <span key={`${entry}-${index}`} className={chipClass}>
          <span aria-hidden="true" className="text-[11px] leading-none">💊</span>
          {entry}
          {inlineDosage ? <span className="text-[var(--nimi-text-muted)]">· {inlineDosage}</span> : null}
        </span>
      ))}
      {dosage && !inlineDosage ? <span className={chipClass}>{dosage}</span> : null}
    </div>
  );
}

function LabValueGrid({ data }: { data: LabReportData }) {
  const items = LAB_ITEMS.flatMap((item) => {
    const value = data.values[item.key];
    return value == null ? [] : [{ item, value, range: labRangeFor(item, value) }];
  });
  if (items.length === 0) return null;

  return (
    <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-2">
      {items.map(({ item, value, range }) => {
        const tone = LAB_RANGE_PILL_CLASS[range.tone];
        return (
          <div key={item.key} className="rounded-2xl bg-[color-mix(in_srgb,var(--nimi-text-primary)_4%,transparent)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11px] text-[var(--nimi-text-muted)]">{item.label}</span>
              <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', tone.pill)}>
                <span className={cn('h-1 w-1 rounded-full', tone.dot)} />
                {range.label}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-[var(--nimi-text-primary)]">{value}</span>
              <span className="text-[10.5px] text-[var(--nimi-text-muted)]">{item.unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
