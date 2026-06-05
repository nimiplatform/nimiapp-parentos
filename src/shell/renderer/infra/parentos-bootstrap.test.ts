/**
 * ParentOS bootstrap regression tests (PO-SHELL-001 / PO-SHELL-008 / spec
 * K-ACCSVC-008). Locks the local-first-party-runtime contract:
 *
 * - Bootstrap constructs the vNext NimiClient via `createNimiClient`, which
 *   keeps app-owned access/refresh tokens and session stores out of the call.
 * - Authenticated subject for the local SQLite scope comes from the runtime
 *   account projection (`runtime.account.getAccountSessionStatus`), never
 *   from a legacy persisted session bridge.
 * - Runtime app registration and Nimi Data app-storage projection are hard
 *   prerequisites for local storage. Anonymous / unavailable runtime account
 *   states still do NOT fail bootstrap; ParentOS opens against the anonymous
 *   local scope after the storage projection is available.
 * - The bootstrap must never invoke the legacy shared desktop auth-session
 *   bridge (`auth_session_load`/`save`/`clear`) and must never persist a
 *   refresh token at any layer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AccountCallerMode,
  AccountSessionState,
} from '@nimiplatform/sdk/runtime/generated';

const getRuntimeDefaultsMock = vi.fn();
const createNimiClientMock = vi.fn();
const createRealmFetchTransportMock = vi.fn();
const prepareParentOSAppStorageMock = vi.fn();
const dbInitMock = vi.fn();
const getAppSettingMock = vi.fn();
const getChildMock = vi.fn();
const getFamilyMock = vi.fn();
const getChildrenMock = vi.fn();
const loadPersistedParentosAIConfigMock = vi.fn();
const ensureParentosAIConfigFromFirstRunEvidenceMock = vi.fn();
const mapChildRowMock = vi.fn();
const getAccountSessionStatusMock = vi.fn();
const getAppStorageMock = vi.fn();
const runtimeReadyMock = vi.fn();
let currentNimiClientMock: unknown = null;

vi.mock('../bridge/index.js', () => ({
  getParentOSRuntimeDefaults: getRuntimeDefaultsMock,
  hasTauriRuntime: () => false,
  invokeTauri: vi.fn(),
}));

vi.mock('@nimiplatform/sdk', () => ({
  createNimiClient: createNimiClientMock,
  createRealmFetchTransport: createRealmFetchTransportMock,
}));

vi.mock('../bridge/sqlite-bridge.js', () => ({
  prepareParentOSAppStorage: prepareParentOSAppStorageMock,
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

let useAppStore: typeof import('../app-shell/app-store.js').useAppStore;
let runParentOSBootstrap: typeof import('./parentos-bootstrap.js').runParentOSBootstrap;
let ensureParentOSRuntimeClientReady: typeof import('./parentos-bootstrap.js').ensureParentOSRuntimeClientReady;
let syncParentOSLocalDataScope: typeof import('./parentos-bootstrap.js').syncParentOSLocalDataScope;
let parentosRuntimeAccountCaller: typeof import('./parentos-bootstrap.js').parentosRuntimeAccountCaller;

function buildPlatformClientMock(): {
  runtime: {
    ready: ReturnType<typeof vi.fn>;
    appLifecycle: {
      storage: ReturnType<typeof vi.fn>;
    };
    account: {
      getAccountSessionStatus: ReturnType<typeof vi.fn>;
    };
  };
} {
  return {
    runtime: {
      ready: runtimeReadyMock,
      appLifecycle: {
        storage: getAppStorageMock,
      },
      account: {
        getAccountSessionStatus: getAccountSessionStatusMock,
      },
    },
  };
}

describe('parentos-bootstrap (PO-SHELL-001 / PO-SHELL-008)', () => {
  beforeEach(async () => {
    vi.resetModules();

    ({ useAppStore } = await import('../app-shell/app-store.js'));
    ({
      runParentOSBootstrap,
      ensureParentOSRuntimeClientReady,
      syncParentOSLocalDataScope,
      parentosRuntimeAccountCaller,
    } = await import('./parentos-bootstrap.js'));

    currentNimiClientMock = null;
    getRuntimeDefaultsMock.mockReset();
    createNimiClientMock.mockReset();
    createRealmFetchTransportMock.mockReset();
    prepareParentOSAppStorageMock.mockReset();
    dbInitMock.mockReset();
    getAppSettingMock.mockReset();
    getChildMock.mockReset();
    getFamilyMock.mockReset();
    getChildrenMock.mockReset();
    loadPersistedParentosAIConfigMock.mockReset();
    ensureParentosAIConfigFromFirstRunEvidenceMock.mockReset();
    mapChildRowMock.mockReset();
    getAccountSessionStatusMock.mockReset();
    getAppStorageMock.mockReset();
    runtimeReadyMock.mockReset();

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

    getRuntimeDefaultsMock.mockResolvedValue({
      webBaseUrl: '',
      realm: { realmBaseUrl: 'https://realm.test', accessToken: '' },
      runtime: { sandboxRoot: '', materialRoot: '', defaultUploadPath: '' },
    });
    createRealmFetchTransportMock.mockImplementation((input: unknown) => ({
      type: 'realm-fetch',
      input,
    }));
    createNimiClientMock.mockImplementation(() => {
      currentNimiClientMock = buildPlatformClientMock();
      return currentNimiClientMock;
    });
    runtimeReadyMock.mockResolvedValue(undefined);
    ensureParentosAIConfigFromFirstRunEvidenceMock.mockResolvedValue({
      outcome: 'already-bound',
      config: {},
    });
    getAppStorageMock.mockResolvedValue({
      appId: 'ai.nimi.apps.parentos',
      state: 'ready',
      storagePolicyRef: 'nimi-data-app-roots',
      durableDataRoot: '/runtime/apps/ai.nimi.apps.parentos/data',
      cacheRoot: '/runtime/apps/ai.nimi.apps.parentos/cache',
      tempRoot: '/runtime/apps/ai.nimi.apps.parentos/tmp',
    });
    prepareParentOSAppStorageMock.mockResolvedValue({
      parentosDataRoot: '/runtime/apps/ai.nimi.apps.parentos/data',
      parentosCacheRoot: '/runtime/apps/ai.nimi.apps.parentos/cache',
      parentosTempRoot: '/runtime/apps/ai.nimi.apps.parentos/tmp',
      parentosDbPath: '/runtime/apps/ai.nimi.apps.parentos/data/sqlite/anonymous.db',
    });
    loadPersistedParentosAIConfigMock.mockResolvedValue(null);
    getAppSettingMock.mockResolvedValue('');
    getChildMock.mockResolvedValue(null);
    getFamilyMock.mockResolvedValue({ familyId: 'family-anon' });
    getChildrenMock.mockResolvedValue([]);
    mapChildRowMock.mockImplementation((row: unknown) => row);
  });

  // -------------------------------------------------------------------------
  // Authentication path: runtime account projection drives the scope
  // -------------------------------------------------------------------------

  it('uses the vNext NimiClient constructor without app-owned token custody inputs', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.AUTHENTICATED,
      accountProjection: { accountId: 'acct-1', displayName: 'User One' },
    });
    await runParentOSBootstrap();
    expect(createRealmFetchTransportMock).toHaveBeenCalledWith({
      baseUrl: 'https://realm.test',
      credentials: 'include',
    });
    expect(createNimiClientMock).toHaveBeenCalledTimes(1);
    const call = createNimiClientMock.mock.calls[0]![0] as {
      appId?: string;
      runtime?: {
        appId?: string;
        transport?: {
          type?: string;
          commandNamespace?: string;
          eventNamespace?: string;
        };
      };
      realm?: unknown;
      app?: unknown;
      permissions?: unknown;
    } & Record<string, unknown>;
    expect(call.appId).toBe('ai.nimi.apps.parentos');
    expect(call.runtime).toEqual(expect.objectContaining({
      appId: 'ai.nimi.apps.parentos',
      transport: {
        type: 'tauri-ipc',
        commandNamespace: 'runtime_bridge',
        eventNamespace: 'runtime_bridge',
      },
    }));
    expect(call.realm).toEqual({
      transport: {
        type: 'realm-fetch',
        input: {
          baseUrl: 'https://realm.test',
          credentials: 'include',
        },
      },
    });
    expect(call.app).toBe(false);
    expect(call.permissions).toBe(false);
    // PO-SHELL-008: type-level rejection still enforced at runtime — these
    // keys must never appear.
    expect(call).not.toHaveProperty('accessToken');
    expect(call).not.toHaveProperty('accessTokenProvider');
    expect(call).not.toHaveProperty('refreshTokenProvider');
    expect(call).not.toHaveProperty('subjectUserIdProvider');
    expect(call).not.toHaveProperty('sessionStore');
  });

  it('uses LOCAL_FIRST_PARTY_APP caller with ai.nimi.apps.parentos.local-first-party instance', async () => {
    expect(parentosRuntimeAccountCaller).toEqual({
      appId: 'ai.nimi.apps.parentos',
      appInstanceId: 'ai.nimi.apps.parentos.local-first-party',
      deviceId: 'local-first-party-device',
      mode: AccountCallerMode.LOCAL_FIRST_PARTY_APP,
      scopes: [],
    });
  });

  it('switches local SQLite scope to the runtime-projected accountId when authenticated', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.AUTHENTICATED,
      accountProjection: { accountId: 'acct-42', displayName: 'Scoped' },
    });
    getFamilyMock.mockResolvedValue({ familyId: 'family-42' });

    await runParentOSBootstrap();

    // Account projection user id is what enters the scope, not any legacy
    // persisted-session subject.
    expect(getAccountSessionStatusMock).toHaveBeenCalledWith({
      caller: parentosRuntimeAccountCaller,
    });
    expect(getAppStorageMock).toHaveBeenCalledWith({ appId: 'ai.nimi.apps.parentos' });
    expect(prepareParentOSAppStorageMock).toHaveBeenCalledTimes(1);
    expect(prepareParentOSAppStorageMock).toHaveBeenCalledWith({
      appId: 'ai.nimi.apps.parentos',
      state: 'ready',
      storagePolicyRef: 'nimi-data-app-roots',
      durableDataRoot: '/runtime/apps/ai.nimi.apps.parentos/data',
      cacheRoot: '/runtime/apps/ai.nimi.apps.parentos/cache',
      tempRoot: '/runtime/apps/ai.nimi.apps.parentos/tmp',
    });
    expect(getAppStorageMock.mock.invocationCallOrder[0]).toBeLessThan(
      prepareParentOSAppStorageMock.mock.invocationCallOrder[0]!,
    );
    expect(prepareParentOSAppStorageMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbInitMock.mock.invocationCallOrder[0]!,
    );
    expect(dbInitMock).toHaveBeenCalledWith('acct-42');
    const auth = useAppStore.getState().auth;
    expect(auth.status).toBe('authenticated');
    expect(auth.user).toEqual({ id: 'acct-42', displayName: 'Scoped' });
  });

  // -------------------------------------------------------------------------
  // Anonymous path: runtime ANONYMOUS / UNAVAILABLE / errors must not fail
  // -------------------------------------------------------------------------

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

  it('initializes ParentOS AIConfig from first-run evidence after Runtime readiness', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(runtimeReadyMock).toHaveBeenCalledTimes(2);
    expect(ensureParentosAIConfigFromFirstRunEvidenceMock).toHaveBeenCalledTimes(1);
    expect(ensureParentosAIConfigFromFirstRunEvidenceMock).toHaveBeenCalledWith({
      client: currentNimiClientMock,
    });
    expect(runtimeReadyMock.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      ensureParentosAIConfigFromFirstRunEvidenceMock.mock.invocationCallOrder[0]!,
    );
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

  it('fails bootstrap when vNext runtime client construction is rejected', async () => {
    createNimiClientMock.mockImplementation(() => {
      throw new Error('local first-party Runtime account caller registration rejected: 100');
    });

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapError).toContain(
      'local first-party Runtime account caller registration rejected',
    );
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(prepareParentOSAppStorageMock).not.toHaveBeenCalled();
    expect(getAppStorageMock).not.toHaveBeenCalled();
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(runtimeReadyMock).not.toHaveBeenCalled();
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('retries vNext runtime client construction after a failed bootstrap', async () => {
    createNimiClientMock
      .mockImplementationOnce(() => {
        throw new Error('local first-party Runtime account caller registration rejected: 100');
      })
      .mockImplementationOnce(() => {
        currentNimiClientMock = buildPlatformClientMock();
        return currentNimiClientMock;
      });
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(getAppStorageMock).not.toHaveBeenCalled();
    expect(createNimiClientMock).toHaveBeenCalledTimes(1);

    await ensureParentOSRuntimeClientReady();

    expect(useAppStore.getState().bootstrapReady).toBe(true);
    expect(createNimiClientMock).toHaveBeenCalledTimes(2);
    expect(getAccountSessionStatusMock).toHaveBeenCalledWith({
      caller: parentosRuntimeAccountCaller,
    });
    expect(dbInitMock).toHaveBeenLastCalledWith(null);
  });

  it('fails bootstrap when Nimi Data app storage preparation fails', async () => {
    getAccountSessionStatusMock.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });
    prepareParentOSAppStorageMock.mockRejectedValue(new Error('APP_NOT_REGISTERED'));

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapError).toContain('APP_NOT_REGISTERED');
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('fails bootstrap when Runtime returns a non-ready Nimi Data storage projection', async () => {
    getAppStorageMock.mockResolvedValue({
      appId: 'ai.nimi.apps.parentos',
      state: 'storage_unavailable',
      storagePolicyRef: 'nimi-data-app-roots',
      durableDataRoot: '/runtime/apps/ai.nimi.apps.parentos/data',
      cacheRoot: '/runtime/apps/ai.nimi.apps.parentos/cache',
      tempRoot: '/runtime/apps/ai.nimi.apps.parentos/tmp',
    });

    await runParentOSBootstrap();

    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapError).toContain('Runtime ready state');
    expect(prepareParentOSAppStorageMock).not.toHaveBeenCalled();
    expect(getAccountSessionStatusMock).not.toHaveBeenCalled();
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Spec hard-cut lock: no legacy refresh-token / shared-session imports
  // -------------------------------------------------------------------------

  it('bootstrap module does not import legacy shared desktop auth-session helpers', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, 'parentos-bootstrap.ts'), 'utf8');
    // PO-SHELL-008: the kit's shared desktop session helpers are forbidden;
    // ParentOS must not own refresh-token custody at any layer.
    expect(source).not.toMatch(/persistSharedDesktopAuthSession/);
    expect(source).not.toMatch(/resolveDesktopBootstrapAuthSession/);
    // Legacy Tauri auth_session_* bridge imports are forbidden (the host
    // commands were already disabled at the Rust layer; the bridge import
    // surface must not re-introduce them).
    expect(source).not.toMatch(/import\b[\s\S]*\b(loadAuthSession|saveAuthSession)\b[\s\S]*from\s+['"]\.\.\/bridge/);
    expect(source).not.toMatch(/import\b[\s\S]*\bclearAuthSession\s+as\s+clearPersistedAuthSession[\s\S]*from\s+['"]\.\.\/bridge/);
    expect(source).not.toMatch(/refreshTokenProvider/);
    expect(source).not.toMatch(/accessTokenProvider/);
  });

  // -------------------------------------------------------------------------
  // Scope switching on user change
  // -------------------------------------------------------------------------

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
