import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import { catchLog } from '../../infra/telemetry/catch-log.js';

export const CHILD_DIRECTORY_TYPE = 'nimi.parentos.child-directory.v1';
export const CHILD_DIRECTORY_KEY = 'child-directory';
export type DirectoryChild = { readonly childId: string; readonly displayName: string };

// @nimi-authority: rule.parentos.prof.child-directory
/** A complete snapshot, independently of active child and reminder eligibility. */
export function createChildDirectoryPublisher(input: {
  readonly client: NimiLocalAppClient;
  readonly readChildren: () => Promise<readonly DirectoryChild[]>;
  readonly title: () => string;
  readonly report: (status: 'syncing' | 'synced' | 'failed') => void;
  readonly reconcileReminders: (sourceRef: string, isCurrent: () => boolean) => Promise<void>;
}) {
  let stopped = false;
  let queue: Promise<void> = Promise.resolve();
  let revision = 0;
  const sync = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    input.report('syncing');
    const run = async () => {
      if (stopped) return;
      try {
        // Constructing the client is side-effect free. The public status call
        // lets the Host establish its session after launch or Runtime recovery.
        const access = await input.client.auth.status();
        if (!access.sessionBound) throw new Error(access.reasonCode);
        if (stopped) return;
        const rows = await input.readChildren();
        const ids = new Set<string>();
        const children = rows.map(row => {
          if (!/^[0-9A-Za-z_-]{1,64}$/u.test(row.childId) || !row.displayName.trim() || ids.has(row.childId)) {
            throw new Error('Child directory identity is invalid.');
          }
          ids.add(row.childId);
          return { childId: row.childId, childName: row.displayName.trim() };
        }).sort((a, b) => a.childId.localeCompare(b.childId));
        // Registration identity is Runtime-owned. Revisions above every held
        // matching key are safe even before our own sourceRef is known.
        let pageToken: string | undefined;
        const tokens = new Set<string>();
        do {
          if (stopped) return;
          const result = await input.client.activity.list({ filter: { kind: 'activity' }, pageSize: 100, ...(pageToken ? { pageToken } : {}) });
          for (const record of result.records) {
            if (record.source.kind === 'app' && record.source.appId === 'nimi.parentos' && record.key === CHILD_DIRECTORY_KEY) {
              revision = Math.max(revision, record.revision);
            }
          }
          pageToken = result.nextPageToken || undefined;
          if (pageToken && tokens.has(pageToken)) throw new Error('Incomplete child directory listing.');
          if (pageToken) tokens.add(pageToken);
        } while (pageToken);
        if (stopped) return;
        revision = Math.max(Date.now(), revision + 1);
        const publication = await input.client.activity.put({
          key: CHILD_DIRECTORY_KEY, revision, kind: 'activity', attention: false,
          title: input.title(), type: CHILD_DIRECTORY_TYPE,
          data: { children }, occurredAt: new Date().toISOString(),
        });
        if (stopped) return;
        const source = publication.record.source;
        if (source.kind !== 'app' || source.appId !== 'nimi.parentos' || !source.sourceRef) {
          throw new Error('Published child directory source is unavailable.');
        }
        await input.reconcileReminders(source.sourceRef, () => !stopped);
        if (!stopped) input.report('synced');
      } catch (error) {
        if (!stopped) {
          catchLog('children', 'action:child-directory-sync-failed')(error);
          input.report('failed');
        }
      }
    };
    queue = queue.then(run, run);
    return queue;
  };
  return { sync, stop: () => { stopped = true; } };
}
