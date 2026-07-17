import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { PARENTOS_AI_SCOPE_REF } from './parentos-ai-config.js';
import {
  commitParentosAIConfig,
  getParentosAIConfigService,
} from './parentos-ai-config-service.js';

describe('parentos-ai-config-service', () => {
  beforeEach(() => {
    useAppStore.setState({ aiConfig: null });
  });

  it('returns an empty ParentOS profile catalog without app-owned profile authority', async () => {
    await expect(getParentosAIConfigService().aiProfile.list()).resolves.toEqual([]);
  });

  it('fails closed when applying an unknown profile', async () => {
    const result = await getParentosAIConfigService().aiProfile.apply(
      PARENTOS_AI_SCOPE_REF,
      'family-advisor',
      { requirementDeclarations: [] },
    );

    expect(result).toEqual({
      success: false,
      config: null,
      outcome: 'invalid_profile',
      failureReason: 'invalid_profile',
      probeWarnings: ['AI profile not found: family-advisor'],
    });
    expect(useAppStore.getState().aiConfig).toBe(null);
  });

  it('does not mutate or notify when AI config persistence is not admitted', async () => {
    const subscriber = vi.fn();
    const next = {
      scopeRef: PARENTOS_AI_SCOPE_REF,
      capabilities: {
        targetRefs: {
          'text.generate': {
            kind: 'local-runtime',
            version: 'v2',
            profileBindingId: 'local-runtime:local-model',
          },
        },
        selectedParams: {},
      },
      profileOrigin: null,
    } as const;

    getParentosAIConfigService().aiConfig.subscribe(PARENTOS_AI_SCOPE_REF, subscriber);
    await expect(commitParentosAIConfig(next)).rejects.toMatchObject({
      reasonCode: 'parentos-protected-operation-set-not-admitted',
      actionHint: 'wait_for_parentos_protected_operation_admission',
    });
    expect(useAppStore.getState().aiConfig).toBe(null);
    expect(subscriber).not.toHaveBeenCalled();
  });
});
