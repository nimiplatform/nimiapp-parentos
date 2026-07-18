import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNimiAppRuntimePlatformClientMock = vi.fn();
const createNimiLocalAppStandardShellSurfaceMock = vi.fn();
const dbInitMock = vi.fn();
const getAppSettingMock = vi.fn();
const getChildMock = vi.fn();
const getFamilyMock = vi.fn();
const getChildrenMock = vi.fn();
const authStatusMock = vi.fn();

vi.mock('@nimiplatform/sdk', () => ({
  createNimiError: (input: {
    message: string;
    reasonCode: string;
    actionHint: string;
    source: string;
  }) => Object.assign(new Error(input.message), input),
}));

vi.mock('@nimiplatform/sdk/app', () => ({
  createNimiAppRuntimePlatformClient: createNimiAppRuntimePlatformClientMock,
}));

vi.mock('../bridge/index.js', () => ({
  createNimiLocalAppStandardShellSurface: createNimiLocalAppStandardShellSurfaceMock,
}));

vi.mock('../bridge/sqlite-bridge.js', () => ({
  dbInit: dbInitMock,
  getAppSetting: getAppSettingMock,
  getChild: getChildMock,
  getFamily: getFamilyMock,
  getChildren: getChildrenMock,
}));

vi.mock('../bridge/mappers.js', () => ({ mapChildRow: vi.fn((row) => row) }));
vi.mock('../features/settings/parentos-ai-config.js', () => ({
  loadPersistedParentosAIConfig: vi.fn(),
}));
vi.mock('../i18n/app-language.js', () => ({
  loadAndApplyPersistedAppLanguage: vi.fn(),
}));

let useAppStore: typeof import('../app-shell/app-store.js').useAppStore;
let runParentOSBootstrap: typeof import('./parentos-bootstrap.js').runParentOSBootstrap;
let ensureParentOSRuntimeClientReady: typeof import('./parentos-bootstrap.js').ensureParentOSRuntimeClientReady;

describe('ParentOS local-app bootstrap hardcut', () => {
  beforeEach(async () => {
    vi.resetModules();
    createNimiAppRuntimePlatformClientMock.mockReset();
    createNimiLocalAppStandardShellSurfaceMock.mockReset();
    dbInitMock.mockReset();
    getAppSettingMock.mockReset();
    getChildMock.mockReset();
    getFamilyMock.mockReset();
    getChildrenMock.mockReset();
    authStatusMock.mockReset();

    const standardShell = { session: { status: vi.fn() } };
    authStatusMock.mockResolvedValue({
      mode: 'local-app',
      state: 'session-bound-zero-grant',
      sessionBound: true,
      operationAllowed: false,
      reasonCode: 'local-app-zero-grant',
      actionHint: 'request_local_app_grant',
      retryable: false,
    });
    createNimiLocalAppStandardShellSurfaceMock.mockReturnValue(standardShell);
    createNimiAppRuntimePlatformClientMock.mockReturnValue({
      auth: { status: authStatusMock },
    });

    ({ useAppStore } = await import('../app-shell/app-store.js'));
    ({ runParentOSBootstrap, ensureParentOSRuntimeClientReady } = await import('./parentos-bootstrap.js'));
    useAppStore.setState({
      auth: { status: 'bootstrapping', user: null },
      bootstrapReady: false,
      bootstrapError: null,
      bootstrapFailure: null,
      familyId: null,
      children: [],
      activeChildId: null,
      aiConfig: null,
    });
  });

  it('constructs only the bounded local-app client and then fails closed', async () => {
    await runParentOSBootstrap();

    expect(createNimiLocalAppStandardShellSurfaceMock).toHaveBeenCalledTimes(1);
    expect(createNimiAppRuntimePlatformClientMock).toHaveBeenCalledWith({
      standardShell: expect.objectContaining({ session: expect.any(Object) }),
    });
    expect(authStatusMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapFailure).toMatchObject({
      state: 'capability-unavailable',
      reasonCode: 'parentos-protected-operation-set-not-admitted',
    });
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('preserves unbound local-development status as a typed unavailable state', async () => {
    authStatusMock.mockResolvedValueOnce({
      mode: 'local-app',
      state: 'unavailable',
      sessionBound: false,
      operationAllowed: false,
      reasonCode: 'runtime-service-unavailable',
      actionHint: 'start_verified_runtime_service',
      retryable: true,
    });

    await runParentOSBootstrap({ force: true });

    expect(useAppStore.getState().bootstrapFailure).toEqual({
      state: 'runtime-unavailable',
      reasonCode: 'runtime-service-unavailable',
      actionHint: 'start_verified_runtime_service',
      message: 'The ParentOS local-development session is unavailable.',
    });
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('never retries through a generic Runtime client', async () => {
    await expect(ensureParentOSRuntimeClientReady()).rejects.toThrow(/protected ParentOS operation set/i);
    expect(dbInitMock).not.toHaveBeenCalled();
  });
});
