import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAppSetting = vi.fn();
const mockSetAppSetting = vi.fn();

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getAppSetting: mockGetAppSetting,
  setAppSetting: mockSetAppSetting,
}));

vi.mock('../../bridge/ulid.js', () => ({
  isoNow: () => '2026-04-10T10:00:00.000Z',
}));

const {
  PARENTOS_AI_CONFIG_QUARANTINE_PREFIX,
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
    mockGetAppSetting.mockResolvedValue(JSON.stringify({
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
    }));

    await expect(loadPersistedParentosAIConfig()).rejects.toThrow('Persisted ParentOS AI config is invalid');
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

  it('quarantines invalid persisted ParentOS target refs and clears the active setting', async () => {
    const raw = JSON.stringify({
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
    });
    mockGetAppSetting.mockResolvedValue(raw);

    await expect(loadPersistedParentosAIConfig()).resolves.toBeNull();

    expect(mockSetAppSetting).toHaveBeenCalledTimes(2);
    const [quarantineKey, quarantinePayload] = mockSetAppSetting.mock.calls[0]!;
    expect(quarantineKey).toMatch(new RegExp(`^${PARENTOS_AI_CONFIG_QUARANTINE_PREFIX}`));
    expect(JSON.parse(quarantinePayload as string)).toMatchObject({
      schemaVersion: 1,
      reasonCode: 'PARENTOS_AI_CONFIG_STORE_INVALID',
      raw,
    });
    expect(mockSetAppSetting.mock.calls[1]).toEqual([
      'parentos.ai.config',
      '',
      '2026-04-10T10:00:00.000Z',
    ]);
  });

  it('fails closed when app setting storage cannot be read', async () => {
    mockGetAppSetting.mockRejectedValue(new Error('sqlite read failed'));

    await expect(loadPersistedParentosAIConfig()).rejects.toThrow('sqlite read failed');
  });

  it('persists the normalized config into app settings', async () => {
    await savePersistedParentosAIConfig({
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
    });

    expect(mockSetAppSetting).toHaveBeenCalledTimes(1);
    expect(mockSetAppSetting).toHaveBeenCalledWith(
      'parentos.ai.config',
      JSON.stringify({
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
      }),
      '2026-04-10T10:00:00.000Z',
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
