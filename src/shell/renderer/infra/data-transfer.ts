/**
 * User-initiated local structured-data backup and restore.
 *
 * SQLite owns the snapshot, exhaustive schema validation, replacement
 * transaction, rollback, and foreign-key verification. Electron owns the
 * one-shot file dialogs. The renderer never receives a reusable file path and
 * never performs sequential per-table writes.
 */

import { useAppStore } from '../app-shell/app-store.js';
import { mapChildRow } from '../bridge/mappers.js';
import { getChildren, getFamily } from '../bridge/sqlite-bridge.js';
import { invoke } from '../bridge/shell-command.js';
import { isoNow } from '../bridge/ulid.js';

// @nimi-authority: rule.parentos.shell.r009

export const PARENTOS_EXPORT_FORMAT_VERSION = 'parentos-structured-backup-v1';
export const PARENTOS_APP_ID = 'nimi.parentos';

type JsonScalar = null | string | number;
type StructuredRow = Record<string, JsonScalar>;

export interface ParentOSExportEnvelope {
  formatVersion: typeof PARENTOS_EXPORT_FORMAT_VERSION;
  appId: typeof PARENTOS_APP_ID;
  exportedAt: string;
  tables: Record<string, StructuredRow[]>;
}

interface StructuredBackupImportSummary {
  tableCount: number;
  rowCount: number;
}

export type DataTransferProgress = { done: number; total: number };

export type DataTransferResult = {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  tableCount?: number;
  rowCount?: number;
  summary: string;
};

type ProgressCallback = (progress: DataTransferProgress) => void;

export async function exportAppData(onProgress?: ProgressCallback): Promise<DataTransferResult> {
  onProgress?.({ done: 0, total: 1 });
  const envelope = await invoke<ParentOSExportEnvelope>('export_structured_backup', {
    exportedAt: isoNow(),
  });
  assertEnvelopeShape(envelope);
  onProgress?.({ done: 1, total: 1 });

  const saved = await invoke<{ fileName: string } | null>('data_transfer_write_export_file', {
    content: JSON.stringify(envelope, null, 2),
    defaultFilename: defaultBackupFilename(),
  });
  if (!saved) {
    return { ok: false, cancelled: true, summary: 'Export cancelled' };
  }
  const counts = countEnvelope(envelope);
  return {
    ok: true,
    fileName: saved.fileName,
    ...counts,
    summary: `${counts.tableCount} tables, ${counts.rowCount} rows exported`,
  };
}

export async function importAppData(onProgress?: ProgressCallback): Promise<DataTransferResult> {
  const content = await invoke<string | null>('data_transfer_read_import_file', {});
  if (content == null) {
    return { ok: false, cancelled: true, summary: 'Import cancelled' };
  }

  const envelope = parseExportEnvelope(content);
  onProgress?.({ done: 0, total: 1 });
  const summary = await invoke<StructuredBackupImportSummary>('import_structured_backup', {
    envelope,
  });
  onProgress?.({ done: 1, total: 1 });
  await refreshShellStateAfterRestore();

  return {
    ok: true,
    tableCount: summary.tableCount,
    rowCount: summary.rowCount,
    summary: `${summary.tableCount} tables, ${summary.rowCount} rows restored`,
  };
}

export function parseExportEnvelope(content: string): ParentOSExportEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `ParentOS backup is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  assertEnvelopeShape(parsed);
  return parsed;
}

function assertEnvelopeShape(value: unknown): asserts value is ParentOSExportEnvelope {
  const envelope = asRecord(value, 'ParentOS backup envelope');
  const expectedKeys = ['appId', 'exportedAt', 'formatVersion', 'tables'];
  const actualKeys = Object.keys(envelope).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`ParentOS backup envelope fields must be exactly: ${expectedKeys.join(', ')}`);
  }
  if (envelope.formatVersion !== PARENTOS_EXPORT_FORMAT_VERSION) {
    throw new Error(`Unsupported ParentOS backup formatVersion: ${String(envelope.formatVersion)}`);
  }
  if (envelope.appId !== PARENTOS_APP_ID) {
    throw new Error(`ParentOS backup appId must be ${PARENTOS_APP_ID}`);
  }
  if (typeof envelope.exportedAt !== 'string' || envelope.exportedAt.trim() === '') {
    throw new Error('ParentOS backup exportedAt must be a non-empty string');
  }

  const tables = asRecord(envelope.tables, 'ParentOS backup tables');
  for (const [tableName, rows] of Object.entries(tables)) {
    if (tableName.trim() === '' || !Array.isArray(rows)) {
      throw new Error(`ParentOS backup table ${tableName || '<empty>'} must be an array`);
    }
    rows.forEach((row, rowIndex) => {
      const record = asRecord(row, `${tableName} row ${rowIndex}`);
      for (const [column, cell] of Object.entries(record)) {
        if (cell !== null && typeof cell !== 'string' && typeof cell !== 'number') {
          throw new Error(`ParentOS backup cell ${tableName}.${column} must be a JSON scalar`);
        }
        if (typeof cell === 'number' && !Number.isFinite(cell)) {
          throw new Error(`ParentOS backup cell ${tableName}.${column} must be finite`);
        }
      }
    });
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function refreshShellStateAfterRestore(): Promise<void> {
  const store = useAppStore.getState();
  const previousActiveChildId = store.activeChildId;
  const family = await getFamily();
  if (!family) {
    store.setFamilyId(null);
    store.setChildren([]);
    store.setActiveChildId(null);
    return;
  }

  const children = (await getChildren(family.familyId)).map(mapChildRow);
  store.setFamilyId(family.familyId);
  store.setChildren(children);
  store.setActiveChildId(
    children.some((child) => child.childId === previousActiveChildId)
      ? previousActiveChildId
      : children[0]?.childId ?? null,
  );
}

function countEnvelope(envelope: ParentOSExportEnvelope): { tableCount: number; rowCount: number } {
  const rowCount = Object.values(envelope.tables)
    .reduce((total, rows) => total + rows.length, 0);
  return { tableCount: Object.keys(envelope.tables).length, rowCount };
}

function defaultBackupFilename(): string {
  return `parentos-structured-backup-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json`;
}
