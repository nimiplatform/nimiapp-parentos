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

  it('distinguishes an absent owner configuration from a transport failure', async () => {
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { reasonCode: 'ai-config-not-found' }));
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(readParentosAIConfig()).resolves.toEqual({
      state: 'not-configured',
      reasonCode: 'ai-config-not-found',
    });
  });

  it('checks exact configured capabilities from the read-only projection', async () => {
    const get = vi.fn().mockResolvedValue({
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [{ capabilityContract: 'audio.transcribe', requiredFeatures: [], route: { oneofKind: 'local', local: {} } }],
    });
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(hasParentosAIConfigCapability(PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT)).resolves.toBe(true);
  });

  it('does not admit a cloud intent across the ParentOS local-only privacy boundary', async () => {
    const get = vi.fn().mockResolvedValue({
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [{
        capabilityContract: 'audio.transcribe',
        requiredFeatures: [],
        route: {
          oneofKind: 'cloud',
          cloud: {
            implementation: { implementationId: 'cloud.stt', driverId: 'driver.stt', driverDialect: 'stt/v1' },
          },
        },
      }],
    });
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(hasParentosAIConfigCapability(PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT)).resolves.toBe(false);
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
    const get = vi.fn().mockResolvedValue({
      owner: { owner: { oneofKind: 'app', app: { appId: 'nimi.parentos' } } },
      capabilities: [],
    });
    getParentOSNimiClientMock.mockReturnValue(clientWithAIConfig({ get }));

    await expect(requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)).rejects.toMatchObject({
      reasonCode: 'parentos-ai-capability-not-configured',
    });
  });
});
