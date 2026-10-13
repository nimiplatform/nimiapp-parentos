import { createNimiNavigation, type NimiNavigationResult } from '@nimiplatform/kit/core/navigation';
import { validateParentOSDestination, type ParentOSDestination, type ParentOSIntent } from './navigation-destinations.js';

export type ParentOSLeaveGuard = (signal: AbortSignal, destination?: ParentOSDestination) => 'allow' | 'cancel' | 'busy' | Promise<'allow' | 'cancel' | 'busy'>;
// @nimi-authority: rule.parentos.shell.r011
export function createParentOSNavigationOwner(scope: {
  getChild: () => string | null;
  hasChild: (id: string | null) => boolean;
  commitChild: (id: string | null, destination: ParentOSDestination, commit: () => void) => void;
}) {
  let guard: ParentOSLeaveGuard | null = null, pending: AbortController | null = null, disposed = false, committingScope = false;
  let intent: { key: string; generation: number; value: ParentOSIntent } | null = null;
  let pageWorkEntry: { key: string; generation: number } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  async function leave(signal: AbortSignal, lease?: AbortController, destination?: ParentOSDestination): Promise<'allow' | 'cancel' | 'busy'> {
    if (pending) return 'busy';
    const transaction = lease ?? new AbortController(); pending = transaction;
    const abort = () => transaction.abort(); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
      const decision = await Promise.race([
        Promise.resolve().then(() => transaction.signal.aborted ? 'cancel' as const : guard?.(transaction.signal, destination) ?? 'allow'),
        new Promise<'cancel'>(resolve => transaction.signal.addEventListener('abort', () => resolve('cancel'), { once: true })),
      ]);
      return transaction.signal.aborted ? 'cancel' : decision;
    } finally { signal.removeEventListener('abort', abort); if (!lease && pending === transaction) pending = null; }
  }
  const navigation = createNimiNavigation<ParentOSDestination>({ initial: { id: '/timeline' }, validate: validateParentOSDestination, beforeLeave: context => leave(context.signal, undefined, context.to) });
  navigation.subscribe(() => {
    const current = navigation.getSnapshot();
    let changed = false;
    if (intent && (current.current.key !== intent.key || current.generation !== intent.generation)) { intent = null; changed = true; }
    if (pageWorkEntry && (current.current.key !== pageWorkEntry.key || current.generation !== pageWorkEntry.generation)) { pageWorkEntry = null; changed = true; }
    if (changed) emit();
  });
  const reset = (destination: ParentOSDestination = { id: '/timeline' }) => { pending?.abort(); pending = null; intent = null; pageWorkEntry = null; navigation.reset(destination); emit(); };
  const open = async (destination: ParentOSDestination, action?: ParentOSIntent, replace = false): Promise<NimiNavigationResult> => {
    let valid: ParentOSDestination;
    try { valid = validateParentOSDestination(destination); } catch (error) { return { status: 'invalid', error }; }
    if (action && ((action.kind === 'capture' && valid.id !== '/profile') || (action.kind === 'add-child' && valid.id !== '/settings/children')
      || (action.kind === 'vaccine-record' && valid.id !== '/profile/vaccines') || (action.kind === 'advisor-topic' && valid.id !== '/advisor'))) return { status: 'invalid', error: new Error('App action does not belong to the destination.') };
    const generation = navigation.getSnapshot().generation;
    const result = await (replace ? navigation.replace(valid) : navigation.push(valid));
    const current = navigation.getSnapshot();
    if (!disposed && generation === current.generation && (result.status === 'committed' || result.status === 'unchanged') && JSON.stringify(current.current.destination) === JSON.stringify(valid)) {
      // Explicit App entry may start its existing page work. History and a
      // fresh document only read; they never replay this ephemeral permission.
      pageWorkEntry = { key: current.current.key, generation };
      if (action) intent = { key: current.current.key, generation, value: action };
      emit();
    }
    return result;
  };
  async function switchChild(id: string | null, destination: ParentOSDestination = { id: '/timeline' }, prepare?: (signal: AbortSignal) => Promise<void | (() => void)>): Promise<NimiNavigationResult> {
    if (disposed) return { status: 'disposed' };
    if (pending || navigation.getSnapshot().transitionState === 'pending') return { status: 'busy' };
    if (!prepare && !scope.hasChild(id)) return { status: 'invalid', error: new Error('Child is unavailable.') };
    if (!prepare && scope.getChild() === id) return open(destination);
    const valid = validateParentOSDestination(destination), original = scope.getChild(), generation = navigation.getSnapshot().generation;
    const signal = new AbortController();
    try {
      const decision = await leave(signal.signal, signal);
      if (disposed || generation !== navigation.getSnapshot().generation || original !== scope.getChild()) return { status: 'invalidated' };
      if (decision !== 'allow') return { status: decision === 'busy' ? 'busy' : 'cancelled' };
      const prepared = prepare ? await prepare(signal.signal) : undefined;
      if (signal.signal.aborted || disposed || generation !== navigation.getSnapshot().generation || original !== scope.getChild()) return { status: 'invalidated' };
      if (!scope.hasChild(id)) return { status: 'invalid', error: new Error('Child is unavailable.') };
      committingScope = true;
      try { scope.commitChild(id, valid, () => { reset(valid); prepared?.(); }); } finally { committingScope = false; }
      const committed = navigation.getSnapshot(); pageWorkEntry = { key: committed.current.key, generation: committed.generation }; emit();
      return { status: 'committed' };
    } catch (error) { return { status: 'failed', error }; }
    finally { if (pending === signal) pending = null; }
  }
  return {
    navigation, open, reset, switchChild, isCommittingScope: () => committingScope,
    registerLeaveGuard(value: ParentOSLeaveGuard) { guard = value; return () => { if (guard === value) guard = null; }; },
    subscribeActions(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getIntent: () => intent?.value ?? null,
    pageWorkAllowed: () => pageWorkEntry !== null,
    consumeIntent(value: ParentOSIntent) { if (intent?.value !== value) return false; intent = null; emit(); return true; },
    dispose() { disposed = true; reset(); guard = null; navigation.dispose(); listeners.clear(); },
  };
}
