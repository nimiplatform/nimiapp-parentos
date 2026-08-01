import type { NimiClient } from '@nimiplatform/sdk';
import type { NimiAIConfig, NimiAIScopeRef } from '@nimiplatform/sdk/ai';
import { getNimiRuntimeProductControlRecord } from '@nimiplatform/sdk/runtime';
import { useAppStore } from '../../app-shell/app-store.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import {
  PARENTOS_AI_SCOPE_REF,
  createEmptyParentosAIConfig,
  loadPersistedParentosAIConfig,
  type ParentosCapabilityId,
} from './parentos-ai-config.js';

const PARENTOS_FIRST_RUN_REQUIRED_CAPABILITIES = ['text.generate'] as const satisfies readonly ParentosCapabilityId[];
const PARENTOS_FIRST_RUN_OPTIONAL_CAPABILITIES = ['audio.transcribe'] as const satisfies readonly ParentosCapabilityId[];
const PARENTOS_FIRST_RUN_CAPABILITIES = [
  ...PARENTOS_FIRST_RUN_REQUIRED_CAPABILITIES,
  ...PARENTOS_FIRST_RUN_OPTIONAL_CAPABILITIES,
] as const;

export type ParentosFirstRunAIConfigInitOutcome =
  | {
      outcome: 'already-bound';
      config: NimiAIConfig;
    }
  | {
      outcome: 'not-initialized';
      reason:
        | 'first_run_record_unavailable'
        | 'first_run_evidence_missing';
      detail: string;
    };

export type ParentosFirstRunAIConfigInitOptions = {
  readonly scopeRef?: NimiAIScopeRef;
  readonly client?: NimiClient;
  readonly getClient?: () => NimiClient;
  readonly loadConfig?: (scopeRef: NimiAIScopeRef) => NimiAIConfig | null | Promise<NimiAIConfig | null>;
};

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readTargetRef(config: NimiAIConfig, capabilityId: ParentosCapabilityId) {
  return config.capabilities.targetRefs[capabilityId] || null;
}

function ensureAIConfigShape(config: NimiAIConfig | null | undefined, scopeRef: NimiAIScopeRef): NimiAIConfig {
  const resolved = config ?? createEmptyParentosAIConfig();
  return {
    ...resolved,
    scopeRef,
    capabilities: {
      logicalModelIds: { ...(resolved.capabilities.logicalModelIds || {}) },
      targetRefs: { ...(resolved.capabilities.targetRefs || {}) },
      selectedComponents: { ...(resolved.capabilities.selectedComponents || {}) },
      selectedParams: { ...(resolved.capabilities.selectedParams || {}) },
    },
    profileOrigin: resolved.profileOrigin ?? null,
  };
}

async function loadParentosAIConfigForBootstrap(scopeRef: NimiAIScopeRef): Promise<NimiAIConfig> {
  return ensureAIConfigShape(
    useAppStore.getState().aiConfig || await loadPersistedParentosAIConfig(),
    scopeRef,
  );
}

// The Runtime/SDK first-run execution-evidence subsystem (firstRun.executionEvidenceRef,
// resolveFirstRunExecutionEvidence, projectNimiFirstRunExecutionEvidenceToAIConfigTargets)
// was removed upstream with no replacement projection. This bootstrap therefore fails
// closed: existing bindings are preserved, and missing bindings must be produced through
// the AI settings model picker instead of fabricated from unavailable evidence.
export async function ensureParentosAIConfigFromFirstRunEvidence(
  options: ParentosFirstRunAIConfigInitOptions = {},
): Promise<ParentosFirstRunAIConfigInitOutcome> {
  const scopeRef = options.scopeRef ?? PARENTOS_AI_SCOPE_REF;
  const loadConfig = options.loadConfig ?? loadParentosAIConfigForBootstrap;
  const config = ensureAIConfigShape(await loadConfig(scopeRef), scopeRef);

  const missingCapabilities = PARENTOS_FIRST_RUN_CAPABILITIES.filter(
    (capabilityId) => !readTargetRef(config, capabilityId),
  );
  if (missingCapabilities.length === 0) {
    return { outcome: 'already-bound', config };
  }

  const client = options.client
    ?? (options.getClient ? options.getClient() : getParentOSNimiClient());

  try {
    await getNimiRuntimeProductControlRecord(client.runtime.generated);
  } catch (error) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_record_unavailable',
      detail: detailFromError(error),
    };
  }

  return {
    outcome: 'not-initialized',
    reason: 'first_run_evidence_missing',
    detail: 'Runtime no longer publishes first-run execution evidence; bind models through AI settings.',
  };
}
