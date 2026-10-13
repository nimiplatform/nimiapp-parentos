import { describe, expect, it } from 'vitest';
import { createParentOSNavigationOwner } from './navigation-owner.js';
import type { ParentOSDestination } from './navigation-destinations.js';

function setup() {
  let child: string | null = 'a';
  const owner = createParentOSNavigationOwner({ getChild: () => child, hasChild: id => id === null || ['a', 'b'].includes(id), commitChild: (id, _destination, commit) => { commit(); child = id; } });
  return { owner, child: () => child };
}
describe('ParentOS leave and scope transaction', () => {
  it('retains the child and both history sides on cancel; allowed switching resets together', async () => {
    const { owner, child } = setup();
    await owner.open({ id: '/profile' }); await owner.open({ id: '/journal' });
    owner.registerLeaveGuard(() => 'cancel');
    const previous = owner.navigation.getSnapshot();
    expect(await owner.switchChild('b')).toEqual({ status: 'cancelled' });
    expect(child()).toBe('a'); expect(owner.navigation.getSnapshot()).toEqual(previous);
    owner.registerLeaveGuard(() => 'allow');
    expect(await owner.switchChild('b', { id: '/reminders', focus: { ruleId: 'PO-REM-GRO-002', repeatIndex: 2 } })).toEqual({ status: 'committed' });
    expect(child()).toBe('b'); expect(owner.navigation.getSnapshot().canGoBack).toBe(false);
    expect(owner.navigation.getSnapshot().current.destination).toEqual({ id: '/reminders', focus: { ruleId: 'PO-REM-GRO-002', repeatIndex: 2 } });
  });
  it('shares busy ownership in both directions and never queues a second action', async () => {
    const { owner, child } = setup();
    let decide!: (value: 'allow') => void;
    owner.registerLeaveGuard(() => new Promise(resolve => { decide = resolve; }));
    const navigate = owner.open({ id: '/journal' }); await Promise.resolve(); await Promise.resolve();
    expect(await owner.switchChild('b')).toEqual({ status: 'busy' }); decide('allow'); await navigate;
    const switching = owner.switchChild('b'); await Promise.resolve(); await Promise.resolve();
    expect(await owner.open({ id: '/settings' })).toEqual({ status: 'busy' });
    expect(child()).toBe('a'); decide('allow'); await switching;
    expect(owner.navigation.getSnapshot().current.destination).toEqual({ id: '/timeline' });
  });
  it('a failed save/prepare retains the old scope; forced reset defeats a late allowed guard', async () => {
    const { owner, child } = setup();
    await owner.open({ id: '/journal' });
    expect((await owner.switchChild('b', { id: '/timeline' }, async () => { throw new Error('storage failure'); })).status).toBe('failed');
    expect(child()).toBe('a'); expect(owner.navigation.getSnapshot().current.destination.id).toBe('/journal');
    let decide!: (value: 'allow') => void;
    owner.registerLeaveGuard(() => new Promise(resolve => { decide = resolve; }));
    const switching = owner.switchChild('b'); await Promise.resolve(); await Promise.resolve();
    owner.reset(); decide('allow'); expect((await switching).status).toBe('invalidated');
    expect(child()).toBe('a'); expect(owner.navigation.getSnapshot().canGoBack).toBe(false);
  });
  it('holds its lease through actual App preparation and aborts a late preparation on forced invalidation', async () => {
    const { owner, child } = setup(); let finish!: () => void;
    const switching = owner.switchChild('b', { id: '/settings/children' }, async () => new Promise<void>(resolve => { finish = resolve; }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(await owner.open({ id: '/profile' })).toEqual({ status: 'busy' });
    owner.reset(); finish(); expect((await switching).status).toBe('invalidated'); expect(child()).toBe('a');
  });
  it('rejects business snapshots and invalid references atomically, and canonicalizes the retained redirect', async () => {
    const { owner } = setup();
    expect((await owner.navigation.push({ id: '/advisor', transcript: 'private' } as unknown as ParentOSDestination)).status).toBe('invalid');
    expect(owner.navigation.getSnapshot().canGoBack).toBe(false);
    expect((await owner.open({ id: '/profile', focus: 'missing-group' } as unknown as ParentOSDestination)).status).toBe('invalid');
    await owner.open({ id: '/profile/report-upload' }); expect(owner.navigation.getSnapshot().current.destination).toEqual({ id: '/profile' });
  });
  it('consumes an App action once and drops an unconsumed action when leaving; back/forward never replays it', async () => {
    const { owner } = setup();
    const action = { kind: 'advisor-topic' as const, topic: 'Explicit question' };
    await owner.open({ id: '/advisor' }, action); expect(owner.getIntent()).toBe(action);
    expect(owner.consumeIntent(action)).toBe(true); expect(owner.consumeIntent(action)).toBe(false);
    await owner.open({ id: '/profile' }); await owner.navigation.back(); expect(owner.getIntent()).toBeNull();
    await owner.open({ id: '/advisor' }, action); await owner.navigation.forward();
    expect(owner.getIntent()).toBeNull();
  });
  it('attaches an action to a parameterized destination after the controller normalizes key order', async () => {
    const { owner } = setup(), action = { kind: 'capture' as const, groupId: 'growth' };
    await owner.open({ id: '/profile', focus: 'growth' }, action);
    expect(owner.getIntent()).toBe(action);
  });
  it('starts page work only on explicit App entry; a fresh window, back, forward and forced reset only read', async () => {
    const { owner } = setup(); expect(owner.pageWorkAllowed()).toBe(false);
    await owner.open({ id: '/profile' }); expect(owner.pageWorkAllowed()).toBe(true);
    await owner.open({ id: '/journal' }); await owner.navigation.back(); expect(owner.pageWorkAllowed()).toBe(false);
    await owner.navigation.forward(); expect(owner.pageWorkAllowed()).toBe(false);
    await owner.open({ id: '/journal' }); expect(owner.pageWorkAllowed()).toBe(true);
    owner.reset(); expect(owner.pageWorkAllowed()).toBe(false);
  });
});
