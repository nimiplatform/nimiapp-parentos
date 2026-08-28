import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportAppData, importAppData, parseExportEnvelope } from './data-transfer.js';

const shellMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
const sqliteMocks = vi.hoisted(() => ({
  getChildren: vi.fn(),
  getFamily: vi.fn(),
}));
const storeState = vi.hoisted(() => ({
  activeChildId: 'child-before' as string | null,
  setActiveChildId: vi.fn(),
  setChildren: vi.fn(),
  setFamilyId: vi.fn(),
}));

vi.mock('../bridge/shell-command.js', () => shellMocks);
vi.mock('../bridge/sqlite-bridge.js', () => sqliteMocks);
vi.mock('../bridge/mappers.js', () => ({ mapChildRow: (row: unknown) => row }));
vi.mock('../app-shell/app-store.js', () => ({
  useAppStore: { getState: () => storeState },
}));

const childRow = {
  childId: 'child-restored',
  familyId: 'family-restored',
  displayName: 'Restored child',
  gender: 'female',
  birthDate: '2020-01-01',
  birthWeightKg: null,
  birthHeightCm: null,
  birthHeadCircCm: null,
  avatarPath: null,
  nurtureMode: 'balanced',
  nurtureModeOverrides: null,
  allergies: null,
  medicalNotes: null,
  recorderProfiles: null,
  createdAt: '2026-08-28T00:00:00Z',
  updatedAt: '2026-08-28T00:00:00Z',
};

function buildEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 'parentos-structured-backup-v1',
    appId: 'nimi.parentos',
    exportedAt: '2026-08-28T00:00:00Z',
    tables: {
      families: [{
        familyId: 'family-restored',
        displayName: 'Restored family',
        createdAt: '2026-08-28T00:00:00Z',
        updatedAt: '2026-08-28T00:00:00Z',
      }],
      children: [childRow],
    },
    ...overrides,
  };
}

describe('data-transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeChildId = 'child-before';
    sqliteMocks.getFamily.mockResolvedValue({
      familyId: 'family-restored',
      displayName: 'Restored family',
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
    });
    sqliteMocks.getChildren.mockResolvedValue([childRow]);
  });

  it('exports the native structured snapshot through a one-shot save dialog', async () => {
    const envelope = buildEnvelope();
    shellMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'export_structured_backup') return envelope;
      if (command === 'data_transfer_write_export_file') return { fileName: 'backup.json' };
      throw new Error(`unexpected command ${command}`);
    });

    const result = await exportAppData();

    expect(result).toMatchObject({ ok: true, fileName: 'backup.json' });
    expect(shellMocks.invoke).toHaveBeenNthCalledWith(1, 'export_structured_backup', {
      exportedAt: expect.any(String),
    });
    const savePayload = shellMocks.invoke.mock.calls[1]?.[1] as { content: string };
    expect(JSON.parse(savePayload.content)).toEqual(envelope);
  });

  it('reports save-dialog cancellation without mutating data', async () => {
    shellMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'export_structured_backup') return buildEnvelope();
      if (command === 'data_transfer_write_export_file') return null;
      throw new Error(`unexpected command ${command}`);
    });

    await expect(exportAppData()).resolves.toMatchObject({ ok: false, cancelled: true });
  });

  it('rejects malformed or cross-app envelopes before native restore', () => {
    expect(() => parseExportEnvelope('{bad json')).toThrow(/valid JSON/);
    expect(() => parseExportEnvelope(JSON.stringify(buildEnvelope({ formatVersion: 'legacy-v0' })))).toThrow(/formatVersion/);
    expect(() => parseExportEnvelope(JSON.stringify(buildEnvelope({ appId: 'other.app' })))).toThrow(/appId/);
    expect(() => parseExportEnvelope(JSON.stringify(buildEnvelope({ extra: true })))).toThrow(/fields must be exactly/);
    expect(() => parseExportEnvelope(JSON.stringify(buildEnvelope({
      tables: { families: [{ familyId: { nested: true } }] },
    })))).toThrow(/JSON scalar/);
  });

  it('restores through one atomic native command and refreshes shell state', async () => {
    const envelope = buildEnvelope();
    shellMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'data_transfer_read_import_file') return JSON.stringify(envelope);
      if (command === 'import_structured_backup') return { tableCount: 27, rowCount: 2 };
      throw new Error(`unexpected command ${command}`);
    });

    const result = await importAppData();

    expect(result).toEqual({
      ok: true,
      tableCount: 27,
      rowCount: 2,
      summary: '27 tables, 2 rows restored',
    });
    expect(shellMocks.invoke).toHaveBeenNthCalledWith(2, 'import_structured_backup', { envelope });
    expect(sqliteMocks.getFamily).toHaveBeenCalledOnce();
    expect(sqliteMocks.getChildren).toHaveBeenCalledWith('family-restored');
    expect(storeState.setFamilyId).toHaveBeenCalledWith('family-restored');
    expect(storeState.setChildren).toHaveBeenCalledWith([childRow]);
    expect(storeState.setActiveChildId).toHaveBeenCalledWith('child-restored');
  });

  it('does not refresh shell state when the native transaction rejects the backup', async () => {
    shellMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'data_transfer_read_import_file') return JSON.stringify(buildEnvelope());
      if (command === 'import_structured_backup') throw new Error('foreign-key verification failed');
      throw new Error(`unexpected command ${command}`);
    });

    await expect(importAppData()).rejects.toThrow(/foreign-key verification failed/);
    expect(sqliteMocks.getFamily).not.toHaveBeenCalled();
    expect(storeState.setFamilyId).not.toHaveBeenCalled();
  });

  it('reports open-dialog cancellation without invoking restore', async () => {
    shellMocks.invoke.mockResolvedValue(null);

    await expect(importAppData()).resolves.toMatchObject({ ok: false, cancelled: true });
    expect(shellMocks.invoke).toHaveBeenCalledTimes(1);
  });
});
