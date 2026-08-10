import { beforeEach, describe, expect, it, vi } from 'vitest';

const getParentOSNimiClientMock = vi.fn();
const hasParentOSNimiClientMock = vi.fn();

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => getParentOSNimiClientMock(),
  hasParentOSNimiClient: () => hasParentOSNimiClientMock(),
}));

import {
  ensureParentosAIConfigDeclared,
  parentosDeclaredAIConfigIntents,
  readParentosAIConfig,
} from './parentos-ai-config.js';

function clientWithAIConfig(aiConfig: { get: ReturnType<typeof vi.fn>; overwrite: ReturnType<typeof vi.fn> }) {
  return { aiConfig };
}

describe('ParentOS portable AIConfig intent', () => {
  beforeEach(() => {
    getParentOSNimiClientMock.mockReset();
    hasParentOSNimiClientMock.mockReset().mockReturnValue(true);
  });

  it('declares exactly one local text capability intent without custody material', () => {
    const intents = parentosDeclaredAIConfigIntents();
    expect(intents).toEqual([
      {
        capabilityContract: 'text.generate',
        requiredFeatures: [],
        route: { oneofKind: 'local', local: {} },
      },
    ]);
    const serialized = JSON.stringify(intents);
    expect(serialized).not.toMatch(/connectorId|connectorGrantId|profileBindingId|readinessRef|ownerId|account/u);
  });

  it('reports unavailable when the shell bridge is absent', async () => {
    hasParentOSNimiClientMock.mockReturnValue(false);
    await expect(ensureParentosAIConfigDeclared()).resolves.toEqual({
      state: 'unavailable',
      reasonCode: 'nimi-shell-runtime-bridge-unavailable',
    });
  });

  it('overwrites only when the text capability is not yet declared', async () => {
    const get = vi.fn().mockResolvedValue({ owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } }, capabilities: [] });
    const overwrite = vi.fn().mockResolvedValue({});
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get, overwrite }));

    await expect(ensureParentosAIConfigDeclared()).resolves.toEqual({ state: 'declared' });
    expect(overwrite).toHaveBeenCalledWith(parentosDeclaredAIConfigIntents());
  });

  it('never clobbers an existing text capability declaration', async () => {
    const get = vi.fn().mockResolvedValue({
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [{ capabilityContract: 'text.generate', requiredFeatures: [], route: { oneofKind: 'local', local: {} } }],
    });
    const overwrite = vi.fn();
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get, overwrite }));

    await expect(ensureParentosAIConfigDeclared()).resolves.toEqual({ state: 'declared' });
    expect(overwrite).not.toHaveBeenCalled();
  });

  it('maps typed failures to a bounded unavailable declaration', async () => {
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { reasonCode: 'local-app-access-denied' }));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get, overwrite: vi.fn() }));

    await expect(ensureParentosAIConfigDeclared()).resolves.toEqual({
      state: 'unavailable',
      reasonCode: 'local-app-access-denied',
    });
  });

  it('reads back the declared config when ready', async () => {
    const config = {
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [{ capabilityContract: 'text.generate', requiredFeatures: [], route: { oneofKind: 'local', local: {} } }],
    };
    const get = vi.fn().mockResolvedValue(config);
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get, overwrite: vi.fn() }));

    await expect(readParentosAIConfig()).resolves.toEqual({ state: 'ready', config });
  });
});
