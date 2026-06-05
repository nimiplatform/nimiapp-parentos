import {
  getPlatformClient,
  getRuntimeProductControlRecord,
  type PlatformClient,
} from '@nimiplatform/sdk';
import type { AIConfig, AIScopeRef } from '@nimiplatform/sdk/ai';
import {
  projectFirstRunExecutionEvidenceToAIConfigBindings,
} from '@nimiplatform/sdk/runtime';
import { useAppStore } from '../../app-shell/app-store.js';
import {
  PARENTOS_AI_SCOPE_REF,
  createEmptyParentosAIConfig,
  loadPersistedParentosAIConfig,
  savePersistedParentosAIConfig,
  type ParentosCapabilityId,
} from './parentos-ai-config.js';

const PARENTOS_FIRST_RUN_REQUIRED_CAPABILITIES = ['text.generate'] as const satisfies readonly ParentosCapabilityId[];
const PARENTOS_FIRST_RUN_OPTIONAL_CAPABILITIES = ['audio.transcribe'] as const satisfies readonly ParentosCapabilityId[];
const PARENTOS_FIRST_RUN_CAPABILITIES = [
  ...PARENTOS_FIRST_RUN_REQUIRED_CAPABILITIES,
  ...PARENTOS_FIRST_RUN_OPTIONAL_CAPABILITIES,
] as const;

type ParentosFirstRunCapabilityId = typeof PARENTOS_FIRST_RUN_CAPABILITIES[number];

export type ParentosFirstRunAIConfigInitOutcome =
  | {
      outcome: 'already-bound';
      config: AIConfig;
    }
  | {
      outcome: 'initialized';
      config: AIConfig;
      initializedCapabilities: ParentosFirstRunCapabilityId[];
      executionEvidenceRef: string;
      runtimeBaselineRef: string;
    }
  | {
      outcome: 'not-initialized';
      reason:
        | 'first_run_record_unavailable'
        | 'first_run_evidence_missing'
        | 'first_run_evidence_not_ready'
        | 'first_run_text_binding_missing'
        | 'first_run_config_apply_failed';
      detail: string;
    };

export type ParentosFirstRunAIConfigInitOptions = {
  readonly scopeRef?: AIScopeRef;
  readonly platformClient?: PlatformClient;
  readonly getPlatformClient?: () => PlatformClient;
  readonly loadConfig?: (scopeRef: AIScopeRef) => AIConfig | null | Promise<AIConfig | null>;
  readonly saveConfig?: (next: AIConfig, scopeRef: AIScopeRef) => AIConfig | Promise<AIConfig>;
};

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readBinding(config: AIConfig, capabilityId: ParentosFirstRunCapabilityId) {
  return config.capabilities.selectedBindings[capabilityId] || null;
}

function ensureAIConfigShape(config: AIConfig | null | undefined, scopeRef: AIScopeRef): AIConfig {
  const resolved = config ?? createEmptyParentosAIConfig();
  return {
    ...resolved,
    scopeRef,
    capabilities: {
      selectedBindings: { ...(resolved.capabilities.selectedBindings || {}) },
      localProfileRefs: { ...(resolved.capabilities.localProfileRefs || {}) },
      selectedParams: { ...(resolved.capabilities.selectedParams || {}) },
    },
    profileOrigin: resolved.profileOrigin ?? null,
  };
}

async function loadParentosAIConfigForBootstrap(scopeRef: AIScopeRef): Promise<AIConfig> {
  return ensureAIConfigShape(
    useAppStore.getState().aiConfig || await loadPersistedParentosAIConfig(),
    scopeRef,
  );
}

async function saveParentosAIConfigFromBootstrap(next: AIConfig, _scopeRef: AIScopeRef): Promise<AIConfig> {
  await savePersistedParentosAIConfig(next);
  useAppStore.getState().setAIConfig(next);
  return next;
}

