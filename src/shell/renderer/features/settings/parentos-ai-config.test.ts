import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NimiAIConfig } from '@nimiplatform/sdk/ai';

const { getAppSettingMock, setAppSettingMock } = vi.hoisted(() => ({
  getAppSettingMock: vi.fn(),
  setAppSettingMock: vi.fn(),
}));

vi.mock('../../bridge/sqlite-bridge.js', () => ({
  getAppSetting: getAppSettingMock,
  setAppSetting: setAppSettingMock,
}));

import {
  PARENTOS_AI_SCOPE_REF,
  loadPersistedParentosAIConfig,
  parsePersistedParentosAIConfig,
  savePersistedParentosAIConfig,
} from './parentos-ai-config.js';

describe('ParentOS app-owned AI configuration', () => {
  beforeEach(() => {
    getAppSettingMock.mockReset().mockResolvedValue(null);
    setAppSettingMock.mockReset().mockResolvedValue(undefined);
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
          'text.generate': { temperature: 0.2 },
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
          'text.generate': { temperature: 0.2 },
        },
      },
      profileOrigin: {
        profileId: 'profile-1',
        title: 'Recommended',
        appliedAt: '2026-04-10T09:00:00.000Z',
      },
    });
  });

  it('rejects retired local target ids while parsing ParentOS AI config', () => {
    expect(parsePersistedParentosAIConfig(JSON.stringify({
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
    }))).toBeNull();
  });

  it('preserves canonical cloud bindings while parsing', () => {
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

  it('loads app-owned AI preferences without a Nimi permission decision', async () => {
    getAppSettingMock.mockResolvedValue(JSON.stringify({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: { targetRefs: {}, selectedParams: {} },
      profileOrigin: null,
    }));

    await expect(loadPersistedParentosAIConfig()).resolves.toEqual({
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: { targetRefs: {}, selectedParams: {} },
      profileOrigin: null,
    });
    expect(getAppSettingMock).toHaveBeenCalledWith('parentos:ai-config:v1');
  });

  it('validates and persists AI preferences in ParentOS SQLite', async () => {
    const input = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
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

    await expect(savePersistedParentosAIConfig(input)).resolves.toEqual(input);
    expect(setAppSettingMock).toHaveBeenCalledWith(
      'parentos:ai-config:v1',
      JSON.stringify(input),
      expect.any(String),
    );
    await expect(savePersistedParentosAIConfig({} as NimiAIConfig))
      .rejects.toThrow('ParentOS AI config is invalid');
  });
});
