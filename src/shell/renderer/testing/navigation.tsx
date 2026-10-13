import { useEffect, useState, type ReactNode } from 'react';
import { ParentOSNavigationProvider, useParentOSIntent, useParentOSPosition } from '../app-shell/app-navigation.js';
import { createParentOSNavigationOwner } from '../app-shell/navigation-owner.js';
import { useAppStore } from '../app-shell/app-store.js';
import type { ParentOSDestination, ParentOSIntent } from '../app-shell/navigation-destinations.js';
export function TestNavigation({ children, initial = { id: '/timeline' }, intent }: { children: ReactNode; initial?: ParentOSDestination; intent?: ParentOSIntent }) {
  const [owner] = useState(() => {
    const value = createParentOSNavigationOwner({ getChild: () => useAppStore.getState().activeChildId, hasChild: id => id === null || useAppStore.getState().children.some(child => child.childId === id), commitChild: (id, _destination, commit) => { commit(); useAppStore.getState().setActiveChildId(id); } });
    value.navigation.reset(initial); return value;
  });
  useEffect(() => { void owner.open(initial, intent, true); }, [owner, initial, intent]);
  return <ParentOSNavigationProvider owner={owner}>{children}</ParentOSNavigationProvider>;
}
export function NavigationProbe() {
  const position = useParentOSPosition(), intent = useParentOSIntent();
  return <div data-testid="navigation-probe">{JSON.stringify({ position, intent })}</div>;
}
