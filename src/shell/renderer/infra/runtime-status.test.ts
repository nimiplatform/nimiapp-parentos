import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeParentosNimiAccess } from './runtime-status.js';

const status = vi.hoisted(() => vi.fn());
vi.mock('./parentos-nimi-client.js', () => ({
  hasParentOSNimiClient: () => true,
  getParentOSNimiClient: () => ({ auth: { status } }),
}));

describe('Nimi access failure projection', () => {
  beforeEach(() => { status.mockReset(); });

  it('preserves a non-retryable carrier rejection and its recovery hint', async () => {
    status.mockRejectedValue({
      reasonCode: 'runtime-service-untrusted',
      actionHint: 'restart_fixed_runtime_service',
      retryable: false,
    });
    expect(await probeParentosNimiAccess()).toEqual({
      state: 'unavailable', reasonCode: 'runtime-service-untrusted',
      actionHint: 'restart_fixed_runtime_service', retryable: false,
    });
  });

  it('preserves an explicitly retryable service failure', async () => {
    status.mockRejectedValue({ reasonCode: 'runtime-service-unavailable', retryable: true });
    expect(await probeParentosNimiAccess()).toMatchObject({ state: 'unavailable', retryable: true });
  });
});
