import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { PARENTOS_AI_SCOPE_REF } from './parentos-ai-config.js';
import {
  ensureParentosLocalRuntimeReady,
  resolveParentosImageTextRuntimeConfig,
  resolveParentosSpeechTranscribeRuntimeConfig,
  resolveParentosSpeechTranscribeConfig,
  resolveParentosSpeechTranscribeSurfaceConfig,
  resolveParentosTextRuntimeConfig,
  resolveParentosTextGenerateConfig,
  resolveParentosTextSurfaceConfig,
} from './parentos-ai-runtime.js';

const {
  warmLocalAssetMock,
  runtimeReadyMock,
  loadParentosRuntimeRouteOptionsMock,
  getParentOSNimiClientMock,
} = vi.hoisted(() => ({
  warmLocalAssetMock: vi.fn(async () => ({})),
  runtimeReadyMock: vi.fn(async () => ({})),
  loadParentosRuntimeRouteOptionsMock: vi.fn(async (capability: string): Promise<any> => ({
    capability,
    selected: null,
    local: {
      defaultEndpoint: 'http://127.0.0.1:1234/v1',
      models: [
        {
          label: 'qwen3',
          engine: 'llama',
          model: 'qwen3',
          modelId: 'qwen3',
          provider: 'llama',
          endpoint: 'http://127.0.0.1:1234/v1',
          status: 'active',
          goRuntimeStatus: 'active',
          capabilities: ['text.generate'],
        },
        {
          label: 'gemma-4-vision',
          engine: 'llama',
          model: 'gemma-4-vision',
          modelId: 'gemma-4-vision',
          provider: 'llama',
          endpoint: 'http://127.0.0.1:1234/v1',
          status: 'active',
          goRuntimeStatus: 'active',
          capabilities: ['text.generate.vision'],
        },
        {
          label: 'whisper-large-v3',
          engine: 'speech',
          model: 'whisper-large-v3',
          modelId: 'whisper-large-v3',
          provider: 'speech',
          endpoint: 'http://127.0.0.1:1234/v1',
          status: 'active',
          goRuntimeStatus: 'active',
          capabilities: ['audio.transcribe'],
        },
      ],
    },
    connectors: [
      {
        id: 'openai-main',
        label: 'OpenAI',
        provider: 'openai',
        models: ['gpt-5.4', 'gpt-4o-mini-transcribe'],
        modelCapabilities: {
          'gpt-5.4': ['text.generate'],
          'gpt-4o-mini-transcribe': ['audio.transcribe'],
        },
        modelProfiles: [],
      },
      {
        id: 'chat-main',
        label: 'Google',
        provider: 'google',
        models: ['gemini-3.1-flash-lite-preview'],
        modelCapabilities: {
          'gemini-3.1-flash-lite-preview': ['text.generate'],
        },
        modelProfiles: [],
      },
      {
        id: 'vision-main',
        label: 'Google',
        provider: 'google',
        models: ['gemini-3.1-pro-vision'],
        modelCapabilities: {
          'gemini-3.1-pro-vision': ['text.generate.vision'],
        },
        modelProfiles: [],
      },
    ],
  })),
  getParentOSNimiClientMock: vi.fn(() => ({
    runtime: {
      ready: vi.fn(async () => ({})),
      local: {
        warmLocalAsset: vi.fn(async () => ({})),
      },
    },
  })),
}));

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => getParentOSNimiClientMock(),
}));

vi.mock('../../infra/parentos-runtime-route-options.js', () => ({
  loadParentosRuntimeRouteOptions: loadParentosRuntimeRouteOptionsMock,
}));

function localTargetRef(localAssetId: string) {
  return {
    kind: 'local-runtime' as const,
    version: 'v2' as const,
    profileBindingId: `local-runtime:${localAssetId}`,
  };
}

function cloudTargetRef(connectorId: string, providerModelId: string) {
  return {
    kind: 'cloud-connector' as const,
    connectorId,
    remoteModelCatalogId: `remote-catalog:${connectorId}:${providerModelId}`,
    providerModelId,
  };
}

