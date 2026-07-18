import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { PARENTOS_AI_SCOPE_REF } from './parentos-ai-config.js';
import {
  commitParentosAIConfig,
  getParentosAIConfigService,
} from './parentos-ai-config-service.js';

const { setAppSettingMock } = vi.hoisted(() => ({
  setAppSettingMock: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getAppSetting: vi.fn().mockResolvedValue(null),
  setAppSetting: setAppSettingMock,
}));

describe('parentos-ai-config-service', () => {
  beforeEach(() => {
    useAppStore.setState({ aiConfig: null });
    setAppSettingMock.mockReset().mockResolvedValue(undefined);
  });

  it('returns an empty ParentOS profile catalog without app-owned profile authority', async () => {
    await expect(getParentosAIConfigService().aiProfile.list()).resolves.toEqual([]);
  });

  it('fails closed when applying an unknown profile', async () => {
    const result = await getParentosAIConfigService().aiProfile.apply(
      PARENTOS_AI_SCOPE_REF,
      'family-advisor',
      { requirementDeclarations: [] },
    );

    expect(result).toEqual({
      success: false,
      config: null,
      outcome: 'invalid_profile',
      failureReason: 'invalid_profile',
      probeWarnings: ['AI profile not found: family-advisor'],
    });
    expect(useAppStore.getState().aiConfig).toBe(null);
  });

  it('persists, publishes, and stores app-owned AI preferences', async () => {
    const subscriber = vi.fn();
    const next = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'local-runtime',
            version: 'v2',
            profileBindingId: 'local-runtime:local-model',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    } as const;

    getParentosAIConfigService().aiConfig.subscribe(PARENTOS_AI_SCOPE_REF, subscriber);
    await expect(commitParentosAIConfig(next)).resolves.toEqual(next);
    expect(setAppSettingMock).toHaveBeenCalledOnce();
    expect(useAppStore.getState().aiConfig).toEqual(next);
    expect(subscriber).toHaveBeenCalledWith(next);
  });
});
