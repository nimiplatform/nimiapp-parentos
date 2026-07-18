import { loadParentosRuntimeRouteOptions } from '../../infra/parentos-runtime-route-options.js';
import { describeError, logRendererEvent } from '../../infra/telemetry/renderer-log.js';
import { i18nText } from '../../i18n/index.js';

export type ParentosAISettingsAvailability =
  | {
    kind: 'ready';
  }
  | {
    kind: 'route-options-failed';
    detail: string;
  };

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'unknown error');
}

export async function probeParentosAISettingsAvailability(): Promise<ParentosAISettingsAvailability> {
  try {
    await loadParentosRuntimeRouteOptions('text.generate');
    return {
      kind: 'ready',
    };
  } catch (error) {
    const detail = errorMessage(error);
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
      detail,
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
  return i18nText('AISettings.availability.routeSnapshotUnavailable');
}

export function parentosAISettingsAvailabilityHint(
  availability: ParentosAISettingsAvailability | null,
): string {
  if (!availability || availability.kind === 'ready') {
    return '';
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
  return {
    kind: 'error',
    message: i18nText('AISettings.availability.routeSnapshotBanner', { detail: availability.detail }),
  };
}
