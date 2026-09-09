import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendFileSync, mkdirSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, Menu, protocol, session, webContents } from 'electron';
import {
  createNimiElectronStandardApplicationMenuTemplate,
  isAllowedElectronRendererUrl,
  registerNimiElectronAppAssetProtocolScheme,
  registerNimiElectronAppBridge,
} from '@nimiplatform/kit/shell/electron/main';
import { createParentOSElectronCommandHandlers } from './parentos-command-handlers.js';
import { createParentOSHostClient } from './parentos-host-client.js';

const PARENTOS_APP_ID = 'nimi.parentos';
declare const __NIMI_ELECTRON_PRODUCTION__: boolean;
const IS_PRODUCTION_BUNDLE = typeof __NIMI_ELECTRON_PRODUCTION__ !== 'undefined'
  && __NIMI_ELECTRON_PRODUCTION__;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const appRoot = resolveAppRoot(currentDir);
const preloadPath = path.join(currentDir, 'preload.cjs');
const rendererDistIndex = path.join(appRoot, 'dist', 'index.html');
const rendererDistUrl = pathToFileURL(rendererDistIndex).toString();
const developmentRendererUrl = readDevelopmentRendererUrl();
const rendererUrl = developmentRendererUrl || rendererDistUrl;
const rendererLoadFailureUrl = createRendererLoadFailureUrl(developmentRendererUrl);
const rendererFailureLoads = new WeakMap<BrowserWindow, Promise<void>>();
let mainWindow: BrowserWindow | undefined;

bootLog('module-loaded');

app.setName('ParentOS');
installParentOSStandardApplicationMenu();
configureParentOSElectronChromiumRuntime();
registerNimiElectronAppAssetProtocolScheme(protocol);

void app.whenReady().then(bootstrapElectron).catch(handleElectronStartupFailure);

async function bootstrapElectron(): Promise<void> {
  const storageRoots = resolveParentOSStorageRoots();
  bootLog(`bootstrap:storage:${storageRoots.projectionRef}`);
  const hostClient = createParentOSHostClient({ appRoot, storageRoots });
  app.once('before-quit', () => hostClient.close());

  registerNimiElectronAppBridge({
    appId: PARENTOS_APP_ID,
    allowedRendererUrls: [rendererUrl],
    assetMediaPlatform: { protocol, webRequest: session.defaultSession.webRequest, webContents },
    ipcMain,
    appCommandHandlers: createParentOSElectronCommandHandlers({
      hostClient,
      getMainWindow: () => mainWindow,
    }),
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
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
  hardenParentOSWindowChrome(window);
  secureParentOSWindow(window);
  installRendererLoadFailureSurface(window);
  const rendererLoaded = await loadRenderer(window);
  bootLog(rendererLoaded ? 'create-window:renderer-loaded' : 'create-window:renderer-unavailable');
  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<boolean> {
  try {
    await window.loadURL(rendererUrl);
    return true;
  } catch (error) {
    bootLog(`renderer-load-failure:${errorMessage(error)}`);
    await showRendererLoadFailure(window);
    return false;
  }
}

function hardenParentOSWindowChrome(window: BrowserWindow): void {
  window.setAutoHideMenuBar(true);
  window.setMenuBarVisibility(false);
}

function secureParentOSWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isParentOSRendererUrl(url) && url !== rendererLoadFailureUrl) {
      event.preventDefault();
    }
  });
}

function installRendererLoadFailureSurface(window: BrowserWindow): void {
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (
      !isMainFrame
      || errorCode === -3
      || !isParentOSRendererUrl(validatedUrl)
      || window.isDestroyed()
    ) {
      return;
    }
    bootLog(`renderer-navigation-failure:${errorCode}:${errorDescription}`);
    void showRendererLoadFailure(window).catch((error) => {
      bootLog(`renderer-failure-surface-error:${errorMessage(error)}`);
    });
  });
}

function showRendererLoadFailure(window: BrowserWindow): Promise<void> {
  const active = rendererFailureLoads.get(window);
  if (active) {
    return active;
  }
  const load = window.loadURL(rendererLoadFailureUrl).finally(() => {
    if (rendererFailureLoads.get(window) === load) {
      rendererFailureLoads.delete(window);
    }
  });
  rendererFailureLoads.set(window, load);
  return load;
}

function createRendererLoadFailureUrl(developmentUrl: string): string {
  const instruction = developmentUrl
    ? `请确认 ParentOS renderer（${new URL(developmentUrl).host}）正在运行，然后重新加载。`
    : '请重新启动 ParentOS；如果问题持续，请重新构建或安装应用。';
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="no-referrer" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>成长底稿</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
      * { box-sizing: border-box; }
      body { align-items: center; background: #f4f7fb; color: #182033; display: flex; justify-content: center; margin: 0; min-height: 100vh; padding: 32px; }
      main { background: #fff; border: 1px solid #e5e9f1; border-radius: 20px; box-shadow: 0 18px 50px rgba(29, 45, 76, .1); max-width: 520px; padding: 36px; width: 100%; }
      p { color: #667085; line-height: 1.7; margin: 12px 0 0; }
      h1 { font-size: 24px; margin: 0; }
      a { background: #4db6d1; border-radius: 12px; color: #fff; display: inline-flex; font-weight: 650; margin-top: 24px; padding: 11px 18px; text-decoration: none; }
    </style>
  </head>
  <body>
    <main role="alert">
      <h1>界面资源未能加载</h1>
      <p>${instruction}</p>
      <a href="${rendererUrl}">重新加载</a>
    </main>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function allowedRendererUrls(): string[] {
  return [rendererUrl];
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

function readDevelopmentRendererUrl(): string {
  const prefix = '--nimi-dev-renderer-url=';
  const values = process.argv.filter((value) => value.startsWith(prefix));
  if (IS_PRODUCTION_BUNDLE && values.length > 0) {
    throw new Error('Production ParentOS does not accept development renderer arguments.');
  }
  if (values.length === 0) return '';
  if (values.length !== 1) throw new Error('Nimi development renderer URL must be singular.');
  const selected = values[0];
  if (!selected) throw new Error('Nimi development renderer URL is missing.');
  const parsed = new URL(selected.slice(prefix.length));
  if (
    parsed.protocol !== 'http:'
    || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname.toLowerCase())
    || !parsed.port
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Nimi development renderer URL must be exact loopback.');
  }
  return parsed.origin;
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
