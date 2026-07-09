import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParentosAISettingsAvailability } from './parentos-ai-settings-availability.js';

const loadParentosRuntimeRouteOptionsMock = vi.fn();
const logRendererEventMock = vi.fn();

vi.mock('../../infra/parentos-runtime-route-options.js', () => ({
  loadParentosRuntimeRouteOptions: loadParentosRuntimeRouteOptionsMock,
}));

vi.mock('../../infra/telemetry/renderer-log.js', () => ({
  describeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error || '') }),
  logRendererEvent: logRendererEventMock,
}));

vi.mock('../../i18n/index.js', () => ({
  i18nText: (key: string) => key,
}));

const {
  parentosAISettingsAvailabilityBannerCopy,
  parentosAISettingsAvailabilityHint,
  parentosAISettingsAvailabilityLabel,
  probeParentosAISettingsAvailability,
} = await import('./parentos-ai-settings-availability.js');

describe('parentos-ai-settings-availability', () => {
  beforeEach(() => {
    loadParentosRuntimeRouteOptionsMock.mockReset();
    logRendererEventMock.mockReset();
  });

  it('reports route-options-failed when the route snapshot probe throws', async () => {
    loadParentosRuntimeRouteOptionsMock.mockRejectedValue(new Error('snapshot failed'));

    const availability = await probeParentosAISettingsAvailability();

    expect(availability).toEqual({
      kind: 'route-options-failed',
      status: {
        running: false,
        managed: false,
        launchMode: 'INSTALLED_APP',
        grpcAddr: '',
        lastError: 'snapshot failed',
      },
      detail: 'snapshot failed',
    });
    expect(logRendererEventMock).toHaveBeenCalledWith(expect.objectContaining({
      area: 'settings.ai.route-options',
      message: 'action:runtime-route-options-probe-failed',
    }));
  });

  it('reports ready when route snapshot probe succeeds', async () => {
    loadParentosRuntimeRouteOptionsMock.mockResolvedValue({
      capability: 'text.generate',
      selected: null,
      local: {
        models: [],
      },
      connectors: [],
    });

    const availability = await probeParentosAISettingsAvailability();

    expect(availability).toEqual({
      kind: 'ready',
      status: {
        running: true,
        managed: false,
        launchMode: 'INSTALLED_APP',
        grpcAddr: '',
      },
    });
  });

  it('labels route failures through route snapshot copy instead of daemon lifecycle copy', () => {
    const availability = {
      kind: 'route-options-failed' as const,
      status: {
        running: false,
        managed: false,
        launchMode: 'INSTALLED_APP' as const,
        grpcAddr: '',
        lastError: 'snapshot failed',
      },
      detail: 'snapshot failed',
    } satisfies ParentosAISettingsAvailability;

    expect(parentosAISettingsAvailabilityLabel(availability)).toBe('AISettings.availability.routeSnapshotUnavailable');
    expect(parentosAISettingsAvailabilityHint(availability)).toBe('AISettings.availability.routeSnapshotFailed');
    expect(parentosAISettingsAvailabilityBannerCopy(availability)).toEqual({
      kind: 'error',
      message: 'AISettings.availability.routeSnapshotBanner',
    });
  });
});
