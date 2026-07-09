/**
 * ParentOS bootstrap regression tests (PO-SHELL-001 / PO-SHELL-008 / spec
 * K-ACCSVC-008). Locks the installed-app contract:
 *
 * - Bootstrap composes the SDK installed app bootstrap from a host-owned
 *   launch binding and standard shell surface.
 * - Runtime account projection uses the SDK-derived installed app caller.
 * - Renderer bootstrap never owns access/refresh tokens, session stores,
 *   runtime-defaults, or local-developer caller identity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AccountCallerMode,
  AccountSessionState,
} from '@nimiplatform/sdk/runtime/wire-types';

const createInstalledNimiAppBootstrapMock = vi.fn();
const createNimiClientMock = vi.fn();
const RuntimeMock = vi.fn();
const createInstalledNimiAppStandardShellSurfaceMock = vi.fn();
const readInstalledNimiAppLaunchBindingMock = vi.fn();
const dbInitMock = vi.fn();
const getAppSettingMock = vi.fn();
const getChildMock = vi.fn();
const getFamilyMock = vi.fn();
const getChildrenMock = vi.fn();
const loadPersistedParentosAIConfigMock = vi.fn();
const ensureParentosAIConfigFromFirstRunEvidenceMock = vi.fn();
const loadAndApplyPersistedAppLanguageMock = vi.fn();
const mapChildRowMock = vi.fn();
const getAccountSessionStatusMock = vi.fn();
const runtimeReadyMock = vi.fn();

let currentNimiClientMock: unknown = null;
let electronRuntimeAvailable = false;
let tauriRuntimeAvailable = true;
const runtimeConstructorOptions: unknown[] = [];

const launchBinding = {
  appId: 'nimi.parentos',
  appInstanceId: 'nimi.parentos.desktop-installed',
  deviceId: 'desktop-installed-app',
  launchHostId: 'desktop-electron-installed-app-host',
  launchNonce: 'launch-nonce-1',
  releaseDescriptorRef: 'nimi.parentos.bundled-with-nimi',
  realmBaseUrl: 'https://realm.test/',
} as const;

const installedAccountCaller = {
  appId: launchBinding.appId,
  appInstanceId: launchBinding.appInstanceId,
  deviceId: launchBinding.deviceId,
  mode: AccountCallerMode.DESKTOP_LAUNCHED_NIMI_APP,
  scopes: [],
  launchHostId: launchBinding.launchHostId,
  launchNonce: launchBinding.launchNonce,
  releaseDescriptorRef: launchBinding.releaseDescriptorRef,
};

const standardShell = {
  aiConfig: {
    get: vi.fn(),
    set: vi.fn(),
  },
  config: {
    get: vi.fn(),
    set: vi.fn(),
  },
  data: {
    resolvePath: vi.fn(),
  },
  storage: {
    readJson: vi.fn(),
    writeJson: vi.fn(),
    removeJson: vi.fn(),
  },
  localAssets: {
    resolveUrl: vi.fn(),
  },
};

vi.mock('../bridge/index.js', () => ({
  createInstalledNimiAppStandardShellSurface: createInstalledNimiAppStandardShellSurfaceMock,
  readInstalledNimiAppLaunchBinding: readInstalledNimiAppLaunchBindingMock,
  hasElectronRuntime: () => electronRuntimeAvailable,
  hasTauriRuntime: () => tauriRuntimeAvailable,
  invokeTauri: vi.fn(async () => undefined),
}));

vi.mock('@nimiplatform/sdk', () => ({
  createInstalledNimiAppBootstrap: createInstalledNimiAppBootstrapMock,
  createNimiClient: createNimiClientMock,
}));

vi.mock('@nimiplatform/sdk/runtime', () => ({
  Runtime: RuntimeMock,
}));

vi.mock('../bridge/sqlite-bridge.js', () => ({
  dbInit: dbInitMock,
  getAppSetting: getAppSettingMock,
  getChild: getChildMock,
  getFamily: getFamilyMock,
  getChildren: getChildrenMock,
}));

vi.mock('../bridge/mappers.js', () => ({
  mapChildRow: mapChildRowMock,
}));

vi.mock('../features/settings/parentos-ai-config.js', () => ({
  loadPersistedParentosAIConfig: loadPersistedParentosAIConfigMock,
}));

vi.mock('../features/settings/parentos-ai-config-bootstrap.js', () => ({
  ensureParentosAIConfigFromFirstRunEvidence: ensureParentosAIConfigFromFirstRunEvidenceMock,
}));

vi.mock('../i18n/app-language.js', () => ({
  loadAndApplyPersistedAppLanguage: loadAndApplyPersistedAppLanguageMock,
}));

let useAppStore: typeof import('../app-shell/app-store.js').useAppStore;
let runParentOSBootstrap: typeof import('./parentos-bootstrap.js').runParentOSBootstrap;
let ensureParentOSRuntimeClientReady: typeof import('./parentos-bootstrap.js').ensureParentOSRuntimeClientReady;
let syncParentOSLocalDataScope: typeof import('./parentos-bootstrap.js').syncParentOSLocalDataScope;
let getCurrentParentOSRuntimeAccountCaller: typeof import('./parentos-bootstrap.js').getCurrentParentOSRuntimeAccountCaller;

function buildRuntimeMock(options: unknown): {
  ready: ReturnType<typeof vi.fn>;
  runtime: {
    ready: ReturnType<typeof vi.fn>;
  };
  account: {
    getAccountSessionStatus: ReturnType<typeof vi.fn>;
  };
} {
  runtimeConstructorOptions.push(options);
  return {
    ready: runtimeReadyMock,
    runtime: {
      ready: runtimeReadyMock,
    },
    account: {
      getAccountSessionStatus: getAccountSessionStatusMock,
    },
  };
}

describe('parentos-bootstrap installed app boundary', () => {
  beforeEach(async () => {
    vi.resetModules();
    electronRuntimeAvailable = false;
    tauriRuntimeAvailable = true;
    currentNimiClientMock = null;
    runtimeConstructorOptions.length = 0;

    createInstalledNimiAppBootstrapMock.mockReset();
    createNimiClientMock.mockReset();
    RuntimeMock.mockReset();
    createInstalledNimiAppStandardShellSurfaceMock.mockReset();
    readInstalledNimiAppLaunchBindingMock.mockReset();
    dbInitMock.mockReset();
    getAppSettingMock.mockReset();
    getChildMock.mockReset();
    getFamilyMock.mockReset();
    getChildrenMock.mockReset();
    loadPersistedParentosAIConfigMock.mockReset();
    ensureParentosAIConfigFromFirstRunEvidenceMock.mockReset();
    loadAndApplyPersistedAppLanguageMock.mockReset();
    mapChildRowMock.mockReset();
    getAccountSessionStatusMock.mockReset();
    runtimeReadyMock.mockReset();

    ({ useAppStore } = await import('../app-shell/app-store.js'));
    ({
      runParentOSBootstrap,
      ensureParentOSRuntimeClientReady,
      syncParentOSLocalDataScope,
      getCurrentParentOSRuntimeAccountCaller,
    } = await import('./parentos-bootstrap.js'));

    useAppStore.setState({
      auth: { status: 'bootstrapping', user: null },
      bootstrapReady: false,
      bootstrapError: null,
      runtimeDefaults: null,
      familyId: null,
      children: [],
      activeChildId: null,
      aiConfig: null,
    });

    RuntimeMock.mockImplementation(function RuntimeMockConstructor(options: unknown) {
      return buildRuntimeMock(options);
    });
    createInstalledNimiAppStandardShellSurfaceMock.mockReturnValue(standardShell);
    readInstalledNimiAppLaunchBindingMock.mockReturnValue(launchBinding);
    createInstalledNimiAppBootstrapMock.mockImplementation((input: {
      runtime: unknown;
    }) => ({
      appId: launchBinding.appId,
      accountCaller: installedAccountCaller,
      realm: {},
      runtime: input.runtime,
      standardShell,
    }));
    createNimiClientMock.mockImplementation((input: { appId: string; runtime: unknown }) => {
      currentNimiClientMock = {
        appId: input.appId,
        runtime: input.runtime,
      };
      return currentNimiClientMock;
    });
    runtimeReadyMock.mockResolvedValue(undefined);
    ensureParentosAIConfigFromFirstRunEvidenceMock.mockResolvedValue({
      outcome: 'already-bound',
      config: {},
    });
    loadAndApplyPersistedAppLanguageMock.mockResolvedValue(undefined);
    loadPersistedParentosAIConfigMock.mockResolvedValue(null);
    getAppSettingMock.mockResolvedValue('');
    getChildMock.mockResolvedValue(null);
    getFamilyMock.mockResolvedValue({ familyId: 'family-anon' });
    getChildrenMock.mockResolvedValue([]);
    mapChildRowMock.mockImplementation((row: unknown) => row);
  });

  it('composes SDK installed app bootstrap from host launch binding and standard shell', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.AUTHENTICATED,
      accountProjection: { accountId: 'acct-1', displayName: 'User One' },
    });

    await runParentOSBootstrap();

    expect(createInstalledNimiAppStandardShellSurfaceMock).toHaveBeenCalledTimes(1);
    expect(readInstalledNimiAppLaunchBindingMock).toHaveBeenCalledTimes(1);
    expect(createInstalledNimiAppBootstrapMock).toHaveBeenCalledWith({
      realmBaseUrl: 'https://realm.test/',
      runtime: expect.any(Object),
      launchBinding,
      standardShell,
    });
    expect(getCurrentParentOSRuntimeAccountCaller()).toEqual(installedAccountCaller);
    expect(createNimiClientMock).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'nimi.parentos',
      runtime: expect.any(Object),
      realm: false,
      app: false,
      permissions: false,
    }));
    const call = createNimiClientMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('accessToken');
    expect(call).not.toHaveProperty('accessTokenProvider');
    expect(call).not.toHaveProperty('refreshTokenProvider');
    expect(call).not.toHaveProperty('subjectUserIdProvider');
    expect(call).not.toHaveProperty('sessionStore');
  });

  it('uses tauri Runtime transport only when a standard Tauri shell runtime exists', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(runtimeConstructorOptions[0]).toEqual(expect.objectContaining({
      appId: 'nimi.parentos',
      metadata: {
        surfaceId: 'parentos.runtime',
      },
      transport: {
        type: 'tauri-ipc',
        commandNamespace: 'runtime_bridge',
        eventNamespace: 'runtime_bridge',
      },
    }));
  });

  it('uses electron-ipc Runtime transport when Electron preload bridge is present', async () => {
    electronRuntimeAvailable = true;
    tauriRuntimeAvailable = false;
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(runtimeConstructorOptions[0]).toEqual(expect.objectContaining({
      appId: 'nimi.parentos',
      transport: { type: 'electron-ipc' },
    }));
  });

  it('fails bootstrap when no installed app runtime bridge exists', async () => {
    electronRuntimeAvailable = false;
    tauriRuntimeAvailable = false;

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapError).toContain('installed app Runtime bridge');
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('switches local SQLite scope to the runtime-projected accountId when authenticated', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.AUTHENTICATED,
      accountProjection: { accountId: 'acct-42', displayName: 'Scoped' },
    });
    getFamilyMock.mockResolvedValue({ familyId: 'family-42' });

    await runParentOSBootstrap();

    expect(getAccountSessionStatusMock).toHaveBeenCalledWith({
      caller: installedAccountCaller,
    });
    expect(getAccountSessionStatusMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbInitMock.mock.invocationCallOrder[0]!,
    );
    expect(dbInitMock).toHaveBeenCalledWith('acct-42');
    expect(loadAndApplyPersistedAppLanguageMock).toHaveBeenCalledTimes(1);
    expect(dbInitMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadAndApplyPersistedAppLanguageMock.mock.invocationCallOrder[0]!,
    );
    expect(useAppStore.getState().auth).toEqual({
      status: 'authenticated',
      user: { id: 'acct-42', displayName: 'Scoped' },
    });
  });

  it('proceeds to the anonymous local scope when runtime account state is ANONYMOUS', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(true);
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(dbInitMock).toHaveBeenCalledWith(null);
  });

  it('initializes ParentOS AI config from first-run evidence after Runtime readiness', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(runtimeReadyMock).toHaveBeenCalledTimes(2);
    expect(ensureParentosAIConfigFromFirstRunEvidenceMock).toHaveBeenCalledWith({
      client: currentNimiClientMock,
    });
  });

  it('proceeds to the anonymous local scope when runtime account state is UNAVAILABLE', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.UNAVAILABLE,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(true);
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(dbInitMock).toHaveBeenCalledWith(null);
  });

  it('proceeds to the anonymous local scope when runtime account status RPC throws', async () => {
    getAccountSessionStatusMock.mockRejectedValue(new Error('runtime unreachable'));

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(true);
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(dbInitMock).toHaveBeenCalledWith(null);
  });

  it('fails bootstrap when renderer Runtime readiness fails before account projection', async () => {
    runtimeReadyMock.mockRejectedValueOnce(new Error('RUNTIME_UNAVAILABLE'));

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapError).toContain('RUNTIME_UNAVAILABLE');
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(dbInitMock).not.toHaveBeenCalled();
    expect(() => getCurrentParentOSRuntimeAccountCaller()).toThrow(/unavailable/i);
  });

  it('retries installed app runtime client construction after a failed bootstrap', async () => {
    runtimeReadyMock
      .mockRejectedValueOnce(new Error('RUNTIME_UNAVAILABLE'))
      .mockResolvedValue(undefined);
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(createNimiClientMock).toHaveBeenCalledTimes(1);

    await ensureParentOSRuntimeClientReady();

    expect(useAppStore.getState().bootstrapReady).toBe(true);
    expect(createNimiClientMock).toHaveBeenCalledTimes(2);
    expect(getAccountSessionStatusMock).toHaveBeenCalledWith({
      caller: installedAccountCaller,
    });
    expect(dbInitMock).toHaveBeenLastCalledWith(null);
  });

  it('bootstrap module does not import forbidden auth/session/defaults helpers', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, 'parentos-bootstrap.ts'), 'utf8');

    expect(source).toMatch(/createInstalledNimiAppBootstrap/);
    expect(source).toMatch(/readInstalledNimiAppLaunchBinding/);
    expect(source).not.toMatch(/getParentOSRuntimeDefaults|getRuntimeDefaults/);
    expect(source).not.toMatch(/createNimiDeveloperRegisteredRuntimeAccountCaller|LOCAL_DEVELOPER_APP|local-developer/);
    expect(source).not.toMatch(/persistSharedDesktopAuthSession|resolveDesktopBootstrapAuthSession/);
    expect(source).not.toMatch(/refreshTokenProvider|accessTokenProvider|sessionStore/);
  });

  it('clears stale local state before switching to a new account scope', async () => {
    const childTemplate = {
      gender: 'female' as const,
      birthDate: '2020-01-01',
      birthWeightKg: null,
      birthHeightCm: null,
      birthHeadCircCm: null,
      avatarPath: null,
      nurtureMode: 'balanced' as const,
      nurtureModeOverrides: null,
      allergies: null,
      medicalNotes: null,
      recorderProfiles: null,
      createdAt: '',
      updatedAt: '',
    };
    useAppStore.setState({
      familyId: 'old-family',
      children: [
        {
          childId: 'old-child',
          familyId: 'old-family',
          displayName: 'Old',
          ...childTemplate,
        },
      ],
      activeChildId: 'old-child',
    });
    getFamilyMock.mockResolvedValue({ familyId: 'family-new' });
    getChildrenMock.mockResolvedValue([
      {
        childId: 'child-new',
        familyId: 'family-new',
        displayName: 'New',
        ...childTemplate,
        gender: 'male' as const,
        birthDate: '2024-06-01',
      },
    ]);

    await syncParentOSLocalDataScope('acct-new');

    expect(dbInitMock).toHaveBeenCalledWith('acct-new');
    expect(useAppStore.getState().familyId).toBe('family-new');
    expect(useAppStore.getState().activeChildId).toBe('child-new');
  });
});
