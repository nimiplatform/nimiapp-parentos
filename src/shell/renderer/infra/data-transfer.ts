/** Complete backups stay in the native host; only status crosses the renderer bridge. */
import { invoke } from '../bridge/shell-command.js';

export type DataTransferProgress = { done: number; total: number };
export type DataTransferResult = {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  tableCount?: number;
  rowCount?: number;
  mediaCount?: number;
  cleanupPending?: boolean;
  summary: string;
};
type ProgressCallback = (progress: DataTransferProgress) => void;
interface BackupSummary { fileName: string; tableCount: number; rowCount: number; mediaCount: number; cleanupPending: boolean }

// @nimi-authority: rule.parentos.shell.r009
export async function exportAppData(onProgress?: ProgressCallback): Promise<DataTransferResult> {
  onProgress?.({ done: 0, total: 1 });
  const saved = await invoke<BackupSummary | null>('data_transfer_export_backup', {});
  if (!saved) return { ok: false, cancelled: true, summary: 'Export cancelled' };
  onProgress?.({ done: 1, total: 1 });
  return { ok: true, ...saved, summary: `${saved.rowCount} records and ${saved.mediaCount} media files exported` };
}

export async function importAppData(onProgress?: ProgressCallback): Promise<DataTransferResult> {
  onProgress?.({ done: 0, total: 1 });
  const restored = await invoke<BackupSummary | null>('data_transfer_restore_backup', {});
  if (!restored) return { ok: false, cancelled: true, summary: 'Import cancelled' };
  onProgress?.({ done: 1, total: 1 });
  return { ok: true, ...restored, summary: `${restored.rowCount} records and ${restored.mediaCount} media files restored` };
}
