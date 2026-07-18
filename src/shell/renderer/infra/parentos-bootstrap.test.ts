import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbInitMock = vi.fn();
const getAppSettingMock = vi.fn();
const getChildMock = vi.fn();
const getFamilyMock = vi.fn();
const getChildrenMock = vi.fn();
const loadPersistedParentosAIConfigMock = vi.fn();
const loadAndApplyPersistedAppLanguageMock = vi.fn();

vi.mock('../bridge/sqlite-bridge.js', () => ({
  dbInit: dbInitMock,
  getAppSetting: getAppSettingMock,
  getChild: getChildMock,
  getFamily: getFamilyMock,
  getChildren: getChildrenMock,
}));

vi.mock('../bridge/mappers.js', () => ({ mapChildRow: vi.fn((row) => row) }));
vi.mock('../features/settings/parentos-ai-config.js', () => ({
  loadPersistedParentosAIConfig: loadPersistedParentosAIConfigMock,
}));
vi.mock('../i18n/app-language.js', () => ({
  loadAndApplyPersistedAppLanguage: loadAndApplyPersistedAppLanguageMock,
}));

let useAppStore: typeof import('../app-shell/app-store.js').useAppStore;
let runParentOSBootstrap: typeof import('./parentos-bootstrap.js').runParentOSBootstrap;

describe('ParentOS app-owned data bootstrap', () => {
  beforeEach(async () => {
    vi.resetModules();
    dbInitMock.mockReset().mockResolvedValue(undefined);
    getAppSettingMock.mockReset().mockResolvedValue(null);
    getChildMock.mockReset().mockResolvedValue(null);
    getFamilyMock.mockReset().mockResolvedValue(null);
    getChildrenMock.mockReset().mockResolvedValue([]);
    loadPersistedParentosAIConfigMock.mockReset().mockResolvedValue(null);
    loadAndApplyPersistedAppLanguageMock.mockReset().mockResolvedValue(undefined);

    ({ useAppStore } = await import('../app-shell/app-store.js'));
    ({ runParentOSBootstrap } = await import('./parentos-bootstrap.js'));
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

  it('opens the device-local SQLite scope without a Nimi permission or account projection', async () => {
    await runParentOSBootstrap();

    expect(dbInitMock).toHaveBeenCalledTimes(1);
    expect(dbInitMock).toHaveBeenCalledWith(null);
    expect(loadAndApplyPersistedAppLanguageMock).toHaveBeenCalledOnce();
    expect(useAppStore.getState()).toMatchObject({
      auth: { status: 'unauthenticated', user: null },
      bootstrapReady: true,
      bootstrapError: null,
      bootstrapFailure: null,
    });
  });

  it('hydrates family and child state from the app-owned database', async () => {
    getAppSettingMock.mockImplementation(async (key: string) => (
      key === 'activeChildId' ? 'child-2' : null
    ));
    getChildMock.mockResolvedValue({ childId: 'child-2', familyId: 'family-1' });
    getChildrenMock.mockResolvedValue([
      { childId: 'child-1', familyId: 'family-1' },
      { childId: 'child-2', familyId: 'family-1' },
    ]);

    await runParentOSBootstrap();

    expect(getChildrenMock).toHaveBeenCalledTimes(1);
    expect(getChildrenMock).toHaveBeenCalledWith('family-1');
    expect(useAppStore.getState()).toMatchObject({
      familyId: 'family-1',
      activeChildId: 'child-2',
      children: [
        { childId: 'child-1', familyId: 'family-1' },
        { childId: 'child-2', familyId: 'family-1' },
      ],
    });
  });

  it('locks only when the app-owned data host itself fails', async () => {
    dbInitMock.mockRejectedValue(Object.assign(new Error('sidecar missing'), {
      reasonCode: 'parentos-electron-sidecar-binary-unavailable',
      actionHint: 'build_parentos_host_sidecar_before_launching_electron',
    }));

    await runParentOSBootstrap({ force: true });

    expect(useAppStore.getState()).toMatchObject({
      bootstrapReady: false,
      bootstrapError: 'sidecar missing',
      bootstrapFailure: {
        state: 'app-data-unavailable',
        reasonCode: 'parentos-electron-sidecar-binary-unavailable',
      },
    });
  });
});
