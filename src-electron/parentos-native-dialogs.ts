import path from 'node:path';
import { app, dialog, shell, type BrowserWindow } from 'electron';
import type {
  NimiElectronFileDialogOpenPayload,
  NimiElectronFileDialogOpenResult,
} from '@nimiplatform/kit/shell/electron/main';

export type ParentOSNativeDialogHost = {
  readonly openFileDialog: (payload: NimiElectronFileDialogOpenPayload) => Promise<NimiElectronFileDialogOpenResult>;
  readonly revealInOs: (targetPath: string) => void;
  readonly exportDirectory: () => string;
};

export function createParentOSNativeDialogHost(input: {
  readonly getMainWindow: () => BrowserWindow | undefined;
}): ParentOSNativeDialogHost {
  return {
    openFileDialog: (payload) => openParentOSFileDialog(input.getMainWindow(), payload),
    revealInOs: (targetPath) => shell.showItemInFolder(path.resolve(targetPath)),
    exportDirectory: resolveParentOSExportDirectory,
  };
}

async function openParentOSFileDialog(
  window: BrowserWindow | undefined,
  payload: NimiElectronFileDialogOpenPayload,
): Promise<NimiElectronFileDialogOpenResult> {
  const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = [
    payload.kind === 'directory' ? 'openDirectory' : 'openFile',
  ];
  if (payload.multiple) {
    properties.push('multiSelections');
  }
  const options = {
    title: payload.title,
    filters: payload.filters?.map((filter) => ({
      name: filter.name,
      extensions: [...filter.extensions],
    })),
    properties,
  };
  const result = window && !window.isDestroyed()
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return {
    canceled: result.canceled,
    paths: result.filePaths.map((filePath) => path.resolve(filePath)),
  };
}

function resolveParentOSExportDirectory(): string {
  const fromEnv = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_EXPORT_DIRECTORY);
  return path.resolve(fromEnv || app.getPath('downloads'));
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
