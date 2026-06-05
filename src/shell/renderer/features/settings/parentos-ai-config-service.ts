import type {
  NimiAIConfig,
  NimiAIProfileApplyResult,
  NimiAIProfilePreviewResult,
  NimiAIScopeRef,
} from '@nimiplatform/sdk/ai';
import {
  createEmptyNimiAIConfig,
  diffNimiAIConfigs,
  versionNimiAIConfig,
} from '@nimiplatform/sdk/ai';
import type { SharedAIConfigService } from '@nimiplatform/kit/core/model-config';
import { useAppStore } from '../../app-shell/app-store.js';
import {
  PARENTOS_AI_SCOPE_REF,
  createEmptyParentosAIConfig,
  isParentosAIScopeRef,
  savePersistedParentosAIConfig,
} from './parentos-ai-config.js';
import { catchLog } from '../../infra/telemetry/catch-log.js';

type ConfigSubscription = (config: NimiAIConfig) => void;

const configSubscriptions = new Set<ConfigSubscription>();

function notifyConfigSubscribers(config: NimiAIConfig): void {
  for (const callback of configSubscriptions) {
    try {
      callback(config);
    } catch {
      // Subscriber failures must not break config writes.
    }
  }
}

function getConfigForScope(scopeRef: NimiAIScopeRef): NimiAIConfig {
  if (!isParentosAIScopeRef(scopeRef)) {
    return createEmptyNimiAIConfig(scopeRef);
  }
  return useAppStore.getState().aiConfig || createEmptyParentosAIConfig();
}

function commitConfig(config: NimiAIConfig): void {
  const resolvedConfig = {
    ...config,
    scopeRef: { ...PARENTOS_AI_SCOPE_REF },
    capabilities: {
      targetRefs: { ...(config.capabilities.targetRefs || {}) },
      selectedParams: { ...(config.capabilities.selectedParams || {}) },
    },
    profileOrigin: config.profileOrigin ?? null,
  } satisfies NimiAIConfig;
  useAppStore.getState().setAIConfig(resolvedConfig);
  notifyConfigSubscribers(resolvedConfig);
  void savePersistedParentosAIConfig(resolvedConfig).catch(catchLog('ai-config', 'action:save-persisted-ai-config-failed'));
}

function createMissingProfilePreview(
  scopeRef: NimiAIScopeRef,
  profileId: string,
): NimiAIProfilePreviewResult {
  const before = getConfigForScope(scopeRef);
  return {
    before,
    after: null,
    outcome: 'invalid_profile',
    diff: diffNimiAIConfigs(before, null),
    baseVersion: versionNimiAIConfig(before),
    probeWarnings: [`Profile not found: ${profileId}`],
  };
}

function createAIProfileSurface(): SharedAIConfigService['aiProfile'] {
  return {
    async list() {
      return [];
    },
    async previewApply(scopeRef: NimiAIScopeRef, profileId: string): Promise<NimiAIProfilePreviewResult> {
      return createMissingProfilePreview(scopeRef, profileId);
    },
    async apply(scopeRef: NimiAIScopeRef, profileId: string): Promise<NimiAIProfileApplyResult> {
      return {
        success: false,
        config: null,
        failureReason: `Profile not found: ${profileId}`,
        outcome: 'invalid_profile',
        probeWarnings: [],
      };
    },
  };
}

function createAIConfigSurface(): SharedAIConfigService['aiConfig'] {
  return {
    get(scopeRef: NimiAIScopeRef): NimiAIConfig {
      return getConfigForScope(scopeRef);
    },

    update(scopeRef: NimiAIScopeRef, config: NimiAIConfig): void {
      if (!isParentosAIScopeRef(scopeRef)) {
        return;
      }
      commitConfig({
        ...config,
        scopeRef: { ...PARENTOS_AI_SCOPE_REF },
      });
    },

    subscribe(scopeRef: NimiAIScopeRef, callback: (config: NimiAIConfig) => void): () => void {
      if (!isParentosAIScopeRef(scopeRef)) {
        return () => {};
      }
      configSubscriptions.add(callback);
      return () => {
        configSubscriptions.delete(callback);
      };
    },
  };
}

let parentosAIConfigServiceSingleton: SharedAIConfigService | null = null;

export function getParentosAIConfigService(): SharedAIConfigService {
  if (!parentosAIConfigServiceSingleton) {
    parentosAIConfigServiceSingleton = {
      aiProfile: createAIProfileSurface(),
      aiConfig: createAIConfigSurface(),
    };
  }
  return parentosAIConfigServiceSingleton;
}
