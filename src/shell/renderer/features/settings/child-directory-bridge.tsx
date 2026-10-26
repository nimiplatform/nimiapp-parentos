import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, nimiToast } from '@nimiplatform/kit/ui';
import { useAppStore } from '../../app-shell/app-store.js';
import { getChildren } from '../../bridge/sqlite-bridge.js';
import { getParentOSNimiClient, hasParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import { i18nText } from '../../i18n/index.js';
import { createChildDirectoryPublisher } from './child-directory.js';
import { reconcileRemovedChildReminders } from '../reminders/reminder-activity.js';

type Status = 'idle' | 'syncing' | 'synced' | 'failed' | 'disconnected';
let status: Status = 'idle';
const listeners = new Set<() => void>();
let publisher: ReturnType<typeof createChildDirectoryPublisher> | null = null;
const report = (next: Status) => { status = next; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function requestChildDirectorySync() { return publisher?.sync(); }

export function ChildDirectoryBridge() {
  const children = useAppStore(state => state.children);
  const familyId = useAppStore(state => state.familyId);
  const current = useSyncExternalStore(subscribe, () => status);
  useEffect(() => {
    if (!hasParentOSNimiClient()) { report('disconnected'); return; }
    const instance = createChildDirectoryPublisher({
      client: getParentOSNimiClient(),
      readChildren: async () => {
        const id = useAppStore.getState().familyId;
        if (!id) return [];
        const rows = await getChildren(id);
        if (rows.some(row => row.familyId !== id)) throw new Error('Child family mismatch.');
        return rows;
      },
      title: () => i18nText('ChildDirectory.title'),
      report,
      reconcileReminders: reconcileRemovedChildReminders,
    });
    publisher = instance;
    const unsubscribe = window.parentOSHost?.onSessionInvalidated(() => {
      instance.stop();
      publisher = null;
      report('disconnected');
    });
    return () => { unsubscribe?.(); instance.stop(); if (publisher === instance) publisher = null; };
  }, []);
  useEffect(() => { void requestChildDirectorySync(); }, [children, familyId]);
  useEffect(() => {
    if (current !== 'failed') return;
    const id = nimiToast.warning(i18nText('ChildDirectory.failed'), {
      sticky: true,
      action: { label: i18nText('ChildDirectory.retry'), onClick: () => { void requestChildDirectorySync(); } },
    });
    return () => nimiToast.dismiss(id);
  }, [current]);
  return null;
}

export function ChildDirectoryStatus() {
  const current = useSyncExternalStore(subscribe, () => status);
  const [busy, setBusy] = useState(false);
  return <div className="mb-5 text-[14px] text-[var(--nimi-text-muted)]">
    <p>{i18nText('ChildDirectory.disclosure')}</p>
    <p role="status">{i18nText(`ChildDirectory.${current}`)}</p>
    <Button size="sm" tone="secondary" disabled={busy || current === 'syncing' || current === 'disconnected'}
      onClick={() => { setBusy(true); void Promise.resolve(requestChildDirectorySync()).finally(() => setBusy(false)); }}>
      {i18nText('ChildDirectory.retry')}
    </Button>
  </div>;
}
