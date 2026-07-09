import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeNimiAIScopeRef, type NimiAIConfig } from '@nimiplatform/sdk/ai';

const mockAiConfigGet = vi.fn();
const mockAiConfigSet = vi.fn();

vi.mock('../../bridge/index.js', () => ({
  createInstalledNimiAppStandardShellSurface: () => ({
    aiConfig: {
      get: mockAiConfigGet,
      set: mockAiConfigSet,
    },
  }),
}));

const {
  PARENTOS_AI_SCOPE_REF,
  loadPersistedParentosAIConfig,
  parsePersistedParentosAIConfig,
  savePersistedParentosAIConfig,
} = await import('./parentos-ai-config.js');

describe('parentos-ai-config persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes a persisted ParentOS AI config payload', () => {
    const parsed = parsePersistedParentosAIConfig(JSON.stringify({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'cloud-connector',
            connectorId: 'connector-1',
            remoteModelCatalogId: 'remote-catalog:connector-1:gpt-5.4',
            providerModelId: 'gpt-5.4',
            provider: 'openai',
          },
          'text.generate.vision': {
            kind: 'cloud-connector',
            connectorId: 'connector-vision',
            remoteModelCatalogId: 'remote-catalog:connector-vision:gpt-5.4-vision',
            providerModelId: 'gpt-5.4-vision',
            provider: 'openai',
          },
          'audio.transcribe': null,
        },
        selectedParams: {
          'text.generate': {
            temperature: 0.2,
          },
        },
      },
      profileOrigin: {
        profileId: 'profile-1',
        title: 'Recommended',
        appliedAt: '2026-04-10T09:00:00.000Z',
      },
    }));

    expect(parsed).toEqual({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': expect.objectContaining({
            kind: 'cloud-connector',
            connectorId: 'connector-1',
            remoteModelCatalogId: 'remote-catalog:connector-1:gpt-5.4',
            providerModelId: 'gpt-5.4',
            provider: 'openai',
          }),
          'text.generate.vision': expect.objectContaining({
            kind: 'cloud-connector',
            connectorId: 'connector-vision',
            remoteModelCatalogId: 'remote-catalog:connector-vision:gpt-5.4-vision',
            providerModelId: 'gpt-5.4-vision',
            provider: 'openai',
          }),
        },
        selectedParams: {
          'text.generate': {
            temperature: 0.2,
          },
        },
      },
      profileOrigin: {
        profileId: 'profile-1',
        title: 'Recommended',
        appliedAt: '2026-04-10T09:00:00.000Z',
      },
    });
  });

  it('fails closed when a persisted config exists under the ParentOS key but has the wrong scope', async () => {
    mockAiConfigGet.mockResolvedValue({
      scopeRef: {
        kind: 'app',
        ownerId: 'desktop',
        surfaceId: 'chat',
      },
      capabilities: {
        targetRefs: {},
        selectedParams: {},
      },
      profileOrigin: null,
    });

    await expect(loadPersistedParentosAIConfig()).rejects.toThrow('Persisted ParentOS AI config is invalid');
    expect(mockAiConfigGet).toHaveBeenCalledWith(encodeNimiAIScopeRef(PARENTOS_AI_SCOPE_REF));
  });

  it('rejects retired local target ids while parsing ParentOS AI config', () => {
    const parsed = parsePersistedParentosAIConfig(JSON.stringify({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'local-runtime',
            targetId: 'local-qwen',
            profileId: 'runtime-baseline:ready',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    }));

    expect(parsed).toBeNull();
  });

  it('fails closed when standard shell returns invalid ParentOS target refs', async () => {
    const raw = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'cloud-connector',
            connectorId: 'openai-main',
            providerModelId: 'gpt-5.4',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    };
    mockAiConfigGet.mockResolvedValue(raw);

    await expect(loadPersistedParentosAIConfig()).rejects.toThrow('Persisted ParentOS AI config is invalid');
    expect(mockAiConfigSet).not.toHaveBeenCalled();
  });

  it('returns null when the standard shell reports the scope is missing', async () => {
    const error = new Error('not found') as Error & { reasonCode?: string };
    error.reasonCode = 'electron-ai-config-scope-not-found';
    mockAiConfigGet.mockRejectedValue(error);

    await expect(loadPersistedParentosAIConfig()).resolves.toBeNull();
  });

  it('fails closed when standard shell storage cannot be read', async () => {
    mockAiConfigGet.mockRejectedValue(new Error('standard shell read failed'));

    await expect(loadPersistedParentosAIConfig()).rejects.toThrow('standard shell read failed');
  });

  it('persists the normalized config into standard shell ai-config storage', async () => {
    const input = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate.vision': {
            kind: 'cloud-connector',
            connectorId: 'openai-vision',
            remoteModelCatalogId: 'remote-catalog:openai-vision:gpt-5.4-vision',
            providerModelId: 'gpt-5.4-vision',
          },
          'audio.transcribe': {
            kind: 'local-runtime',
            version: 'v2',
            profileBindingId: 'local-runtime:whisper-large-v3',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    } satisfies NimiAIConfig;
    mockAiConfigSet.mockResolvedValue(input);

    await expect(savePersistedParentosAIConfig(input)).resolves.toEqual(input);

    expect(mockAiConfigSet).toHaveBeenCalledTimes(1);
    expect(mockAiConfigSet).toHaveBeenCalledWith(
      encodeNimiAIScopeRef(PARENTOS_AI_SCOPE_REF),
      {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          targetRefs: {
            'text.generate.vision': {
              kind: 'cloud-connector',
              connectorId: 'openai-vision',
              remoteModelCatalogId: 'remote-catalog:openai-vision:gpt-5.4-vision',
              providerModelId: 'gpt-5.4-vision',
            },
            'audio.transcribe': {
              kind: 'local-runtime',
              version: 'v2',
              profileBindingId: 'local-runtime:whisper-large-v3',
            },
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    );
  });

  it('preserves persisted cloud bindings for ParentOS capability settings', () => {
    const parsed = parsePersistedParentosAIConfig(JSON.stringify({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'cloud-connector',
            connectorId: 'openai-main',
            remoteModelCatalogId: 'remote-catalog:openai-main:gpt-5.4',
            providerModelId: 'gpt-5.4',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    }));

    expect(parsed?.capabilities.targetRefs['text.generate']).toEqual({
      kind: 'cloud-connector',
      connectorId: 'openai-main',
      remoteModelCatalogId: 'remote-catalog:openai-main:gpt-5.4',
      providerModelId: 'gpt-5.4',
    });
  });
});
