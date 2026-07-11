import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendFileSync, mkdirSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { NIMI_INSTALLED_NIMI_APP_STANDARD_SHELL_CAPABILITY_SET_ID } from '@nimiplatform/kit/shell/capabilities';
import {
  createNimiElectronInstalledHost,
  createNimiElectronStandardApplicationMenuTemplate,
  isAllowedElectronRendererUrl,
  registerNimiElectronRuntimeBridge,
} from '@nimiplatform/kit/shell/electron/main';

const PARENTOS_APP_ID = 'nimi.parentos';
const PARENTOS_RENDERER_DEV_PORT = 1426;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const appRoot = resolveAppRoot(currentDir);
const preloadPath = path.join(currentDir, 'preload.cjs');
const rendererDistIndex = path.join(appRoot, 'dist', 'index.html');
const rendererDistUrl = pathToFileURL(rendererDistIndex).toString();
const rendererDevUrl = `http://127.0.0.1:${PARENTOS_RENDERER_DEV_PORT}`;
const runtimeEndpoint = '127.0.0.1:46371';

bootLog('module-loaded');

app.setName('ParentOS');
installParentOSStandardApplicationMenu();
configureParentOSElectronChromiumRuntime();

void app.whenReady().then(bootstrapElectron).catch(handleElectronStartupFailure);

async function bootstrapElectron(): Promise<void> {
  const storageRoots = resolveParentOSStorageRoots();
  bootLog(`bootstrap:storage:${storageRoots.projectionRef}`);

  registerNimiElectronRuntimeBridge({
    appId: PARENTOS_APP_ID,
    runtimeEndpoint,
    allowedOrigins: allowedRendererOrigins(),
    allowedRendererUrls: allowedRendererUrls(),
    ipcMain,
    standardShellHost: {
      capabilitySetRef: NIMI_INSTALLED_NIMI_APP_STANDARD_SHELL_CAPABILITY_SET_ID,
      installedHost: createNimiElectronInstalledHost(),
    },
  });

  await createMainWindow();
  bootLog('bootstrap:window-created');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}

function handleElectronStartupFailure(error: unknown): void {
  bootLog(`startup-failure:${errorMessage(error)}`);
  process.stderr.write(`${error instanceof Error ? error.message : String(error || 'ParentOS Electron startup failed')}\n`);
  app.quit();
}

function resolveAppRoot(electronDir: string): string {
  if (path.basename(electronDir) === 'dist' && path.basename(path.dirname(electronDir)) === 'src-electron') {
    return path.resolve(electronDir, '..', '..');
  }
  if (path.basename(electronDir) === 'src-electron' && path.basename(path.dirname(electronDir)) === 'dist-electron') {
    return path.resolve(electronDir, '..', '..');
  }
  return path.resolve(electronDir, '..');
}

function configureParentOSElectronChromiumRuntime(): void {
  app.commandLine.appendSwitch('disable-background-networking');
  const remoteDebuggingPort = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_REMOTE_DEBUGGING_PORT);
  if (!app.isPackaged && remoteDebuggingPort) {
    app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort);
    bootLog(`remote-debugging-port:${remoteDebuggingPort}`);
  }
}

function installParentOSStandardApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(
    createNimiElectronStandardApplicationMenuTemplate({ appName: 'ParentOS' }),
  ));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

async function createMainWindow(): Promise<BrowserWindow> {
  bootLog('create-window:start');
  const window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    title: 'ParentOS',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  bootLog('create-window:constructed');
  hardenParentOSWindowChrome(window);
  secureParentOSWindow(window);
  await loadRenderer(window);
  bootLog('create-window:renderer-loaded');
  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const rendererUrl = resolveRendererUrl();
  if (rendererUrl !== rendererDistUrl) {
    await window.loadURL(rendererUrl);
    return;
  }
  await window.loadURL(rendererDistUrl);
}

function hardenParentOSWindowChrome(window: BrowserWindow): void {
  window.setAutoHideMenuBar(true);
  window.setMenuBarVisibility(false);
}

function secureParentOSWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isParentOSRendererUrl(url)) {
      event.preventDefault();
    }
  });
}

function allowedRendererOrigins(): string[] {
  return [...new Set(allowedRendererUrls().map(originForRendererUrl))];
}

function originForRendererUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === 'file:' ? 'file://' : parsed.origin;
}

function allowedRendererUrls(): string[] {
  return [resolveRendererUrl()];
}

function isParentOSRendererUrl(url: string): boolean {
  return isAllowedElectronRendererUrl(url, allowedRendererUrls());
}

type ParentOSStorageRoots = {
  readonly durableDataRoot: string;
  readonly cacheRoot: string;
  readonly tempRoot: string;
  readonly projectionRef: string;
};

function resolveParentOSStorageRoots(): ParentOSStorageRoots {
  const appRoot = path.join(app.getPath('appData'), 'Nimi', 'ParentOS');
  const durableDataRoot = path.join(appRoot, 'data');
  const cacheRoot = path.join(appRoot, 'cache');
  const tempRoot = path.join(appRoot, 'tmp');
  for (const root of [durableDataRoot, cacheRoot, tempRoot]) {
    mkdirSync(root, { recursive: true });
  }
  return {
    durableDataRoot,
    cacheRoot,
    tempRoot,
    projectionRef: 'parentos-electron-os-app-data-v1',
  };
}

function resolveRendererUrl(): string {
  if (app.isPackaged) {
    return rendererDistUrl;
  }
  return normalizeText(process.env.NIMI_PARENTOS_ELECTRON_RENDERER_URL) === rendererDevUrl
    ? rendererDevUrl
    : rendererDistUrl;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'unknown error');
}

function bootLog(message: string): void {
  const logPath = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_BOOT_LOG);
  if (!logPath) {
    return;
  }
  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {
    // Boot logging is diagnostic-only and must not affect shell startup.
  }
}
