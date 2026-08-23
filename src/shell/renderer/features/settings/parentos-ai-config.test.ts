import { beforeEach, describe, expect, it, vi } from 'vitest';

const getParentOSNimiClientMock = vi.fn();
const hasParentOSNimiClientMock = vi.fn();

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => getParentOSNimiClientMock(),
  hasParentOSNimiClient: () => hasParentOSNimiClientMock(),
}));

import {
  hasParentosAIConfigCapability,
  PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
  readParentosAIConfig,
  requireParentosAIConfigCapability,
} from './parentos-ai-config.js';

function clientWithAIConfig(aiConfig: {
  get: ReturnType<typeof vi.fn>;
  overwrite?: ReturnType<typeof vi.fn>;
}) {
  return { aiConfig };
}

function snapshot(
  capabilities: readonly Record<string, unknown>[] | null,
  effectiveSelections: readonly Record<string, unknown>[] = [],
) {
  return {
    config: capabilities === null ? null : {
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities,
    },
    revision: capabilities === null ? '0' : '1',
    effectiveSelections,
  };
}

function readyLocal(capabilityContract: string, loadoutRef: string) {
  return {
    capabilityContract,
    state: 'ready',
    resource: {
      oneofKind: 'local',
      local: {
        loadoutRef,
        label: loadoutRef,
        capabilityContract,
        implementation: { implementationId: loadoutRef, driverId: 'local', driverDialect: 'test/local/v1' },
        supportedFeatures: [],
        state: 'ready',
        reasons: [],
      },
    },
    reasons: [],
  };
}

describe('ParentOS portable AIConfig projection', () => {
  beforeEach(() => {
    getParentOSNimiClientMock.mockReset();
    hasParentOSNimiClientMock.mockReset().mockReturnValue(true);
  });

  it('reports unavailable when the shell bridge is absent', async () => {
    hasParentOSNimiClientMock.mockReturnValue(false);
    await expect(readParentosAIConfig()).resolves.toEqual({
      state: 'unavailable',
      reasonCode: 'nimi-shell-runtime-bridge-unavailable',
    });
  });

  it('reads the canonical self-owner text capability without mutating during read', async () => {
    const config = {
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [{ capabilityContract: 'text.generate', requiredFeatures: [], route: { oneofKind: 'local', local: {} } }],
    };
    const projected = { config, revision: '1', effectiveSelections: [readyLocal('text.generate', 'text-local')] };
    const get = vi.fn().mockResolvedValue(projected);
    const overwrite = vi.fn();
    const client = clientWithAIConfig({ get, overwrite });
    getParentOSNimiClientMock.mockReturnValue(client);

    await expect(readParentosAIConfig()).resolves.toEqual({ state: 'ready', snapshot: projected });
    expect(overwrite).not.toHaveBeenCalled();
  });

  it('distinguishes an absent owner configuration from a transport failure', async () => {
    const get = vi.fn().mockResolvedValue(snapshot(null));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(readParentosAIConfig()).resolves.toEqual({
      state: 'not-configured',
      reasonCode: 'ai-config-not-found',
      snapshot: snapshot(null),
    });
  });

  it('checks configured capabilities from route intent and current effective projection', async () => {
    const get = vi.fn().mockResolvedValue({
      ...snapshot([{
        capabilityContract: 'audio.transcribe', requiredFeatures: [],
        route: { oneofKind: 'local', local: {} },
      }], [readyLocal('audio.transcribe', 'audio-local')]),
    });
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(hasParentosAIConfigCapability(PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT)).resolves.toBe(true);
  });

  it('reports a Cloud intent as non-executable across the ParentOS local-only privacy boundary', async () => {
    const get = vi.fn().mockResolvedValue(snapshot([{
        capabilityContract: 'audio.transcribe',
        requiredFeatures: [],
        route: {
          oneofKind: 'cloud',
          cloud: {
            implementation: { implementationId: 'cloud.stt', driverId: 'driver.stt', driverDialect: 'stt/v1' },
          },
        },
      }]));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(hasParentosAIConfigCapability(PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT)).resolves.toBe(false);
    await expect(requireParentosAIConfigCapability(PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT)).rejects.toMatchObject({
      reasonCode: 'parentos-ai-cloud-route-not-admitted',
    });
  });

  it('maps typed failures to a bounded unavailable projection', async () => {
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { reasonCode: 'local-app-access-denied' }));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(readParentosAIConfig()).resolves.toEqual({
      state: 'unavailable',
      reasonCode: 'local-app-access-denied',
    });
  });

  it('preserves typed AIConfig access failures when execution requires a capability', async () => {
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { reasonCode: 'local-app-access-denied' }));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)).rejects.toMatchObject({
      reasonCode: 'local-app-access-denied',
    });
  });

  it('uses the product-level not-configured error only when the local intent is absent', async () => {
    const get = vi.fn().mockResolvedValue(snapshot([]));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)).rejects.toMatchObject({
      reasonCode: 'parentos-ai-capability-not-configured',
    });
  });

  it('keeps a blocked Local intent configured so Runtime admission owns the typed failure', async () => {
    const get = vi.fn().mockResolvedValue(snapshot([{
      capabilityContract: 'text.generate', requiredFeatures: [],
      route: { oneofKind: 'local', local: {} },
    }], [{
      capabilityContract: 'text.generate', state: 'blocked', resource: null, reasons: ['AI_LOADOUT_INVALID'],
    }]));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(hasParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)).resolves.toBe(true);
    await expect(requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)).resolves.toBeUndefined();
  });
});