export async function ensureParentosAIConfigFromFirstRunEvidence(
  options: ParentosFirstRunAIConfigInitOptions = {},
): Promise<ParentosFirstRunAIConfigInitOutcome> {
  const scopeRef = options.scopeRef ?? PARENTOS_AI_SCOPE_REF;
  const loadConfig = options.loadConfig ?? loadParentosAIConfigForBootstrap;
  const saveConfig = options.saveConfig ?? saveParentosAIConfigFromBootstrap;
  const config = ensureAIConfigShape(await loadConfig(scopeRef), scopeRef);

  const missingCapabilities = PARENTOS_FIRST_RUN_CAPABILITIES.filter(
    (capabilityId) => !readBinding(config, capabilityId),
  );
  if (missingCapabilities.length === 0) {
    return { outcome: 'already-bound', config };
  }

  const platformClient = options.platformClient
    ?? (options.getPlatformClient ? options.getPlatformClient() : getPlatformClient());

  let recordProjection;
  try {
    recordProjection = await getRuntimeProductControlRecord(platformClient.runtime);
  } catch (error) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_record_unavailable',
      detail: detailFromError(error),
    };
  }

  const firstRun = recordProjection.record?.firstRun ?? null;
  const executionEvidenceRef = String(firstRun?.executionEvidenceRef || '').trim();
  const runtimeBaselineRef = String(firstRun?.runtimeBaselineRef || '').trim();
  const installLevel = String(firstRun?.installLevel || '').trim();
  if (!executionEvidenceRef || !runtimeBaselineRef || !installLevel) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_evidence_missing',
      detail: 'Runtime product-control first-run evidence is incomplete.',
    };
  }

  let resolvedEvidence;
  try {
    resolvedEvidence = await platformClient.runtime.local.resolveFirstRunExecutionEvidence({
      executionEvidenceRef,
      expectedRuntimeBaselineRef: runtimeBaselineRef,
      expectedDataRootRef: '',
      expectedInstallLevel: installLevel,
    });
  } catch (error) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_evidence_not_ready',
      detail: detailFromError(error),
    };
  }

  if (resolvedEvidence.state !== 'local_ai_ready' || !resolvedEvidence.ref) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_evidence_not_ready',
      detail: resolvedEvidence.detail || resolvedEvidence.reasonCode || resolvedEvidence.state,
    };
  }

  let projectedBindings;
  try {
    projectedBindings = projectFirstRunExecutionEvidenceToAIConfigBindings(resolvedEvidence.ref);
  } catch (error) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_text_binding_missing',
      detail: detailFromError(error),
    };
  }

  const projectedByCapability = new Map(projectedBindings.map((item) => [item.capability, item.binding]));
  if (!projectedByCapability.get('text.generate')) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_text_binding_missing',
      detail: 'Verified Runtime first-run evidence did not contain text.generate.',
    };
  }

  const nextBindings = { ...config.capabilities.selectedBindings };
  const initializedCapabilities: ParentosFirstRunCapabilityId[] = [];
  for (const capabilityId of PARENTOS_FIRST_RUN_CAPABILITIES) {
    if (nextBindings[capabilityId]) {
      continue;
    }
    const binding = projectedByCapability.get(capabilityId);
    if (!binding) {
      continue;
    }
    nextBindings[capabilityId] = binding;
    initializedCapabilities.push(capabilityId);
  }

  if (initializedCapabilities.length === 0) {
    return { outcome: 'already-bound', config };
  }

  const next: AIConfig = {
    ...config,
    capabilities: {
      ...config.capabilities,
      selectedBindings: nextBindings,
    },
  };

  try {
    const saved = await saveConfig(next, scopeRef);
    return {
      outcome: 'initialized',
      config: saved,
      initializedCapabilities,
      executionEvidenceRef,
      runtimeBaselineRef,
    };
  } catch (error) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_config_apply_failed',
      detail: detailFromError(error),
    };
  }
}
