import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { NimiNavigationProvider, useNimiNavigationSnapshot } from '@nimiplatform/kit/ui/app-chrome';
import { createParentOSNavigationOwner } from './navigation-owner.js';
import { useAppStore } from './app-store.js';
import type { ParentOSDestination, ParentOSIntent } from './navigation-destinations.js';
export type { ParentOSDestination, ParentOSIntent } from './navigation-destinations.js';

const Context = createContext<ReturnType<typeof createParentOSNavigationOwner> | null>(null);
export function useParentOSNavigation() { const owner = useContext(Context); if (!owner) throw new Error('ParentOS navigation owner missing.'); return owner; }
export function useParentOSPosition() { return useNimiNavigationSnapshot<ParentOSDestination>().current.destination; }
export function useParentOSIntent() { const owner = useParentOSNavigation(); return useSyncExternalStore(owner.subscribeActions, owner.getIntent, owner.getIntent); }
export function useParentOSPageWorkAllowed() { const owner = useParentOSNavigation(); return useSyncExternalStore(owner.subscribeActions, owner.pageWorkAllowed, owner.pageWorkAllowed); }
export function ParentOSNavigationProvider({ children, owner: supplied }: { children: ReactNode; owner?: ReturnType<typeof createParentOSNavigationOwner> }) {
  const [owner] = useState(() => supplied ?? createParentOSNavigationOwner({
    getChild: () => useAppStore.getState().activeChildId,
    hasChild: id => id === null || useAppStore.getState().children.some(child => child.childId === id),
    commitChild: (id, _destination, commit) => unstable_batchedUpdates(() => { commit(); useAppStore.getState().setActiveChildId(id); }),
  }));
  const lifetime = useRef(0);
  useEffect(() => { const generation = ++lifetime.current; return () => { owner.reset(); queueMicrotask(() => { if (generation === lifetime.current && !supplied) owner.dispose(); }); }; }, [owner, supplied]);
  useEffect(() => {
    let previous = useAppStore.getState();
    return useAppStore.subscribe(current => {
      if ((previous.bootstrapReady && !current.bootstrapReady) || (current.familyId !== previous.familyId && !owner.isCommittingScope())
        || (current.activeChildId !== previous.activeChildId && !owner.isCommittingScope())) owner.reset();
      previous = current;
    });
  }, [owner]);
  return <Context.Provider value={owner}><NimiNavigationProvider controller={owner.navigation}>{children}</NimiNavigationProvider></Context.Provider>;
}
export function DestinationLink({ destination, intent, children, onClick, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { destination: ParentOSDestination; intent?: ParentOSIntent; children: ReactNode }) {
  const owner = useParentOSNavigation();
  return <a {...props} href="#" onClick={event => { onClick?.(event); if (event.defaultPrevented) return; event.preventDefault(); void owner.open(destination, intent); }}>{children}</a>;
}
