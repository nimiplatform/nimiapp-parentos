import { describe, expect, it, vi } from 'vitest';
import { createChildDirectoryPublisher, type DirectoryChild } from './child-directory.js';

function harness() {
  const list = vi.fn().mockResolvedValue({ records: [], nextPageToken: null });
  const put = vi.fn().mockResolvedValue({ record: { source: { kind: 'app', appId: 'nimi.parentos', sourceRef: 'own-source' } } });
  const reconcileReminders = vi.fn().mockResolvedValue(undefined);
  const report = vi.fn();
  let children: readonly DirectoryChild[] = [{ childId: 'a', displayName: 'A' }, { childId: 'b', displayName: 'B' }];
  const readChildren = vi.fn(async () => children);
  const status = vi.fn().mockResolvedValue({ sessionBound: true });
  const publisher = createChildDirectoryPublisher({ client: { activity: { list, put }, auth: { status } } as never, readChildren, title: () => 'Children', report, reconcileReminders });
  return { list, put, report, status, readChildren, publisher, reconcileReminders, setChildren: (next: typeof children) => { children = next; } };
}

describe('full directory publication', () => {
  it('uses its publication source and reports incomplete reminder withdrawal until retry succeeds', async () => {
    const h = harness();
    h.setChildren([]);
    h.reconcileReminders.mockRejectedValueOnce(new Error('withdrawal failed'));
    await h.publisher.sync();
    expect(h.reconcileReminders).toHaveBeenCalledWith('own-source', expect.any(Function));
    expect(h.report).toHaveBeenLastCalledWith('failed');
    await h.publisher.sync();
    expect(h.report).toHaveBeenLastCalledWith('synced');
  });
  it('publishes children without consulting reminders and replaces rename, removal and empty-family snapshots', async () => {
    const h = harness();
    await h.publisher.sync();
    expect(h.put.mock.calls[0]![0].data).toEqual({ children: [{ childId: 'a', childName: 'A' }, { childId: 'b', childName: 'B' }] });
    h.setChildren([{ childId: 'a', displayName: 'Renamed' }]);
    await h.publisher.sync();
    expect(h.put.mock.calls[1]![0].data).toEqual({ children: [{ childId: 'a', childName: 'Renamed' }] });
    expect(h.put.mock.calls[1]![0].revision).toBeGreaterThan(h.put.mock.calls[0]![0].revision);
    h.setChildren([]);
    await h.publisher.sync();
    expect(h.put.mock.calls[2]![0]).toMatchObject({ key: 'child-directory', kind: 'activity', attention: false, data: { children: [] } });
  });
  it('does not publish an empty list on read failure and allows retry after permission failure', async () => {
    const h = harness();
    h.readChildren.mockRejectedValueOnce(new Error('DB read failed'));
    await h.publisher.sync();
    expect(h.put).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenLastCalledWith('failed');
    h.put.mockRejectedValueOnce(new Error('permission denied'));
    await h.publisher.sync();
    expect(h.report).toHaveBeenLastCalledWith('failed');
    await h.publisher.sync();
    expect(h.report).toHaveBeenLastCalledWith('synced');
  });
  it('reads all held pages for a revision and stops late effects when the session ends', async () => {
    const h = harness();
    h.list.mockResolvedValueOnce({ records: [], nextPageToken: 'next' }).mockResolvedValueOnce({
      records: [{ source: { kind: 'app', appId: 'nimi.parentos' }, key: 'child-directory', revision: 9000000000000 }],
      nextPageToken: null,
    });
    await h.publisher.sync();
    expect(h.put.mock.calls[0]![0].revision).toBe(9000000000001);
    let resolve!: (value: DirectoryChild[]) => void;
    h.readChildren.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const next = h.publisher.sync();
    await Promise.resolve();
    await Promise.resolve();
    h.publisher.stop();
    resolve([]);
    await next;
    expect(h.put).toHaveBeenCalledTimes(1);
  });
  it('establishes a real Host session before publishing and refuses an unbound session', async () => {
    const h = harness();
    h.status.mockResolvedValueOnce({ sessionBound: false, reasonCode: 'runtime-unavailable' });
    await h.publisher.sync();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.put).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenLastCalledWith('failed');
    await h.publisher.sync();
    expect(h.put).toHaveBeenCalledTimes(1);
  });
});
