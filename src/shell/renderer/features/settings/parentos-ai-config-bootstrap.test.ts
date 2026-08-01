import { describe, expect, it } from 'vitest';
import { createEmptyParentosAIConfig } from './parentos-ai-config.js';
import { ensureParentosAIConfigFromFirstRunEvidence } from './parentos-ai-config-bootstrap.js';

function productControlReadyNimiClient() {
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
                aiProfileAlias: 'factory:minimal',
                completed: true,
                completedAt: '2026-06-03T00:00:00Z',
              },
              pointers: {},
              repair: { required: false },
            },
          }),
        }),
      },
    },
  };
}

describe('parentos-ai-config-bootstrap', () => {
  it('fails closed when the Runtime no longer publishes first-run execution evidence', async () => {
    const result = await ensureParentosAIConfigFromFirstRunEvidence({
      client: productControlReadyNimiClient() as never,
      loadConfig: () => createEmptyParentosAIConfig(),
    });

    expect(result.outcome).toBe('not-initialized');
    if (result.outcome !== 'not-initialized') {
      throw new Error(`Expected not-initialized, got ${result.outcome}`);
    }
    expect(result.reason).toBe('first_run_evidence_missing');
  });

  it('reports first_run_record_unavailable when the product-control record cannot be read', async () => {
    const result = await ensureParentosAIConfigFromFirstRunEvidence({
      client: {
        runtime: {
          generated: {
            getProductControlRecord: async () => {
              throw new Error('record read failed');
            },
          },
        },
      } as never,
      loadConfig: () => createEmptyParentosAIConfig(),
    });

    expect(result.outcome).toBe('not-initialized');
    if (result.outcome !== 'not-initialized') {
      throw new Error(`Expected not-initialized, got ${result.outcome}`);
    }
    expect(result.reason).toBe('first_run_record_unavailable');
    expect(result.detail).toContain('record read failed');
  });

  it('does not overwrite existing ParentOS first-run bindings', async () => {
    let productControlRead = false;
    const existing = {
      ...createEmptyParentosAIConfig(),
      capabilities: {
        logicalModelIds: {},
        selectedComponents: {},
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
    });

    expect(result.outcome).toBe('already-bound');
    if (result.outcome !== 'already-bound') {
      throw new Error(`Expected already-bound, got ${result.outcome}`);
    }
    expect(productControlRead).toBe(false);
    expect(result.config.capabilities.targetRefs['text.generate']).toEqual({
      kind: 'cloud-connector',
      connectorId: 'connector-openai',
      provider: 'openai',
      remoteModelCatalogId: 'remote-catalog:connector-openai:gpt-runtime',
      providerModelId: 'gpt-runtime',
    });
  });
});
