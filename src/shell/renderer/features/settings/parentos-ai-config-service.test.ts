import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';

const mockAiConfigSet = vi.fn();

vi.mock('../../bridge/index.js', () => ({
  createInstalledNimiAppStandardShellSurface: () => ({
    aiConfig: {
      get: vi.fn(),
      set: mockAiConfigSet,
    },
  }),
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
    mockAiConfigSet.mockReset();
    mockAiConfigSet.mockImplementation(async (_scopeRef: string, config: unknown) => config);
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
    expect(mockAiConfigSet).not.toHaveBeenCalled();
  });

  it('commits AI config only after standard shell persistence succeeds', async () => {
    const unsubscribe = vi.fn();
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

    getParentosAIConfigService().aiConfig.subscribe(PARENTOS_AI_SCOPE_REF, unsubscribe);
    const saved = await commitParentosAIConfig(next);

    expect(saved.capabilities.targetRefs['text.generate']).toEqual({
      kind: 'local-runtime',
      version: 'v2',
      profileBindingId: 'local-runtime:local-model',
    });
    expect(mockAiConfigSet).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().aiConfig).toEqual(saved);
    expect(unsubscribe).toHaveBeenCalledWith(saved);
  });

  it('does not mutate the live AI config when standard shell persistence fails', async () => {
    mockAiConfigSet.mockRejectedValue(new Error('standard shell unavailable'));
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

    await expect(commitParentosAIConfig(next)).rejects.toThrow('standard shell unavailable');
    expect(useAppStore.getState().aiConfig).toBe(null);
  });
});
