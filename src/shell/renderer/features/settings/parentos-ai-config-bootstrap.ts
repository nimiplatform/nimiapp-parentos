import type { NimiClient } from '@nimiplatform/sdk';
import type { NimiAIConfig, NimiAIScopeRef } from '@nimiplatform/sdk/ai';
import {
  getNimiRuntimeProductControlRecord,
  projectNimiFirstRunExecutionEvidenceToAIConfigTargets,
} from '@nimiplatform/sdk/runtime';
import { useAppStore } from '../../app-shell/app-store.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
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
      config: NimiAIConfig;
    }
  | {
      outcome: 'initialized';
      config: NimiAIConfig;
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
  readonly scopeRef?: NimiAIScopeRef;
  readonly client?: NimiClient;
  readonly getClient?: () => NimiClient;
  readonly loadConfig?: (scopeRef: NimiAIScopeRef) => NimiAIConfig | null | Promise<NimiAIConfig | null>;
  readonly saveConfig?: (next: NimiAIConfig, scopeRef: NimiAIScopeRef) => NimiAIConfig | Promise<NimiAIConfig>;
};

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readTargetRef(config: NimiAIConfig, capabilityId: ParentosFirstRunCapabilityId) {
  return config.capabilities.targetRefs[capabilityId] || null;
}

function ensureAIConfigShape(config: NimiAIConfig | null | undefined, scopeRef: NimiAIScopeRef): NimiAIConfig {
  const resolved = config ?? createEmptyParentosAIConfig();
  return {
    ...resolved,
    scopeRef,
    capabilities: {
      targetRefs: { ...(resolved.capabilities.targetRefs || {}) },
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

async function saveParentosAIConfigFromBootstrap(next: NimiAIConfig, _scopeRef: NimiAIScopeRef): Promise<NimiAIConfig> {
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
    (capabilityId) => !readTargetRef(config, capabilityId),
  );
  if (missingCapabilities.length === 0) {
    return { outcome: 'already-bound', config };
  }

  const client = options.client
    ?? (options.getClient ? options.getClient() : getParentOSNimiClient());

  let recordProjection;
  try {
    recordProjection = await getNimiRuntimeProductControlRecord(client.runtime.generated);
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
    resolvedEvidence = await client.runtime.generated.resolveFirstRunExecutionEvidence({
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

  let projectedTargets;
  try {
    projectedTargets = projectNimiFirstRunExecutionEvidenceToAIConfigTargets(resolvedEvidence.ref);
  } catch (error) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_text_binding_missing',
      detail: detailFromError(error),
    };
  }

  const projectedByCapability = new Map(projectedTargets.map((item) => [item.capability, item.targetRef]));
  if (!projectedByCapability.get('text.generate')) {
    return {
      outcome: 'not-initialized',
      reason: 'first_run_text_binding_missing',
      detail: 'Verified Runtime first-run evidence did not contain text.generate.',
    };
  }

  const nextTargetRefs = { ...config.capabilities.targetRefs };
  const initializedCapabilities: ParentosFirstRunCapabilityId[] = [];
  for (const capabilityId of PARENTOS_FIRST_RUN_CAPABILITIES) {
    if (nextTargetRefs[capabilityId]) {
      continue;
    }
    const targetRef = projectedByCapability.get(capabilityId);
    if (!targetRef) {
      continue;
    }
    nextTargetRefs[capabilityId] = targetRef;
    initializedCapabilities.push(capabilityId);
  }

  if (initializedCapabilities.length === 0) {
    return { outcome: 'already-bound', config };
  }

  const next: NimiAIConfig = {
    ...config,
    capabilities: {
      ...config.capabilities,
      targetRefs: nextTargetRefs,
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
