import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendFileSync, mkdirSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { app, BrowserWindow, ipcMain, Menu, protocol, shell } from 'electron';
import {
  assertOpaqueElectronLocalAgentRef,
  createElectronShellFileProtocolHost,
  createNimiElectronFileAIConfigStore,
  createNimiElectronStandardApplicationMenuTemplate,
  isAllowedElectronRendererUrl,
  registerNimiElectronRuntimeBridge,
  type NimiElectronRuntimeTrustedCallerMode,
  type NimiElectronStandardDataRootBinding,
} from '@nimiplatform/kit/shell/electron/main';
import {
  Runtime,
  createNimiRuntimeAppSessionMetadataProvider,
  createNimiRuntimeFullAppRegistration,
  resolveNimiRuntimeAppStorageRoots,
} from '@nimiplatform/sdk/runtime';
import { createParentOSElectronTrustedRuntimeMetadataProvider } from './runtime-auth.js';
import { parentosElectronHostCommandPolicy } from './parentos-command-policy.js';
import { createParentOSNativeDialogHost } from './parentos-native-dialogs.js';
import { createParentOSElectronCommandHandlers } from './parentos-command-handlers.js';
import { createParentOSHostClient } from './parentos-host-client.js';

const PARENTOS_APP_ID = 'nimi.parentos';
const PARENTOS_RUNTIME_APP_INSTANCE_ID = 'nimi.parentos.local-developer';
const PARENTOS_RUNTIME_DEVICE_ID = 'parentos-local-developer-device';
const PARENTOS_RENDERER_DEV_PORT = 1426;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const appRoot = resolveAppRoot(currentDir);
const preloadPath = path.join(currentDir, 'preload.cjs');
const rendererDistIndex = path.join(appRoot, 'dist', 'index.html');
const rendererDistUrl = pathToFileURL(rendererDistIndex).toString();
const rendererUrl = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_RENDERER_URL);
const runtimeEndpoint = normalizeText(process.env.NIMI_RUNTIME_GRPC_ADDR)
  || normalizeText(process.env.NIMI_PARENTOS_ELECTRON_RUNTIME_ENDPOINT)
  || '127.0.0.1:46371';
let mainWindow: BrowserWindow | undefined;

bootLog('module-loaded');
createParentOSFileProtocolHost([]).registerPrivilegedSchemes();

app.setName('ParentOS');
installParentOSStandardApplicationMenu();
configureParentOSElectronChromiumRuntime();

void app.whenReady().then(bootstrapElectron).catch(handleElectronStartupFailure);

