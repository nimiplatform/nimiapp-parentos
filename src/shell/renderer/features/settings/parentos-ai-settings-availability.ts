import { getDaemonStatus as getRuntimeBridgeStatus } from '../../bridge/index.js';
import type { RuntimeBridgeDaemonStatus } from '../../bridge/index.js';
import { loadParentosRuntimeRouteOptions } from '../../infra/parentos-runtime-route-options.js';
import { describeError, logRendererEvent } from '../../infra/telemetry/renderer-log.js';
import { i18nText } from '../../i18n/index.js';

export type ParentosAISettingsAvailability =
  | {
    kind: 'ready';
    status: RuntimeBridgeDaemonStatus;
  }
  | {
    kind: 'daemon-unavailable';
    status: RuntimeBridgeDaemonStatus;
    detail: string;
  }
  | {
    kind: 'route-options-failed';
    status: RuntimeBridgeDaemonStatus;
    detail: string;
  };

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'unknown error');
}

export async function probeParentosAISettingsAvailability(): Promise<ParentosAISettingsAvailability> {
  const status = await getRuntimeBridgeStatus().catch((error: unknown) => {
    logRendererEvent({
      level: 'warn',
      area: 'settings.ai.runtime-status',
      message: 'action:runtime-bridge-status-failed',
      details: {
        error: describeError(error),
      },
    });
    return {
      running: false,
      managed: false,
      launchMode: 'INVALID' as const,
      grpcAddr: '127.0.0.1:46371',
      lastError: errorMessage(error),
    };
  });

  if (!status.running) {
    return {
      kind: 'daemon-unavailable',
      status,
      detail: status.lastError || 'nimi runtime daemon is not running',
    };
  }

  try {
    await loadParentosRuntimeRouteOptions('text.generate');
    return {
      kind: 'ready',
      status,
    };
  } catch (error) {
    logRendererEvent({
      level: 'error',
      area: 'settings.ai.route-options',
      message: 'action:runtime-route-options-probe-failed',
      details: {
        error: describeError(error),
      },
    });
    return {
      kind: 'route-options-failed',
      status,
      detail: errorMessage(error),
    };
  }
}

export function parentosAISettingsAvailabilityLabel(
  availability: ParentosAISettingsAvailability | null,
): string {
  if (!availability) {
    return i18nText('AISettings.availability.checking');
  }
  if (availability.kind === 'ready') {
    return i18nText('AISettings.availability.connected');
  }
  if (availability.kind === 'daemon-unavailable') {
    return i18nText('AISettings.availability.notConnected');
  }
  return i18nText('AISettings.availability.routeSnapshotUnavailable');
}

export function parentosAISettingsAvailabilityHint(
  availability: ParentosAISettingsAvailability | null,
): string {
  if (!availability || availability.kind === 'ready') {
    return '';
  }
  if (availability.kind === 'daemon-unavailable') {
    return i18nText('AISettings.availability.daemonHint');
  }
  return i18nText('AISettings.availability.routeSnapshotFailed', { detail: availability.detail });
}

export function parentosAISettingsAvailabilityBannerCopy(
  availability: ParentosAISettingsAvailability | null,
): {
  kind: 'warning' | 'error';
  message: string;
} | null {
  if (!availability || availability.kind === 'ready') {
    return null;
  }
  if (availability.kind === 'daemon-unavailable') {
    return {
      kind: 'warning',
      message: i18nText('AISettings.availability.daemonBanner', {
        detail: availability.detail ? ` (${availability.detail})` : '',
      }),
    };
  }
  return {
    kind: 'error',
    message: i18nText('AISettings.availability.routeSnapshotBanner', { detail: availability.detail }),
  };
}
