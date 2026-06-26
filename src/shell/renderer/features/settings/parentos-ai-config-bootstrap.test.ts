import { describe, expect, it } from 'vitest';
import {
  RoutePolicy,
  ScenarioType,
} from '@nimiplatform/sdk/runtime/generated';
import { PARENTOS_AI_SCOPE_REF, createEmptyParentosAIConfig } from './parentos-ai-config.js';
import { ensureParentosAIConfigFromFirstRunEvidence } from './parentos-ai-config-bootstrap.js';

function firstRunProof(input: {
  capability: string;
  scenarioType: ScenarioType;
  consumerId: string;
  assetId: string;
  routeTarget: string;
}) {
  return {
    capability: input.capability,
    scenarioType: input.scenarioType,
    boundConsumerId: input.consumerId,
    boundAssetId: input.assetId,
    localRouteTarget: input.routeTarget,
    routePolicy: RoutePolicy.LOCAL,
    modelResolved: input.assetId,
    terminalResult: 'local_executed',
    reasonCode: 'FIRST_RUN_EXECUTION_EVIDENCE_READY',
    traceId: `trace:${input.consumerId}`,
    executedAt: '2026-06-03T00:00:00Z',
  };
}

function verifiedFirstRunEvidenceRef() {
  return {
    executionEvidenceRef: 'execution_evidence_ready',
    selectedLocalFactoryAiProfileRef: 'factory:minimal',
    installLevel: 'minimal',
    runtimeBaselineRef: 'runtime-baseline:ready',
    dataRootRef: 'data-root:ready',
    localExecutionTargetEvidence: ['local'],
    selectedBaselineCapabilityProof: [
      firstRunProof({
        capability: 'local_text_chat_execution',
        scenarioType: ScenarioType.TEXT_GENERATE,
        consumerId: 'llama.cpp.cpu',
        assetId: 'asset:text',
        routeTarget: 'local',
      }),
      firstRunProof({
        capability: 'local_basic_stt_execution',
        scenarioType: ScenarioType.SPEECH_TRANSCRIBE,
        consumerId: 'speech.qwen3-asr.python',
        assetId: 'asset:stt',
        routeTarget: 'speech',
      }),
      firstRunProof({
        capability: 'local_basic_tts_execution',
        scenarioType: ScenarioType.SPEECH_SYNTHESIZE,
        consumerId: 'speech.qwen3-tts.python',
        assetId: 'asset:tts',
        routeTarget: 'speech',
      }),
    ],
    terminalResult: 'local_ai_ready',
    observedAt: '2026-06-03T00:00:00Z',
    runtimeAuditSequence: ['audit:ready'],
    runtimeVerifierIdentity: 'runtime',
  };
}

function firstRunReadyNimiClient() {
  return {
    runtime: {
      generated: {
        getProductControlRecord: async () => ({
          json: JSON.stringify({
            path: 'D:\\nimi\\product-control.json',
            exists: true,
            state: 'ready_for_use',
            error: null,
            record: {
              schemaVersion: 1,
              installId: 'install-ready',
              productVersion: '0.1.0',
              state: 'ready_for_use',
              firstRun: {
                installLevel: 'minimal',
                completed: true,
                runtimeBaselineRef: 'runtime-baseline:ready',
                executionEvidenceRef: 'execution_evidence_ready',
              },
              pointers: {},
              repair: { required: false },
            },
          }),
        }),
        resolveFirstRunExecutionEvidence: async (request: {
          executionEvidenceRef: string;
          expectedRuntimeBaselineRef: string;
          expectedInstallLevel: string;
        }) => ({
          ref: {
            ...verifiedFirstRunEvidenceRef(),
            executionEvidenceRef: request.executionEvidenceRef,
            runtimeBaselineRef: request.expectedRuntimeBaselineRef,
            installLevel: request.expectedInstallLevel,
          },
          state: 'local_ai_ready',
          reasonCode: 'FIRST_RUN_EXECUTION_EVIDENCE_READY',
          detail: '',
        }),
      },
    },
  };
}

describe('parentos-ai-config-bootstrap', () => {
  it('initializes ParentOS text.generate and audio.transcribe from verified first-run evidence', async () => {
    let savedConfig = null as ReturnType<typeof createEmptyParentosAIConfig> | null;
    const result = await ensureParentosAIConfigFromFirstRunEvidence({
      client: firstRunReadyNimiClient() as never,
      loadConfig: () => createEmptyParentosAIConfig(),
      saveConfig: (next) => {
        savedConfig = next;
        return next;
      },
    });

    expect(result.outcome).toBe('initialized');
    expect(result.outcome === 'initialized' ? result.initializedCapabilities : []).toEqual([
      'text.generate',
      'audio.transcribe',
    ]);
    expect(savedConfig?.scopeRef).toEqual(PARENTOS_AI_SCOPE_REF);
    expect(savedConfig?.capabilities.targetRefs['text.generate']).toEqual({
      kind: 'local-runtime',
      version: 'v2',
      readinessRef: 'execution_evidence_ready',
    });
    expect(savedConfig?.capabilities.targetRefs['audio.transcribe']).toEqual({
      kind: 'local-runtime',
      version: 'v2',
      readinessRef: 'execution_evidence_ready',
    });
  });

  it('does not overwrite existing ParentOS first-run bindings', async () => {
    let productControlRead = false;
    let saved = false;
    const existing = {
      ...createEmptyParentosAIConfig(),
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'cloud-connector',
            connectorId: 'connector-openai',
            provider: 'openai',
            remoteModelCatalogId: 'remote-catalog:connector-openai:gpt-runtime',
            providerModelId: 'gpt-runtime',
          },
          'audio.transcribe': {
            kind: 'local-runtime',
            version: 'v2',
            profileBindingId: 'local-runtime:existing-stt',
          },
        },
        selectedParams: {},
      },
    } satisfies ReturnType<typeof createEmptyParentosAIConfig>;

    const result = await ensureParentosAIConfigFromFirstRunEvidence({
      client: {
        runtime: {
          generated: {
            getProductControlRecord: async () => {
              productControlRead = true;
              throw new Error('should not read product control');
            },
          },
        },
      } as never,
      loadConfig: () => existing,
      saveConfig: () => {
        saved = true;
        throw new Error('should not save');
      },
    });

    expect(result.outcome).toBe('already-bound');
    if (result.outcome !== 'already-bound') {
      throw new Error(`Expected already-bound, got ${result.outcome}`);
    }
    expect(productControlRead).toBe(false);
    expect(saved).toBe(false);
    expect(result.config.capabilities.targetRefs['text.generate']).toEqual({
      kind: 'cloud-connector',
      connectorId: 'connector-openai',
      provider: 'openai',
      remoteModelCatalogId: 'remote-catalog:connector-openai:gpt-runtime',
      providerModelId: 'gpt-runtime',
    });
  });
});