describe('parentos-ai-runtime', () => {
  beforeEach(() => {
    useAppStore.setState({ aiConfig: null });
    warmLocalAssetMock.mockReset();
    runtimeReadyMock.mockReset();
    loadParentosRuntimeRouteOptionsMock.mockClear();
    getParentOSNimiClientMock.mockClear();
    getParentOSNimiClientMock.mockReturnValue({
      runtime: {
        ready: runtimeReadyMock,
        local: {
          warmLocalAsset: warmLocalAssetMock,
        },
      },
    });
  });

  it('merges text capability defaults with stored runtime config', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': localTargetRef('local-gemma-4'),
          },
          selectedParams: {
            'text.generate': {
              temperature: 0.2,
              maxTokens: 900,
            },
          },
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosTextGenerateConfig({ temperature: 0.7, topP: 0.9, maxTokens: 1024 })).toEqual({
      model: 'local-runtime:local-gemma-4',
      route: 'local',
      targetRef: localTargetRef('local-gemma-4'),
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 900,
      timeoutMs: undefined,
    });
  });

  it('merges speech transcribe defaults with stored runtime config', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'audio.transcribe': localTargetRef('local-whisper-large-v3'),
          },
          selectedParams: {
            'audio.transcribe': {
              prompt: '儿童成长记录',
              diarization: true,
              speakerCount: 2,
            },
          },
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosSpeechTranscribeConfig({ language: 'zh-CN', responseFormat: 'text', timestamps: false })).toEqual({
      model: 'local-runtime:local-whisper-large-v3',
      route: 'local',
      targetRef: localTargetRef('local-whisper-large-v3'),
      language: 'zh-CN',
      responseFormat: 'text',
      timestamps: false,
      diarization: true,
      speakerCount: 2,
      prompt: '儿童成长记录',
      timeoutMs: undefined,
    });
  });

  it('preserves cloud text bindings for ParentOS surfaces', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': cloudTargetRef('openai-main', 'gpt-5.4'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosTextSurfaceConfig('parentos.advisor', { maxTokens: 1000 })).toEqual({
      model: 'gpt-5.4',
      route: 'cloud',
      connectorId: 'openai-main',
      targetRef: cloudTargetRef('openai-main', 'gpt-5.4'),
      temperature: undefined,
      topP: undefined,
      maxTokens: 1000,
      timeoutMs: undefined,
    });
  });

  it('preserves cloud STT bindings for ParentOS surfaces', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'audio.transcribe': cloudTargetRef('openai-main', 'gpt-4o-mini-transcribe'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosSpeechTranscribeSurfaceConfig('parentos.journal.voice-observation', {
      language: 'zh-CN',
    })).toEqual({
      model: 'gpt-4o-mini-transcribe',
      route: 'cloud',
      connectorId: 'openai-main',
      targetRef: cloudTargetRef('openai-main', 'gpt-4o-mini-transcribe'),
      language: 'zh-CN',
      responseFormat: undefined,
      timestamps: undefined,
      diarization: undefined,
      speakerCount: undefined,
      prompt: undefined,
      timeoutMs: undefined,
    });
  });

  it('resolves explicit local text runtime config to a qualified local selector', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': localTargetRef('local-qwen3'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    await expect(resolveParentosTextRuntimeConfig('parentos.advisor', { maxTokens: 1000 })).resolves.toEqual({
      model: 'local-runtime:local-qwen3',
      route: 'local',
      connectorId: undefined,
      temperature: undefined,
      topP: undefined,
      maxTokens: 1000,
      timeoutMs: undefined,
      targetRef: localTargetRef('local-qwen3'),
    });
  });

  it('warms Runtime readiness for local runtime targets only', async () => {
    await ensureParentosLocalRuntimeReady({
      targetRef: localTargetRef('local-qwen3'),
      surfaceId: 'parentos.advisor',
    });

    expect(runtimeReadyMock).toHaveBeenCalledTimes(1);

    await ensureParentosLocalRuntimeReady({
      targetRef: cloudTargetRef('openai-main', 'gpt-5.4'),
      surfaceId: 'parentos.advisor',
    });

    expect(runtimeReadyMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed for OCR when only the generic chat binding is configured', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': localTargetRef('local-qwen3'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });
    await expect(resolveParentosImageTextRuntimeConfig('parentos.profile.checkup-ocr', { maxTokens: 800 })).rejects.toThrow(
      '当前 AI 智能识别模型未配置',
    );
  });

  it('fails closed when no image-capable OCR text model is available', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': localTargetRef('local-qwen3'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });
    await expect(resolveParentosImageTextRuntimeConfig('parentos.profile.checkup-ocr', { maxTokens: 800 })).rejects.toThrow(
      '当前 AI 智能识别模型未配置，请在 AI 设置中为“智能识别”选择支持视觉输入的模型后重试。',
    );
  });

  it('prefers the dedicated vision binding over the generic chat binding for OCR', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': {
              ...cloudTargetRef('chat-main', 'gemini-3.1-flash-lite-preview'),
            },
            'text.generate.vision': cloudTargetRef('vision-main', 'gemini-3.1-pro-vision'),
          },
          selectedParams: {
            'text.generate.vision': {
              maxTokens: 1200,
            },
          },
        },
        profileOrigin: null,
      },
    });
    loadParentosRuntimeRouteOptionsMock.mockResolvedValueOnce({
      capability: 'text.generate',
      selected: {
        source: 'cloud',
        connectorId: 'vision-main',
        model: 'gemini-3.1-pro-vision',
        provider: 'google',
      },
      resolvedDefault: {
        source: 'cloud',
        connectorId: 'vision-main',
        model: 'gemini-3.1-pro-vision',
        provider: 'google',
      },
      local: {
        defaultEndpoint: 'http://127.0.0.1:1234/v1',
        models: [],
      },
      connectors: [
        {
          id: 'vision-main',
          label: 'Google',
          provider: 'google',
          models: ['gemini-3.1-pro-vision'],
          modelCapabilities: {
            'gemini-3.1-pro-vision': ['text.generate', 'text.generate.vision'],
          },
          modelProfiles: [],
        },
      ],
    } as any);

    await expect(resolveParentosImageTextRuntimeConfig('parentos.profile.checkup-ocr')).resolves.toEqual({
      model: 'gemini-3.1-pro-vision',
      route: 'cloud',
      connectorId: 'vision-main',
      temperature: undefined,
      topP: undefined,
      maxTokens: 1200,
      timeoutMs: undefined,
      targetRef: cloudTargetRef('vision-main', 'gemini-3.1-pro-vision'),
    });
  });

  it('resolves explicit local STT runtime config to a qualified local selector', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'audio.transcribe': localTargetRef('local-whisper-large-v3'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    await expect(resolveParentosSpeechTranscribeRuntimeConfig('parentos.journal.voice-observation', {
      language: 'zh-CN',
    })).resolves.toEqual({
      model: 'local-runtime:local-whisper-large-v3',
      route: 'local',
      connectorId: undefined,
      language: 'zh-CN',
      responseFormat: undefined,
      timestamps: undefined,
      diarization: undefined,
      speakerCount: undefined,
      prompt: undefined,
      timeoutMs: undefined,
      targetRef: localTargetRef('local-whisper-large-v3'),
    });
  });

  it('fails closed when no explicit route binding exists', async () => {
    await expect(resolveParentosTextRuntimeConfig('parentos.advisor', { maxTokens: 1000 })).rejects.toThrow(
      'ParentOS AI 对话模型未配置',
    );
  });

  it('resolves ParentOS text runtime config to a qualified cloud selector when configured', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'text.generate': cloudTargetRef('openai-main', 'gpt-5.4'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    await expect(resolveParentosTextRuntimeConfig('parentos.advisor', { maxTokens: 1000 })).resolves.toEqual({
      model: 'gpt-5.4',
      route: 'cloud',
      connectorId: 'openai-main',
      temperature: undefined,
      topP: undefined,
      maxTokens: 1000,
      timeoutMs: undefined,
      targetRef: cloudTargetRef('openai-main', 'gpt-5.4'),
    });
  });

  it('resolves ParentOS STT runtime config to a qualified cloud selector when configured', async () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          logicalModelIds: {},
          selectedComponents: {},
          targetRefs: {
            'audio.transcribe': cloudTargetRef('openai-main', 'gpt-4o-mini-transcribe'),
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    await expect(resolveParentosSpeechTranscribeRuntimeConfig('parentos.journal.voice-observation', {
      language: 'zh-CN',
    })).resolves.toEqual({
      model: 'gpt-4o-mini-transcribe',
      route: 'cloud',
      connectorId: 'openai-main',
      language: 'zh-CN',
      responseFormat: undefined,
      timestamps: undefined,
      diarization: undefined,
      speakerCount: undefined,
      prompt: undefined,
      timeoutMs: undefined,
      targetRef: cloudTargetRef('openai-main', 'gpt-4o-mini-transcribe'),
    });
  });
});
