// Dashboard Task List surface — implementation of
// `.nimi/spec/parentos/kernel/timeline-contract.md#PO-TIME-010`
// (UI proof; deterministic local projection authored in
// `dashboard-task-projection.ts`).
//
// Renders a small daily task list mixing must-do reminders, maintain /
// observe catalog rows, and personal custom todos. Maintain rows route
// the parent into the existing `HealthCaptureModal` via a `dashboard_task`
// origin capture intent (PO-CAPT-005a). No new save path; no new modal;
// no renderer-local catalog rules.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cd, Hdr, textMain, textMuted, textSoft } from './timeline-card-primitives.js';
import type { CustomTodoRow } from '../../bridge/sqlite-bridge.js';
import type { ActiveReminder, ReminderAgenda } from '../../engine/reminder-engine.js';
import { DASHBOARD_TASK_CATALOG, type DashboardTaskCatalogRow } from '../../knowledge-base/index.js';
import {
  buildDashboardTaskCaptureIntent,
  buildDashboardTaskProjection,
  type DashboardTaskEntry,
} from './dashboard-task-projection.js';
import { i18nText } from '../../i18n/index.js';


export interface DashboardTaskCaptureIntent {
  origin: 'dashboard_task';
  dashboardTaskId: string;
  childId: string;
  captureProtocolId: string;
  metricIds: readonly string[];
}

export interface DashboardTaskListProps {
  today: string;
  child: { childId: string; birthDate: string };
  reminderAgenda: ReminderAgenda;
  customTodos: readonly CustomTodoRow[];
  /** Override catalog rows in tests. Production passes `DASHBOARD_TASK_CATALOG`. */
  catalogRows?: readonly DashboardTaskCatalogRow[];
  /** Called when a `maintain` card's primary action fires. Caller wires the
   *  intent into the existing `HealthCaptureModal` state. */
  onDashboardTaskCapture: (intent: DashboardTaskCaptureIntent) => void;
  /** Default `'all'` renders the full projection (reminder rows + catalog
   *  cards + personal rows). `'catalog'` renders only catalog cards plus the
   *  downgrade-indicator badge — used when mounting alongside `ReminderPanel`,
   *  which already owns reminder + custom-todo rendering. */
  showOnly?: 'all' | 'catalog';
  /** When true, omit the outer card wrapper and task header so the list
   *  can be embedded inside another surface (e.g. the task panel's today
   *  tab). */
  headerless?: boolean;
}

function catalogTitle(row: DashboardTaskCatalogRow): string {
  switch (row.taskId) {
    case 'dashboard-maintain-growth-infant':
      return i18nText('Timeline.dashboardTask.catalog.growthInfant');
    case 'dashboard-maintain-growth-child':
      return i18nText('Timeline.dashboardTask.catalog.growthChild');
    case 'dashboard-maintain-sleep':
      return i18nText('Timeline.dashboardTask.catalog.sleep');
    case 'dashboard-maintain-outdoor':
      return i18nText('Timeline.dashboardTask.catalog.outdoor');
    case 'dashboard-maintain-vision':
      return i18nText('Timeline.dashboardTask.catalog.vision');
    case 'dashboard-observe-growth-journal':
      return i18nText('Timeline.dashboardTask.catalog.growthJournal');
    default:
      return row.taskId;
  }
}

function reminderTitle(reminder: ActiveReminder): string {
  // Re-use the rule's `title` field when present; fall back to ruleId.
  // The full title resolution lives in the existing reminder rendering surface; the dashboard
  // list shows a short label only.
  const rule = reminder.rule as unknown as { title?: string; ruleId: string };
  return rule.title ?? rule.ruleId;
}

