import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';

const mockSetAppSetting = vi.fn();

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getAppSetting: vi.fn(),
  setAppSetting: mockSetAppSetting,
}));

vi.mock('../../bridge/ulid.js', () => ({
  isoNow: () => '2026-04-10T10:00:00.000Z',
}));

const {
  PARENTOS_AI_SCOPE_REF,
} = await import('./parentos-ai-config.js');

const {
  getParentosAIConfigService,
  commitParentosAIConfig,
} = await import('./parentos-ai-config-service.js');

describe('parentos-ai-config-service', () => {
  beforeEach(() => {
    mockSetAppSetting.mockReset();
    mockSetAppSetting.mockResolvedValue(undefined);
    useAppStore.setState({ aiConfig: null });
  });

  it('returns an empty ParentOS profile catalog without app-owned profile authority', async () => {
    const profiles = await getParentosAIConfigService().aiProfile.list();

    expect(profiles).toEqual([]);
  });

  it('fails closed when applying an unknown profile', async () => {
    const result = await getParentosAIConfigService().aiProfile.apply(PARENTOS_AI_SCOPE_REF, 'family-advisor', {
      requirementDeclarations: [],
    });

    expect(result).toEqual({
      success: false,
      config: null,
      outcome: 'invalid_profile',
      failureReason: 'invalid_profile',
      probeWarnings: ['AI profile not found: family-advisor'],
    });
    expect(useAppStore.getState().aiConfig).toBe(null);
    expect(mockSetAppSetting).not.toHaveBeenCalled();
  });

  it('commits AI config only after SQLite persistence succeeds', async () => {
    const unsubscribe = vi.fn();
    const next = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'local-runtime',
            targetId: 'local-model',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    } as const;

    getParentosAIConfigService().aiConfig.subscribe(PARENTOS_AI_SCOPE_REF, unsubscribe);
    const saved = await commitParentosAIConfig(next);

    expect(saved.capabilities.targetRefs['text.generate']).toEqual({
      kind: 'local-runtime',
      targetId: 'local-model',
    });
    expect(mockSetAppSetting).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().aiConfig).toEqual(saved);
    expect(unsubscribe).toHaveBeenCalledWith(saved);
  });

  it('does not mutate the live AI config when SQLite persistence fails', async () => {
    mockSetAppSetting.mockRejectedValue(new Error('sqlite unavailable'));
    const next = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'local-runtime',
            targetId: 'local-model',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    } as const;

    await expect(commitParentosAIConfig(next)).rejects.toThrow('sqlite unavailable');
    expect(useAppStore.getState().aiConfig).toBe(null);
  });
});
