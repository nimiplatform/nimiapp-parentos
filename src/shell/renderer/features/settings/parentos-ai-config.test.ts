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
            providerModelId: 'gpt-5.4',
            provider: 'openai',
          },
          'text.generate.vision': {
            kind: 'cloud-connector',
            connectorId: 'connector-vision',
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
            providerModelId: 'gpt-5.4',
            provider: 'openai',
          }),
          'text.generate.vision': expect.objectContaining({
            kind: 'cloud-connector',
            connectorId: 'connector-vision',
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

  it('returns null when the persisted scope does not match ParentOS', async () => {
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

    await expect(loadPersistedParentosAIConfig()).resolves.toBeNull();
  });

  it('persists the normalized config into app settings', async () => {
    await savePersistedParentosAIConfig({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate.vision': {
            kind: 'cloud-connector',
            connectorId: 'openai-vision',
            providerModelId: 'gpt-5.4-vision',
          },
          'audio.transcribe': {
            kind: 'local-runtime',
            targetId: 'whisper-large-v3',
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
              providerModelId: 'gpt-5.4-vision',
            },
            'audio.transcribe': {
              kind: 'local-runtime',
              targetId: 'whisper-large-v3',
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
      providerModelId: 'gpt-5.4',
    });
  });
});