function CatalogRow({
  entry,
  childId,
  onDashboardTaskCapture,
}: {
  entry: DashboardTaskEntry;
  childId: string;
  onDashboardTaskCapture: (intent: DashboardTaskCaptureIntent) => void;
}) {
  const navigate = useNavigate();
  const row = entry.catalogRow!;
  const title = catalogTitle(row);

  // Catalog rows are rendered inline with reminder rows in the task today
  // tab (see timeline-page-panels.tsx). Visual parity with TimelineReminderRow
  // keeps the panel reading as one unified list. testids preserved for tests.
  const handleActivate = () => {
    if (row.family === 'maintain') {
      const intent = buildDashboardTaskCaptureIntent(row, childId);
      if (intent) onDashboardTaskCapture(intent);
      return;
    }
    if (row.family === 'observe') {
      navigate('/journal');
    }
  };

  // connect / must-do catalog rows are not admitted in wave-2; skip rendering
  // so the schema is honored without exposing unfinished surfaces.
  if (row.family !== 'maintain' && row.family !== 'observe') return null;

  const buttonLabel = row.family === 'maintain'
    ? i18nText('Timeline.dashboardTask.action.record')
    : i18nText('Timeline.dashboardTask.action.writeJournal');
  const buttonTitle = row.family === 'maintain'
    ? i18nText('Timeline.dashboardTask.action.recordDataTitle')
    : i18nText('Timeline.dashboardTask.action.writeJournalTitle');

  return (
    <div
      data-testid={`dashboard-task-card-${row.taskId}`}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleActivate();
        }
      }}
      className="group flex items-center gap-3 rounded-[12px] px-3 py-3.5 transition-colors hover:bg-white cursor-pointer"
    >
      <span
        aria-hidden="true"
        className="mt-[2px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border"
        style={{ borderColor: '#D0D3D8' }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug" style={{ color: textMain }}>{title}</p>
      </div>
      <button
        type="button"
        title={buttonTitle}
        data-testid={`dashboard-task-action-${row.taskId}`}
        onClick={(event) => {
          event.stopPropagation();
          handleActivate();
        }}
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#9AA1A8] transition-colors hover:bg-[rgba(78,204,163,0.16)] hover:text-[#2E9C73]"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function ReminderRow({ entry }: { entry: DashboardTaskEntry }) {
  const reminder = entry.reminder!;
  const title = reminderTitle(reminder);
  const isP0 = entry.priority === 'P0';
  return (
    <div
      data-testid={`dashboard-task-reminder-${reminder.rule.ruleId}`}
      data-priority={entry.priority}
      data-display-state={entry.displayState}
      className="mb-2 flex flex-col gap-1 rounded-md p-3"
      style={{ background: isP0 ? '#fff7ed' : '#f8fafc' }}
    >
      <span className="text-[13px] font-semibold" style={{ color: textMain }}>{title}</span>
      <span className="text-[12px]" style={{ color: textMuted }}>{isP0 ? i18nText('Timeline.dashboardTask.priority.p0Today') : i18nText('Timeline.dashboardTask.priority.today')}</span>
    </div>
  );
}

function PersonalRow({ entry }: { entry: DashboardTaskEntry }) {
  const todo = entry.customTodo!;
  const todoAny = todo as unknown as { title?: string; todoId: string };
  return (
    <div
      data-testid={`dashboard-task-personal-${todo.todoId}`}
      className="mb-2 rounded-md p-3 text-[13px]"
      style={{ background: '#f1f5f9', color: textMain }}
    >
      {todoAny.title ?? todo.todoId}
    </div>
  );
}

export function DashboardTaskList(props: DashboardTaskListProps) {
  const {
    today,
    child,
    reminderAgenda,
    customTodos,
    catalogRows = DASHBOARD_TASK_CATALOG,
    onDashboardTaskCapture,
    showOnly = 'all',
    headerless = false,
  } = props;

  const projection = useMemo(
    () => buildDashboardTaskProjection({
      today,
      child,
      reminderAgenda,
      customTodos,
      catalogRows,
    }),
    [today, child, reminderAgenda, customTodos, catalogRows],
  );

  const visibleEntries = showOnly === 'catalog'
    ? projection.mainList.filter((entry) => entry.source === 'catalog')
    : projection.mainList;

  // When this list is mounted alongside ReminderPanel via showOnly='catalog',
  // an empty card next to the panel header looks broken — render nothing
  // instead.
  if (showOnly === 'catalog' && visibleEntries.length === 0 && projection.downgradeIndicatorCount === 0) {
    return null;
  }

  const body = (
    <div data-testid="dashboard-task-list">
      {visibleEntries.map((entry) => {
        if (entry.source === 'reminder') return <ReminderRow key={entry.key} entry={entry} />;
        if (entry.source === 'catalog') {
          return (
            <CatalogRow
              key={entry.key}
              entry={entry}
              childId={child.childId}
              onDashboardTaskCapture={onDashboardTaskCapture}
            />
          );
        }
        return <PersonalRow key={entry.key} entry={entry} />;
      })}
      {projection.downgradeIndicatorCount > 0 ? (
        <div
          data-testid="dashboard-task-downgrade-indicator"
          className="mt-2 rounded-md p-2 text-[12px]"
          style={{ background: '#f8fafc', color: textSoft }}
        >
          {i18nText('Timeline.dashboardTask.downgradeIndicator', { count: projection.downgradeIndicatorCount })}
        </div>
      ) : null}
    </div>
  );

  if (headerless) return body;

  return (
    <Cd cls="mb-4">
      <Hdr title={i18nText('Timeline.dashboardTask.title')} />
      {body}
    </Cd>
  );
}
