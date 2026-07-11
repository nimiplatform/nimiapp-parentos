import { beforeEach, describe, expect, it, vi } from 'vitest';

const createInstalledNimiAppBootstrapMock = vi.fn();
const createInstalledNimiAppStandardShellSurfaceMock = vi.fn();
const dbInitMock = vi.fn();
const getAppSettingMock = vi.fn();
const getChildMock = vi.fn();
const getFamilyMock = vi.fn();
const getChildrenMock = vi.fn();

vi.mock('@nimiplatform/sdk', () => ({
  createInstalledNimiAppBootstrap: createInstalledNimiAppBootstrapMock,
  createNimiError: (input: {
    message: string;
    reasonCode: string;
    actionHint: string;
    source: string;
  }) => Object.assign(new Error(input.message), input),
}));

vi.mock('../bridge/index.js', () => ({
  createInstalledNimiAppStandardShellSurface: createInstalledNimiAppStandardShellSurfaceMock,
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

describe('ParentOS installed-app bootstrap hardcut', () => {
  beforeEach(async () => {
    vi.resetModules();
    createInstalledNimiAppBootstrapMock.mockReset();
    createInstalledNimiAppStandardShellSurfaceMock.mockReset();
    dbInitMock.mockReset();
    getAppSettingMock.mockReset();
    getChildMock.mockReset();
    getFamilyMock.mockReset();
    getChildrenMock.mockReset();

    const standardShell = {
      artifacts: { readRuntimeBytes: vi.fn() },
    };
    createInstalledNimiAppStandardShellSurfaceMock.mockReturnValue(standardShell);
    createInstalledNimiAppBootstrapMock.mockReturnValue({ artifacts: standardShell.artifacts });

    ({ useAppStore } = await import('../app-shell/app-store.js'));
    ({ runParentOSBootstrap, ensureParentOSRuntimeClientReady } = await import('./parentos-bootstrap.js'));
    useAppStore.setState({
      auth: { status: 'bootstrapping', user: null },
      bootstrapReady: false,
      bootstrapError: null,
      bootstrapFailure: null,
      runtimeDefaults: null,
      familyId: null,
      children: [],
      activeChildId: null,
      aiConfig: null,
    });
  });

  it('constructs only the artifact standard-shell bootstrap and then fails closed', async () => {
    await runParentOSBootstrap();

    expect(createInstalledNimiAppStandardShellSurfaceMock).toHaveBeenCalledTimes(1);
    expect(createInstalledNimiAppBootstrapMock).toHaveBeenCalledWith({
      standardShell: expect.objectContaining({ artifacts: expect.any(Object) }),
    });
    expect(useAppStore.getState().bootstrapReady).toBe(false);
    expect(useAppStore.getState().bootstrapFailure).toMatchObject({
      state: 'capability-unavailable',
      reasonCode: 'parentos-protected-operation-set-not-admitted',
    });
    expect(useAppStore.getState().auth.status).toBe('unauthenticated');
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('preserves protected carrier failures as typed unavailable states', async () => {
    const error = Object.assign(new Error('Runtime service unavailable'), {
      reasonCode: 'runtime-service-unavailable',
      actionHint: 'start_verified_runtime_service',
    });
    createInstalledNimiAppBootstrapMock.mockImplementationOnce(() => {
      throw error;
    });

    await runParentOSBootstrap({ force: true });

    expect(useAppStore.getState().bootstrapFailure).toEqual({
      state: 'runtime-unavailable',
      reasonCode: 'runtime-service-unavailable',
      actionHint: 'start_verified_runtime_service',
      message: 'Runtime service unavailable',
    });
    expect(dbInitMock).not.toHaveBeenCalled();
  });

  it('never retries through a generic Runtime client', async () => {
    await expect(ensureParentOSRuntimeClientReady()).rejects.toThrow(/protected ParentOS operation set/i);
    expect(dbInitMock).not.toHaveBeenCalled();
  });
});
