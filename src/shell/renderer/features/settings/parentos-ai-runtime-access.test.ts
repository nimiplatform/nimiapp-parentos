import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { PARENTOS_AI_SCOPE_REF } from './parentos-ai-config.js';
import {
  buildParentosRuntimeMetadata,
  resolveParentosBinding,
  resolveParentosTextSurfaceConfig,
} from './parentos-ai-runtime.js';

const localTextTargetRef = {
  kind: 'local-runtime' as const,
  version: 'v2' as const,
  profileBindingId: 'local-runtime:qwen3',
};

const cloudTextTargetRef = {
  kind: 'cloud-connector' as const,
  connectorId: 'openai-main',
  remoteModelCatalogId: 'remote-catalog:openai-main:gpt-5.4',
  providerModelId: 'gpt-5.4',
};

const cloudVisionTargetRef = {
  kind: 'cloud-connector' as const,
  connectorId: 'openai-vision',
  remoteModelCatalogId: 'remote-catalog:openai-vision:gpt-5.4-vision',
  providerModelId: 'gpt-5.4-vision',
};

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
            'text.generate': localTextTargetRef,
          },
          selectedParams: {},
        },
        profileOrigin: null,
      },
    });

    expect(resolveParentosBinding('text.generate')).toEqual({
      model: 'local-runtime:qwen3',
      route: 'local',
      targetRef: localTextTargetRef,
    });
  });

  it('returns a cloud route and connector id for cloud capability bindings', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          targetRefs: {
            'text.generate': cloudTextTargetRef,
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
      targetRef: cloudTextTargetRef,
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
              remoteModelCatalogId: 'remote-catalog:openai-main:gpt-5.4-mini',
              providerModelId: 'gpt-5.4-mini',
            },
            'text.generate.vision': cloudVisionTargetRef,
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
      targetRef: cloudVisionTargetRef,
    });
  });

  it('builds stable ParentOS runtime metadata for governed surfaces', () => {
    expect(buildParentosRuntimeMetadata('parentos.advisor')).toEqual({
      callerKind: 'developer-registered-local-app',
      callerId: 'nimi.parentos',
      surfaceId: 'parentos.advisor',
    });
  });

  it('preserves cloud route bindings for governed ParentOS surfaces', () => {
    useAppStore.setState({
      aiConfig: {
        scopeRef: PARENTOS_AI_SCOPE_REF,
        capabilities: {
          targetRefs: {
            'text.generate': cloudTextTargetRef,
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
      targetRef: cloudTextTargetRef,
      temperature: undefined,
      topP: undefined,
      maxTokens: undefined,
      timeoutMs: undefined,
    });
  });
});
