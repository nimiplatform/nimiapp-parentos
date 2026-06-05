import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { PARENTOS_AI_SCOPE_REF } from './parentos-ai-config.js';
import {
  buildParentosRuntimeMetadata,
  resolveParentosBinding,
  resolveParentosTextSurfaceConfig,
} from './parentos-ai-runtime.js';

describe('parentos-ai-runtime access helpers', () => {
  beforeEach(() => {
    useAppStore.setState({
      aiConfig: null,
      runtimeDefaults: null,
    });
  });

  it('returns null when no capability binding exists', () => {
    expect(resolveParentosBinding('text.generate')).toBeNull();
  });

  it('returns a local route for local capability bindings', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          targetRefs: {
            'text.generate': {
              kind: 'local-runtime',
              targetId: 'qwen3',
            },
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosBinding('text.generate')).toEqual({
      model: 'qwen3',
      route: 'local',
      localModelId: 'qwen3',
    });
  });

  it('returns a cloud route and connector id for cloud capability bindings', () => {
    useAppStore.setState({
      aiConfig: {
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
      },
    });

    expect(resolveParentosBinding('text.generate')).toEqual({
      model: 'gpt-5.4',
      route: 'cloud',
      connectorId: 'openai-main',
    });
  });

  it('reads dedicated vision bindings without falling back to chat bindings', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          targetRefs: {
            'text.generate': {
              kind: 'cloud-connector',
              connectorId: 'openai-main',
              providerModelId: 'gpt-5.4-mini',
            },
            'text.generate.vision': {
              kind: 'cloud-connector',
              connectorId: 'openai-vision',
              providerModelId: 'gpt-5.4-vision',
            },
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosBinding('text.generate.vision')).toEqual({
      model: 'gpt-5.4-vision',
      route: 'cloud',
      connectorId: 'openai-vision',
    });
  });

  it('builds stable ParentOS runtime metadata for governed surfaces', () => {
    expect(buildParentosRuntimeMetadata('parentos.advisor')).toEqual({
      callerKind: 'third-party-app',
      callerId: 'ai.nimi.apps.parentos',
      surfaceId: 'parentos.advisor',
    });
  });

  it('preserves cloud route bindings for governed ParentOS surfaces', () => {
    useAppStore.setState({
      aiConfig: {
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
      },
    });

    expect(resolveParentosTextSurfaceConfig('parentos.report')).toEqual({
      model: 'gpt-5.4',
      route: 'cloud',
      connectorId: 'openai-main',
      temperature: undefined,
      topP: undefined,
      maxTokens: undefined,
      timeoutMs: undefined,
    });
  });
});
