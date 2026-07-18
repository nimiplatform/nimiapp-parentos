export type ParentOSBootstrapFailureState =
  | 'app-data-unavailable'
  | 'app-data-repair-required';

export type ParentOSBootstrapFailure = {
  readonly state: ParentOSBootstrapFailureState;
  readonly reasonCode: string;
  readonly actionHint: string;
  readonly message: string;
};

const APP_DATA_UNAVAILABLE_REASONS = new Set([
  'parentos-electron-sidecar-binary-unavailable',
  'parentos-electron-sidecar-process-unavailable',
  'parentos-electron-sidecar-process-error',
  'parentos-electron-sidecar-process-exited',
  'parentos-electron-sidecar-request-timeout',
  'parentos-electron-sidecar-stdin-write-failed',
  'renderer-standard-shell-host-unavailable',
]);

export function classifyParentOSBootstrapFailure(error: unknown): ParentOSBootstrapFailure {
  const direct = asRecord(error);
  const message = messageFrom(error);
  const embedded = parseEmbeddedError(message);
  const reasonCode = firstText(
    direct?.reasonCode,
    direct?.code,
    embedded?.reasonCode,
    embedded?.code,
  ) || 'parentos-app-data-initialization-failed';
  const state = APP_DATA_UNAVAILABLE_REASONS.has(reasonCode)
    ? 'app-data-unavailable'
    : 'app-data-repair-required';
  const actionHint = firstText(direct?.actionHint, embedded?.actionHint)
    || (state === 'app-data-unavailable'
      ? 'restart_parentos_native_host'
      : 'repair_parentos_app_data');

  return { state, reasonCode, actionHint, message };
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  const record = asRecord(error);
  return firstText(record?.message, record?.reasonCode, record?.code)
    || 'ParentOS could not initialize its app-owned local data.';
}

function parseEmbeddedError(message: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(message) as unknown);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstText(...values: readonly unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}
