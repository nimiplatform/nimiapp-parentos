import type {
  NimiAppActivityOpenRegistration,
  NimiAppActivityPutInput,
  NimiAppActivityRecord,
} from '@nimiplatform/sdk/app';
import { getReminderStates } from '../../bridge/sqlite-bridge.js';
import { computeAgeMonths, type ChildProfile } from '../../app-shell/app-store.js';
import {
  computeEligibleReminders,
  getLocalToday,
  mapReminderStateRow,
  type ActiveReminder,
  type ReminderRule,
} from '../../engine/reminder-engine.js';
import { loadAllFreqOverrides } from '../../engine/reminder-freq-overrides.js';
import { getParentOSNimiClient, hasParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';
import { i18nText } from '../../i18n/index.js';
import { REMINDER_RULES } from '../../knowledge-base/index.js';

// @nimi-authority: rule.parentos.remi.r016
// An admitted reminder round is projected into the current Nimi account's
// App activity as one todo. The projection is recomputed from the persisted
// reminder rows and compared with the record Runtime holds: an equal record is
// not republished, and every state change, including a restore after a
// cancellation or completion, gets a revision above everything held for the
// key. A failed publication stays visible until an explicit retry or the next
// recomputation publishes it.

export const GROWTH_REMINDER_ACTIVITY_TYPE = 'nimi.parentos.growth-record-reminder.v1';
export const CARE_REMINDER_ACTIVITY_TYPE = 'nimi.parentos.care-reminder.v1';

const PARENTOS_APP_ID = 'nimi.parentos';
const RECORD_PAGE_SIZE = 100;
const MAX_RECORD_PAGES = 10;

const OBJECT_REF = /^reminder:([0-9A-Za-z]{1,64}):(PO-REM-(?:GRO|VAC|CHK|VIS|DEN)-[0-9]{3}):(0|[1-9][0-9]{0,3})$/u;
const SYNC_DEBOUNCE_MS = 300;

/** A round's projected state; its revision is assigned when it is published. */
export type ReminderPublication = Omit<NimiAppActivityPutInput, 'occurredAt' | 'agentHandle' | 'revision'> & {
  readonly key: string;
  readonly occurredAt: string;
};

type IssuedPublication = ReminderPublication & { readonly revision: number };

export function isGrowthRecordReminderRule(rule: Pick<ReminderRule, 'domain' | 'kind' | 'actionType'>): boolean {
  return rule.domain === 'growth' && rule.kind === 'task' && rule.actionType === 'record_data';
}

const GROWTH_RULES = REMINDER_RULES.filter(isGrowthRecordReminderRule);
const GROWTH_RULE_IDS = new Set(GROWTH_RULES.map((rule) => rule.ruleId));
const CARE_DOMAINS = new Set(['vaccine', 'checkup', 'vision', 'dental']);
export function isPublishedReminderRule(rule: Pick<ReminderRule, 'domain' | 'kind' | 'actionType' | 'category'>): boolean {
  return isGrowthRecordReminderRule(rule) || (CARE_DOMAINS.has(rule.domain) && rule.kind === 'task' && rule.actionType === 'go_hospital' && rule.category !== 'personalized');
}
const PUBLISHED_RULES = REMINDER_RULES.filter(isPublishedReminderRule);
const PUBLISHED_RULE_IDS = new Set(PUBLISHED_RULES.map(rule => rule.ruleId));
const REPEATING_PUBLISHED_RULE_IDS = PUBLISHED_RULES.filter(rule => rule.repeatRule).map(rule => rule.ruleId);
function activityTypeForRuleId(ruleId: string): string {
  return GROWTH_RULE_IDS.has(ruleId) ? GROWTH_REMINDER_ACTIVITY_TYPE : CARE_REMINDER_ACTIVITY_TYPE;
}

export function isGrowthRecordReminderRuleId(ruleId: string): boolean {
  return GROWTH_RULE_IDS.has(ruleId);
}

export function reminderActivityObjectRef(childId: string, ruleId: string, repeatIndex: number): string {
  return `reminder:${childId}:${ruleId}:${repeatIndex}`;
}

function reminderActivityKey(childId: string, ruleId: string, repeatIndex: number): string {
  return `${GROWTH_RULE_IDS.has(ruleId) ? 'growth-record' : 'care-reminder'}:${childId}:${ruleId}:${repeatIndex}`;
}

export function parseReminderActivityObjectRef(objectRef: string): { childId: string; ruleId: string; repeatIndex: number } | null {
  const match = OBJECT_REF.exec(objectRef);
  if (!match || !PUBLISHED_RULE_IDS.has(match[2]!)) return null;
  return { childId: match[1]!, ruleId: match[2]!, repeatIndex: Number(match[3]) };
}

/** Publisher grouping only; this value is neither identity nor an open selector. */
export async function reminderActivityGroupRef(childId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`nimi.parentos/reminder-group/v1\0${childId}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `parentos-group-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function localMidnightIso(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toISOString();
}

/**
 * The publication for one reminder round, or null while the round is not
 * published: upcoming, silent, and onboarding catch-up rounds stay private.
 * Scheduled and snoozed rounds keep an already-published todo open.
 */
export function reminderActivityPublication(
  childId: string,
  reminder: ActiveReminder,
  previouslyPublished = false,
): ReminderPublication | null {
  if (!isPublishedReminderRule(reminder.rule)) return null;
  let outcome: 'open' | 'completed' | 'cancelled';
  let occurredAt: string;
  if (reminder.lifecycle === 'completed' && reminder.state?.completedAt) {
    outcome = 'completed';
    occurredAt = reminder.state.completedAt;
  } else if (reminder.lifecycle === 'not_applicable') {
    outcome = 'cancelled';
    occurredAt = reminder.state?.updatedAt ?? localMidnightIso(reminder.effectiveStartDate);
  } else if (
    (reminder.lifecycle === 'due' || reminder.lifecycle === 'overdue'
      || (previouslyPublished && (reminder.lifecycle === 'scheduled' || reminder.lifecycle === 'snoozed')))
    && reminder.visibility === 'push'
    && reminder.deliveryDisposition === 'normal'
  ) {
    outcome = 'open';
    occurredAt = localMidnightIso(reminder.effectiveStartDate);
  } else {
    return null;
  }
  const round = reminder.repeatIndex + 1;
  return {
    key: reminderActivityKey(childId, reminder.rule.ruleId, reminder.repeatIndex),
    kind: 'todo',
    todoState: outcome,
    attention: outcome === 'open',
    title: reminder.rule.title,
    summary: i18nText('Reminders.activity.summary', {
      round,
      start: reminder.effectiveStartDate,
      end: reminder.effectiveEndDate,
    }),
    objectRef: reminderActivityObjectRef(childId, reminder.rule.ruleId, reminder.repeatIndex),
    type: activityTypeForRuleId(reminder.rule.ruleId),
    data: {
      ruleId: reminder.rule.ruleId,
      repeatIndex: reminder.repeatIndex,
      windowStart: reminder.effectiveStartDate,
      windowEnd: reminder.effectiveEndDate,
    },
    occurredAt,
  };
}

/**
 * The cancellation of an open todo whose round the engine no longer carries:
 * a newer round of the same rule superseded it, a newer round was completed,
 * or the rule was disabled. ParentOS no longer asks for that round.
 */
export function supersededReminderPublication(record: NimiAppActivityRecord, now: string): ReminderPublication {
  return {
    key: record.key,
    kind: 'todo',
    todoState: 'cancelled',
    attention: false,
    title: record.title,
    ...(record.summary ? { summary: record.summary } : {}),
    ...(record.objectRef ? { objectRef: record.objectRef } : {}),
    type: record.type,
    ...(record.data ? { data: record.data } : {}),
    occurredAt: now,
  };
}

/** Admitted growth and care reminder rounds ParentOS itself evaluates for the child today. */
export async function evaluatePublishedReminders(child: ChildProfile): Promise<ActiveReminder[]> {
  const [rows, overrides] = await Promise.all([
    getReminderStates(child.childId),
    loadAllFreqOverrides(child.childId, REPEATING_PUBLISHED_RULE_IDS),
  ]);
  return computeEligibleReminders(
    PUBLISHED_RULES,
    {
      birthDate: child.birthDate,
      gender: child.gender,
      ageMonths: computeAgeMonths(child.birthDate),
      profileCreatedAt: child.createdAt,
      localToday: getLocalToday(),
      nurtureMode: child.nurtureMode,
      domainOverrides: child.nurtureModeOverrides,
    },
    rows.map(mapReminderStateRow),
    overrides,
  );
}

type ChildLookup = (childId: string) => ChildProfile | undefined;

type PendingPublication = IssuedPublication & {
  readonly childId: string;
  // Runtime already holds this key at the same or a higher revision; the next
  // attempt assigns a new revision above the held one.
  readonly conflicted: boolean;
};

let queue: Promise<unknown> = Promise.resolve();
let sessionEpoch = 0;
let sessionActive = false;
let findChild: ChildLookup = () => undefined;
// The source of this registration's records, known only from the results of
// its own publications in this session. Another registration of ParentOS has
// the same App id, so neither the App id nor availability identifies it.
let ownSourceRef: string | null = null;
const issuedRevisions = new Map<string, number>();
const pending = new Map<string, PendingPublication>();
const failedProjections = new Set<string>();
const syncListeners = new Set<(unsynced: number) => void>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

function reasonCodeOf(error: unknown): string {
  return String((error as { reasonCode?: unknown })?.reasonCode ?? '');
}

function revisionConflict(error: unknown): boolean {
  const reasonCode = reasonCodeOf(error);
  return reasonCode === 'content-conflict' || reasonCode === 'APP_ACTIVITY_REVISION_CONFLICT';
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// The published content of a todo, without its revision and occurrence time.
function contentOf(value: {
  readonly kind: string;
  readonly todoState?: string | null;
  readonly attention: boolean;
  readonly title: string;
  readonly summary?: string | null;
  readonly objectRef?: string | null;
  readonly type: string;
  readonly data?: unknown;
}): string {
  return canonicalJson([
    value.kind,
    value.todoState ?? null,
    value.attention,
    value.title,
    value.summary ?? null,
    value.objectRef ?? null,
    value.type,
    value.data ?? null,
  ]);
}

// A revision at least the publication time and above every revision held or
// issued for the key, so each change supersedes the previous state.
function nextRevision(key: string, held: readonly NimiAppActivityRecord[]): number {
  const revision = Math.max(
    Date.now(),
    (issuedRevisions.get(key) ?? 0) + 1,
    ...held.map((record) => record.revision + 1),
  );
  issuedRevisions.set(key, revision);
  return revision;
}

function unsyncedCount(): number {
  return pending.size + failedProjections.size;
}

function reportUnsynced(): void {
  for (const listener of syncListeners) listener(unsyncedCount());
}

/** Reports outstanding publications and child projections that could not be read. */
export function subscribeReminderActivitySync(listener: (unsynced: number) => void): () => void {
  syncListeners.add(listener);
  return () => { syncListeners.delete(listener); };
}

/** Starts activity work for the Nimi session that is bound now. */
export function beginReminderActivitySession(lookup: ChildLookup): void {
  endReminderActivitySession();
  findChild = lookup;
  sessionActive = true;
}

/** Stops the session's activity work before its next publication; nothing carries into a later session. */
export function endReminderActivitySession(): void {
  sessionEpoch += 1;
  sessionActive = false;
  ownSourceRef = null;
  issuedRevisions.clear();
  pending.clear();
  failedProjections.clear();
  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();
  reportUnsynced();
}

// Admitted reminder records of ParentOS for the child in every state, grouped by
// key. Until this session knows its own source they may include records of
// another ParentOS registration.
async function heldReminderRecordsOf(childId: string): Promise<Map<string, NimiAppActivityRecord[]>> {
  const client = getParentOSNimiClient();
  const held = new Map<string, NimiAppActivityRecord[]>();
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_RECORD_PAGES; page += 1) {
    const result = await client.activity.list({
      filter: { kind: 'todo', ...(ownSourceRef ? { sourceRef: ownSourceRef } : {}) },
      pageSize: RECORD_PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const record of result.records) {
      if (record.source.kind !== 'app' || record.source.appId !== PARENTOS_APP_ID) continue;
      if (ownSourceRef && record.source.sourceRef !== ownSourceRef) continue;
      if (record.type !== GROWTH_REMINDER_ACTIVITY_TYPE && record.type !== CARE_REMINDER_ACTIVITY_TYPE) continue;
      if (parseReminderActivityObjectRef(record.objectRef ?? '')?.childId !== childId) continue;
      held.set(record.key, [...(held.get(record.key) ?? []), record]);
    }
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }
  return held;
}

// Queues the publication unless this registration already holds the same
// content; a queued, not yet conflicted publication of the same content keeps
// its revision so a retry repeats the same request.
function queuePublication(childId: string, publication: ReminderPublication, held: readonly NimiAppActivityRecord[]): void {
  const content = contentOf(publication);
  const queued = pending.get(publication.key);
  if (ownSourceRef) {
    // Only a record this registration published proves it is synced.
    if (held.some((record) => record.source.sourceRef === ownSourceRef && contentOf(record) === content)) {
      pending.delete(publication.key);
      return;
    }
  } else if (!queued?.conflicted) {
    // Until a publication result shows which records are this registration's,
    // a same-content record may belong to another registration. The current
    // state is published at that record's revision and occurrence: Runtime
    // returns this registration's identical record unchanged (confirming the
    // source without a new revision) or creates this registration's own
    // record when the match belonged to another one.
    const [same] = held
      .filter((record) => contentOf(record) === content)
      .sort((a, b) => b.revision - a.revision);
    if (same) {
      if (queued && queued.revision === same.revision && contentOf(queued) === content) return;
      pending.set(publication.key, {
        ...publication,
        occurredAt: same.occurredAt,
        revision: same.revision,
        childId,
        conflicted: false,
      });
      return;
    }
  }
  if (queued && !queued.conflicted && contentOf(queued) === content) return;
  pending.set(publication.key, {
    ...publication,
    revision: nextRevision(publication.key, held),
    childId,
    conflicted: false,
  });
}

async function flush(childId: string, epoch: number): Promise<number> {
  const client = getParentOSNimiClient();
  for (const [key, queued] of [...pending]) {
    if (epoch !== sessionEpoch) return unsyncedCount();
    // Only this child's pending work was reconciled against persisted state.
    if (queued.childId !== childId) continue;
    const { childId: _childId, conflicted: _conflicted, ...publication } = queued;
    try {
      const result = await client.activity.put(publication);
      if (epoch !== sessionEpoch) return unsyncedCount();
      ownSourceRef ??= result?.record?.source?.sourceRef ?? null;
      if (pending.get(key) === queued) pending.delete(key);
    } catch (error) {
      if (epoch !== sessionEpoch) return unsyncedCount();
      // A conflict is never treated as synced: Runtime holds this key at the
      // same revision with other content or at a higher revision.
      if (revisionConflict(error) && pending.get(key) === queued) pending.set(key, { ...queued, conflicted: true });
      catchLog('reminders', 'action:reminder-activity-publish-failed')(error);
    }
  }
  if (epoch !== sessionEpoch) return unsyncedCount();
  reportUnsynced();
  return unsyncedCount();
}

async function projectChild(childId: string, epoch: number): Promise<void> {
  const child = findChild(childId);
  if (!child) {
    for (const [key, queued] of pending) {
      if (queued.childId === childId) pending.delete(key);
    }
    return;
  }
  const reminders = await evaluatePublishedReminders(child);
  if (epoch !== sessionEpoch) return;
  // A failed read leaves the whole projection retryable. Without the held
  // records we cannot reconcile dropped rounds or assign a safe revision.
  const held = await heldReminderRecordsOf(child.childId);
  if (epoch !== sessionEpoch) return;
  const groupRef = await reminderActivityGroupRef(child.childId);
  if (epoch !== sessionEpoch) return;
  const carried = new Set<string>();
  const publications = new Map<string, ReminderPublication>();
  for (const reminder of reminders) {
    const key = reminderActivityKey(child.childId, reminder.rule.ruleId, reminder.repeatIndex);
    carried.add(key);
    const previouslyPublished = (held.get(key) ?? []).some((record) => record.source.sourceRef === ownSourceRef);
    const publication = reminderActivityPublication(child.childId, reminder, previouslyPublished);
    if (publication) publications.set(publication.key, { ...publication, data: { ...publication.data, groupRef } });
  }
  // A round the engine no longer carries is no longer pending in ParentOS.
  // Only records this session confirmed as its own are closed.
  if (ownSourceRef) {
    const now = new Date().toISOString();
    for (const [key, records] of held) {
      if (carried.has(key)) continue;
      for (const record of records) {
        if (record.source.sourceRef !== ownSourceRef || record.todoState !== 'open') continue;
        publications.set(key, supersededReminderPublication(record, now));
      }
    }
  }
  // Reconcile every outcome, including failed completions and cancellations.
  // A restored, deferred, or dropped round must not publish its old outcome.
  for (const [key, queued] of pending) {
    if (queued.childId === childId && !publications.has(key)) pending.delete(key);
  }
  for (const publication of publications.values()) {
    queuePublication(childId, publication, held.get(publication.key) ?? []);
  }
}

/** Recomputes the child's admitted reminder projection and publishes it. */
export function syncReminderActivity(childId: string): Promise<number> {
  if (!sessionActive || !hasParentOSNimiClient()) return Promise.resolve(unsyncedCount());
  const epoch = sessionEpoch;
  return serialized(async () => {
    if (epoch !== sessionEpoch) return unsyncedCount();
    const knewOwnSource = ownSourceRef !== null;
    await projectChild(childId, epoch);
    if (epoch !== sessionEpoch) return unsyncedCount();
    failedProjections.delete(childId);
    const unsynced = await flush(childId, epoch);
    // The first own publication of the session confirms which records are
    // this registration's; close its superseded rounds in the same pass.
    if (knewOwnSource || !ownSourceRef || epoch !== sessionEpoch) return unsynced;
    await projectChild(childId, epoch);
    if (epoch !== sessionEpoch) return unsyncedCount();
    return flush(childId, epoch);
  }).catch((error: unknown) => {
    if (epoch !== sessionEpoch) return unsyncedCount();
    failedProjections.add(childId);
    reportUnsynced();
    catchLog('reminders', 'action:reminder-activity-sync-failed')(error);
    return unsyncedCount();
  });
}

/** Schedules a projection update after a persisted reminder change. */
export function requestReminderActivitySync(childId: string): void {
  if (!sessionActive) return;
  const previous = debounceTimers.get(childId);
  if (previous) clearTimeout(previous);
  debounceTimers.set(childId, setTimeout(() => {
    debounceTimers.delete(childId);
    void syncReminderActivity(childId);
  }, SYNC_DEBOUNCE_MS));
}

/**
 * The user's explicit retry of publications that are not synced yet. Each
 * affected child is recomputed, so an unchanged publication is sent again at
 * its revision and a conflicted one gets a revision above the held record.
 */
export async function retryReminderActivity(): Promise<number> {
  if (!sessionActive || !hasParentOSNimiClient()) return unsyncedCount();
  const children = [...new Set([
    ...[...pending.values()].map((queued) => queued.childId),
    ...failedProjections,
  ])];
  for (const childId of children) await syncReminderActivity(childId);
  return unsyncedCount();
}

// @nimi-authority: rule.parentos.remi.r017
/**
 * Opens the exact reminder round of the right child. Opening is navigation
 * only; completion follows the persisted source contract of PO-REMI-016.
 */
export function registerReminderOpenHandler(input: {
  readonly selectChild: (childId: string) => void;
  readonly navigate: (path: string) => void;
  readonly focus: () => Promise<void>;
}): NimiAppActivityOpenRegistration {
  return getParentOSNimiClient().activity.onOpenRequest(async (request) => {
    if (request.type !== GROWTH_REMINDER_ACTIVITY_TYPE && request.type !== CARE_REMINDER_ACTIVITY_TYPE) return 'object-unavailable';
    const target = parseReminderActivityObjectRef(request.objectRef);
    if (!target || request.type !== activityTypeForRuleId(target.ruleId)) return 'object-unavailable';
    const child = findChild(target.childId);
    if (!child) return 'object-unavailable';
    const reminders = await evaluatePublishedReminders(child);
    const instance = reminders.find((reminder) => (
      reminder.rule.ruleId === target.ruleId && reminder.repeatIndex === target.repeatIndex
    ));
    if (!instance) return 'object-unavailable';
    input.selectChild(child.childId);
    input.navigate(`/reminders?focus=${encodeURIComponent(`${target.ruleId}:${target.repeatIndex}`)}`);
    await input.focus().catch(() => undefined);
    return 'opened';
  });
}