async function bootstrapElectron(): Promise<void> {
  bootLog('bootstrap:start');
  const standardStorageRoots = await resolveStandardDataRoot();
  bootLog(`bootstrap:storage:${standardStorageRoots.projectionRef}`);
  const localAssetRoots = resolveStandardLocalAssetRoots(standardStorageRoots.durableDataRoot);
  const fileProtocolHost = createParentOSFileProtocolHost(localAssetRoots);
  fileProtocolHost.registerProtocolHandler();
  const nativeDialogs = createParentOSNativeDialogHost({ getMainWindow: () => mainWindow });
  const hostClient = createParentOSHostClient({ appRoot, storageRoots: standardStorageRoots });
  app.once('before-quit', () => {
    hostClient.close();
  });
  const localAgentIdentity = resolveParentOSElectronLocalAgentIdentity();

  registerNimiElectronRuntimeBridge({
    appId: PARENTOS_APP_ID,
    runtimeEndpoint,
    allowedOrigins: allowedRendererOrigins(),
    allowedRendererUrls: allowedRendererUrls(),
    ipcMain,
    trustedRuntimeMetadataProvider: createParentOSElectronTrustedRuntimeMetadataProvider({
      appId: PARENTOS_APP_ID,
      runtimeEndpoint,
      developerRegistration: parentosDeveloperRegistrationEnabled(),
    }),
    commandPolicy: parentosElectronHostCommandPolicy,
    standardShellHost: {
      standardDataRootBinding: standardDataRootBinding(standardStorageRoots),
      localAssetRoots,
      localAssetProtocolHost: fileProtocolHost,
      openExternalUrl: openParentOSExternalUrl,
      focusMainWindow,
      openFileDialog: nativeDialogs.openFileDialog,
      revealInOs: nativeDialogs.revealInOs,
      exportDirectory: nativeDialogs.exportDirectory,
      ...(localAgentIdentity ? { localAgentIdentity } : {}),
      runtimeTrustedCaller: {
        mode: resolveRuntimeTrustedCallerMode(),
      },
      aiConfigStore: createParentOSAiConfigStore(standardStorageRoots.durableDataRoot),
    },
    commandHandlers: createParentOSElectronCommandHandlers({
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
  const remoteDebuggingPort = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_REMOTE_DEBUGGING_PORT);
  if (remoteDebuggingPort) {
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
    minWidth: 1100,
    minHeight: 760,
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
  await loadRenderer(window);
  bootLog('create-window:renderer-loaded');
  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (rendererUrl) {
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
  const origins = new Set<string>();
  for (const url of allowedRendererUrls()) {
    origins.add(originForRendererUrl(url));
  }
  for (const origin of normalizeText(process.env.NIMI_PARENTOS_ELECTRON_ALLOWED_ORIGINS).split(',')) {
    const normalized = normalizeText(origin);
    if (normalized) {
      origins.add(normalized);
    }
  }
  return [...origins];
}

function originForRendererUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === 'file:' ? 'file://' : parsed.origin;
}

function allowedRendererUrls(): string[] {
  const urls = new Set<string>([rendererUrl || rendererDistUrl]);
  const devUrl = `http://127.0.0.1:${PARENTOS_RENDERER_DEV_PORT}`;
  if (rendererUrl === devUrl) {
    urls.add(devUrl);
  }
  for (const url of normalizeText(process.env.NIMI_PARENTOS_ELECTRON_ALLOWED_RENDERER_URLS).split(',')) {
    const normalized = normalizeText(url);
    if (normalized) {
      urls.add(normalized);
    }
  }
  return [...urls];
}

function isParentOSRendererUrl(url: string): boolean {
  return isAllowedElectronRendererUrl(url, allowedRendererUrls());
}

type ParentOSStandardStorageRoots = {
  readonly durableDataRoot: string;
  readonly cacheRoot: string;
  readonly tempRoot: string;
  readonly projectionRef: string;
};

async function resolveStandardDataRoot(): Promise<ParentOSStandardStorageRoots> {
  const fromEnv = normalizeText(process.env.NIMI_APP_DURABLE_DATA_ROOT)
    || normalizeText(process.env.NIMI_PARENTOS_ELECTRON_DURABLE_DATA_ROOT)
    || normalizeText(process.env.NIMI_PARENTOS_ELECTRON_STANDARD_DATA_ROOT);
  if (fromEnv) {
    const durableDataRoot = path.resolve(fromEnv);
    return {
      durableDataRoot,
      cacheRoot: resolveOptionalStandardRoot([
        'NIMI_APP_CACHE_ROOT',
        'NIMI_PARENTOS_ELECTRON_CACHE_ROOT',
      ]) ?? durableDataRoot,
      tempRoot: resolveOptionalStandardRoot([
        'NIMI_APP_TEMP_ROOT',
        'NIMI_PARENTOS_ELECTRON_TEMP_ROOT',
      ]) ?? durableDataRoot,
      projectionRef: 'parentos-electron-env-runtime-launch-projection',
    };
  }
  return resolveRuntimeProjectedStandardStorageRoots();
}

async function resolveRuntimeProjectedStandardStorageRoots(): Promise<ParentOSStandardStorageRoots> {
  const accountRuntime = new Runtime({
    appId: PARENTOS_APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint: runtimeEndpoint,
    },
  });
  try {
    await accountRuntime.ready();
    await createNimiRuntimeFullAppRegistration(
      () => ({ auth: accountRuntime.auth }),
      {
        appId: PARENTOS_APP_ID,
        appInstanceId: PARENTOS_RUNTIME_APP_INSTANCE_ID,
        deviceId: PARENTOS_RUNTIME_DEVICE_ID,
        capabilities: [],
        developerRegistration: parentosDeveloperRegistrationEnabled(),
        rejectionLabel: 'ParentOS Electron Runtime registration rejected',
      },
    )();
    const runtime = new Runtime({
      appId: PARENTOS_APP_ID,
      transport: {
        type: 'node-grpc',
        endpoint: runtimeEndpoint,
      },
      authMetadata: createNimiRuntimeAppSessionMetadataProvider({
        appId: PARENTOS_APP_ID,
        appInstanceId: `${PARENTOS_APP_ID}.electron-host-session`,
        deviceId: 'parentos-electron-host-session',
        capabilities: [],
        developerRegistration: parentosDeveloperRegistrationEnabled(),
        auth: accountRuntime.auth,
      }),
    });
    const roots = await resolveNimiRuntimeAppStorageRoots({
      appLifecycle: runtime.appLifecycle,
      appId: PARENTOS_APP_ID,
      label: 'ParentOS Electron host',
    });
    return {
      durableDataRoot: path.resolve(roots.dataRoot),
      cacheRoot: path.resolve(roots.cacheRoot),
      tempRoot: path.resolve(roots.tempRoot),
      projectionRef: 'parentos-electron-runtime-launch-projection',
    };
  } catch (error) {
    throw new Error(
      `ParentOS Electron failed to resolve Runtime app storage projection from ${runtimeEndpoint}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function resolveOptionalStandardRoot(envKeys: readonly string[]): string | undefined {
  for (const key of envKeys) {
    const normalized = normalizeText(process.env[key]);
    if (normalized) {
      return path.resolve(normalized);
    }
  }
  return undefined;
}

function standardDataRootBinding(roots: ParentOSStandardStorageRoots): NimiElectronStandardDataRootBinding {
  return {
    source: 'runtime-launch-projection',
    durableDataRoot: roots.durableDataRoot,
    cacheRoot: roots.cacheRoot,
    tempRoot: roots.tempRoot,
    projectionRef: roots.projectionRef,
  };
}

function resolveStandardLocalAssetRoots(durableDataRoot: string): string[] {
  const fromEnv = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_STANDARD_LOCAL_ASSET_ROOTS);
  if (!fromEnv) {
    return [durableDataRoot].map((filePath) => path.resolve(filePath));
  }
  return fromEnv
    .split(path.delimiter)
    .map((filePath) => normalizeText(filePath))
    .filter(Boolean)
    .map((filePath) => path.resolve(filePath));
}

function createParentOSAiConfigStore(durableDataRoot: string) {
  return createNimiElectronFileAIConfigStore({
    dataRoot: durableDataRoot,
    storeLabel: 'ParentOS AI Config',
  });
}

function parentosDeveloperRegistrationEnabled(): boolean {
  const explicit = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_DEVELOPER_REGISTRATION);
  if (explicit === '1' || explicit.toLowerCase() === 'true') {
    return true;
  }
  if (explicit === '0' || explicit.toLowerCase() === 'false') {
    return false;
  }
  return !app.isPackaged;
}

function resolveRuntimeTrustedCallerMode(): NimiElectronRuntimeTrustedCallerMode {
  const mode = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_RUNTIME_TRUSTED_CALLER_MODE) || 'local-developer-app';
  if (
    mode === 'local-developer-app'
    || mode === 'local-first-party-app'
    || mode === 'desktop-shell'
  ) {
    return mode;
  }
  throw new Error(`unsupported ParentOS Electron Runtime trusted caller mode: ${mode}`);
}

function resolveParentOSElectronLocalAgentIdentity(): {
  readonly ownerUserId: string;
  readonly runtimeSourceRef: string;
  readonly localAgentRef: string;
} | undefined {
  const localAgentRef = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_REF);
  if (!localAgentRef) {
    return undefined;
  }
  const ownerUserId = normalizeRequiredEnv(
    process.env.NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_OWNER_USER_ID,
    'NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_OWNER_USER_ID',
  );
  const runtimeSourceRef = normalizeRequiredEnv(
    process.env.NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_RUNTIME_SOURCE_REF,
    'NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_RUNTIME_SOURCE_REF',
  );
  if (!localAgentRef.startsWith('local-agent:')) {
    throw new Error('NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_REF must start with local-agent:');
  }
  assertOpaqueElectronLocalAgentRef({
    ownerUserId,
    runtimeSourceRef,
    localAgentRef,
    command: 'NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_REF',
  });
  return {
    ownerUserId,
    runtimeSourceRef,
    localAgentRef,
  };
}

function createParentOSFileProtocolHost(roots: readonly string[]) {
  return createElectronShellFileProtocolHost({
    protocol: {
      registerSchemesAsPrivileged: (customSchemes) => protocol.registerSchemesAsPrivileged([...customSchemes]),
      handle: (scheme, handler) => protocol.handle(scheme, (request) => handler(request) as Promise<Response>),
    },
    roots,
  });
}

function normalizeRequiredEnv(value: unknown, field: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${field} is required when NIMI_PARENTOS_ELECTRON_LOCAL_AGENT_REF is set`);
  }
  return normalized;
}

async function openParentOSExternalUrl(url: string): Promise<void> {
  const capturePath = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_OPEN_EXTERNAL_CAPTURE_FILE);
  if (capturePath) {
    const resolved = path.resolve(capturePath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await appendFile(resolved, `${url}\n`, 'utf8');
    return;
  }
  await shell.openExternal(url);
}

async function focusMainWindow(): Promise<void> {
  const window = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow
    : BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
  if (!window) {
    throw new Error('ParentOS Electron main window unavailable');
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
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
