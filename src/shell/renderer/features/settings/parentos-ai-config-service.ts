import type {
  NimiAIConfig,
  NimiAIConfigStore,
  NimiAIHostSurface,
  NimiAIScopeRef,
} from '@nimiplatform/sdk/ai';
import {
  createEmptyNimiAIConfig,
  createNimiAIConfigSubscriptionRegistry,
  createNimiAIHostSurface,
  formatNimiAIValidationIssues,
  validateNimiAIConfig,
} from '@nimiplatform/sdk/ai';
import type { SharedAIConfigService } from '@nimiplatform/kit/core/model-config';
import { useAppStore } from '../../app-shell/app-store.js';
import {
  PARENTOS_AI_SCOPE_REF,
  createEmptyParentosAIConfig,
  isParentosAIScopeRef,
  parsePersistedParentosAIConfig,
  savePersistedParentosAIConfig,
} from './parentos-ai-config.js';

type ConfigSubscription = (config: NimiAIConfig) => void;

const configSubscriptions = createNimiAIConfigSubscriptionRegistry();

function notifyConfigSubscribers(config: NimiAIConfig): void {
  configSubscriptions.notify(config);
}

function getConfigForScope(scopeRef: NimiAIScopeRef): NimiAIConfig {
  if (!isParentosAIScopeRef(scopeRef)) {
    return createEmptyNimiAIConfig(scopeRef);
  }
  return useAppStore.getState().aiConfig || createEmptyParentosAIConfig();
}

function normalizeParentosAIConfig(config: NimiAIConfig): NimiAIConfig {
  const validation = validateNimiAIConfig(config);
  if (!validation.valid) {
    throw new Error(`ParentOS AI config validation failed: ${formatNimiAIValidationIssues(validation.issues)}`);
  }
  const resolvedConfig = {
    ...config,
    scopeRef: { ...PARENTOS_AI_SCOPE_REF },
    capabilities: {
      logicalModelIds: { ...(config.capabilities.logicalModelIds || {}) },
      targetRefs: { ...(config.capabilities.targetRefs || {}) },
      selectedComponents: { ...(config.capabilities.selectedComponents || {}) },
      selectedParams: { ...(config.capabilities.selectedParams || {}) },
    },
    profileOrigin: config.profileOrigin ?? null,
  } satisfies NimiAIConfig;
  const normalized = parsePersistedParentosAIConfig(resolvedConfig);
  if (!normalized) {
    throw new Error('ParentOS AI config is invalid for the ParentOS app scope');
  }
  return normalized;
}

async function commitConfig(config: NimiAIConfig): Promise<NimiAIConfig> {
  const resolvedConfig = normalizeParentosAIConfig(config);
  const savedConfig = await savePersistedParentosAIConfig(resolvedConfig);
  useAppStore.getState().setAIConfig(savedConfig);
  notifyConfigSubscribers(savedConfig);
  return savedConfig;
}

const parentosAIConfigStore: NimiAIConfigStore = {
  has(scopeRef: NimiAIScopeRef): boolean {
    return isParentosAIScopeRef(scopeRef) && Boolean(useAppStore.getState().aiConfig);
  },
  load(scopeRef: NimiAIScopeRef): NimiAIConfig {
    return getConfigForScope(scopeRef);
  },
  loadOrNull(scopeRef: NimiAIScopeRef): NimiAIConfig | null {
    return this.has(scopeRef) ? getConfigForScope(scopeRef) : null;
  },
  save(config: NimiAIConfig): NimiAIConfig {
    return normalizeParentosAIConfig(config);
  },
  listScopeRefs(): readonly NimiAIScopeRef[] {
    return useAppStore.getState().aiConfig ? [{ ...PARENTOS_AI_SCOPE_REF }] : [];
  },
};

function createParentosAIHostSurface(): NimiAIHostSurface {
  return createNimiAIHostSurface({
    profiles: [],
    configStore: parentosAIConfigStore,
    subscriptions: configSubscriptions,
  });
}

export async function commitParentosAIConfig(config: NimiAIConfig): Promise<NimiAIConfig> {
  return commitConfig(config);
}

function createAIProfileSurface(): SharedAIConfigService['aiProfile'] {
  return {
    async list() {
      return [...await createParentosAIHostSurface().aiProfile.list()];
    },
    async previewApply(scopeRef, profileId, options) {
      return createParentosAIHostSurface().aiProfile.previewApply(scopeRef, profileId, options);
    },
    async apply(scopeRef, profileId, options) {
      const result = await createParentosAIHostSurface().aiProfile.apply(scopeRef, profileId, options);
      if (!result.success || !result.config) {
        return result;
      }
      const saved = await commitConfig(result.config);
      return {
        ...result,
        config: saved,
      };
    },
  };
}

function createAIConfigSurface(): SharedAIConfigService['aiConfig'] {
  return {
    get(scopeRef: NimiAIScopeRef): NimiAIConfig {
      return getConfigForScope(scopeRef);
    },

    async update(scopeRef: NimiAIScopeRef, config: NimiAIConfig): Promise<void> {
      if (!isParentosAIScopeRef(scopeRef)) {
        return;
      }
      await commitConfig({
        ...config,
        scopeRef: { ...PARENTOS_AI_SCOPE_REF },
      });
    },

    subscribe(scopeRef: NimiAIScopeRef, callback: (config: NimiAIConfig) => void): () => void {
      if (!isParentosAIScopeRef(scopeRef)) {
        return () => {};
      }
      return configSubscriptions.subscribe(scopeRef, callback as ConfigSubscription);
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
