import { beforeEach, describe, expect, it, vi } from 'vitest';

const getParentOSNimiClientMock = vi.fn();
const hasParentOSNimiClientMock = vi.fn();

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => getParentOSNimiClientMock(),
  hasParentOSNimiClient: () => hasParentOSNimiClientMock(),
}));

import {
  readParentosAIConfig,
} from './parentos-ai-config.js';

function clientWithAIConfig(aiConfig: {
  get: ReturnType<typeof vi.fn>;
  overwrite?: ReturnType<typeof vi.fn>;
}) {
  return { aiConfig };
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

  it('reads the platform-owned text capability without invoking the mutation method', async () => {
    const config = {
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [{ capabilityContract: 'text.generate', requiredFeatures: [], route: { oneofKind: 'local', local: {} } }],
    };
    const get = vi.fn().mockResolvedValue({
      ...config,
    });
    const overwrite = vi.fn();
    const client = clientWithAIConfig({ get, overwrite });
    getParentOSNimiClientMock.mockReturnValue(client);

    await expect(readParentosAIConfig()).resolves.toEqual({ state: 'ready', config });
    expect(overwrite).not.toHaveBeenCalled();
  });

  it('maps typed failures to a bounded unavailable projection', async () => {
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { reasonCode: 'local-app-access-denied' }));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(readParentosAIConfig()).resolves.toEqual({
      state: 'unavailable',
      reasonCode: 'local-app-access-denied',
    });
  });
});
