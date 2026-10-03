import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportAppData, importAppData } from './data-transfer.js';

const shellMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge/shell-command.js', () => shellMocks);

describe('data-transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('exports a complete backup without putting archive content in the renderer', async () => {
    shellMocks.invoke.mockResolvedValue({ fileName: 'backup.parentos', tableCount: 29, rowCount: 2, mediaCount: 3 });
    const result = await exportAppData();
    expect(result).toMatchObject({ ok: true, fileName: 'backup.parentos', mediaCount: 3 });
    expect(shellMocks.invoke).toHaveBeenCalledExactlyOnceWith('data_transfer_export_backup', {});
  });

  it('reports save-dialog cancellation', async () => {
    shellMocks.invoke.mockResolvedValue(null);
    await expect(exportAppData()).resolves.toMatchObject({ ok: false, cancelled: true });
  });

  it('reports the native restore result for the settings reload flow', async () => {
    shellMocks.invoke.mockResolvedValue({ fileName: 'backup.parentos', tableCount: 29, rowCount: 2, mediaCount: 3 });
    const result = await importAppData();
    expect(result).toMatchObject({ ok: true, mediaCount: 3 });
    expect(shellMocks.invoke).toHaveBeenCalledExactlyOnceWith('data_transfer_restore_backup', {});
  });

  it('propagates native restore failure', async () => {
    shellMocks.invoke.mockRejectedValue(new Error('corrupted media'));
    await expect(importAppData()).rejects.toThrow('corrupted media');
  });

  it('reports open-dialog cancellation', async () => {
    shellMocks.invoke.mockResolvedValue(null);
    await expect(importAppData()).resolves.toMatchObject({ ok: false, cancelled: true });
  });
});
