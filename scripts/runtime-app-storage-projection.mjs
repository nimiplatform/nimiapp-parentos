import {
  Runtime,
  createNimiRuntimeAppSessionMetadataProvider,
  createNimiRuntimeFullAppRegistration,
  resolveNimiRuntimeAppStorageRoots,
} from '@nimiplatform/sdk/runtime';

export const PARENTOS_APP_ID = 'nimi.parentos';
export const PARENTOS_RUNTIME_APP_INSTANCE_ID = 'nimi.parentos.local-developer';
export const PARENTOS_RUNTIME_DEVICE_ID = 'parentos-local-developer-device';
export const DEFAULT_PARENTOS_RUNTIME_ENDPOINT = '127.0.0.1:46371';

export function resolveParentOSRuntimeEndpoint(...envKeys) {
  for (const key of envKeys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return DEFAULT_PARENTOS_RUNTIME_ENDPOINT;
}

export async function resolveParentOSRuntimeAppStorageRoots(input) {
  const runtimeEndpoint = String(input.runtimeEndpoint || '').trim() || DEFAULT_PARENTOS_RUNTIME_ENDPOINT;
  const sessionKind = normalizeSessionKind(input.sessionKind);
  const accountRuntime = new Runtime({
    appId: PARENTOS_APP_ID,
    transport: {
      type: 'node-grpc',
      endpoint: runtimeEndpoint,
    },
  });
  try {
    await accountRuntime.ready();
    await createNimiRuntimeFullAppRegistration(
      () => ({ auth: accountRuntime.auth }),
      {
        appId: PARENTOS_APP_ID,
        appInstanceId: PARENTOS_RUNTIME_APP_INSTANCE_ID,
        deviceId: PARENTOS_RUNTIME_DEVICE_ID,
        capabilities: [],
        developerRegistration: true,
        rejectionLabel: `${input.label} Runtime registration rejected`,
      },
    )();
    const runtime = new Runtime({
      appId: PARENTOS_APP_ID,
      transport: {
        type: 'node-grpc',
        endpoint: runtimeEndpoint,
      },
      authMetadata: createNimiRuntimeAppSessionMetadataProvider({
        appId: PARENTOS_APP_ID,
        appInstanceId: `${PARENTOS_APP_ID}.${sessionKind}-session`,
        deviceId: `parentos-${sessionKind}-session`,
        capabilities: [],
        developerRegistration: true,
        auth: accountRuntime.auth,
      }),
    });
    return await resolveNimiRuntimeAppStorageRoots({
      appLifecycle: runtime.appLifecycle,
      appId: PARENTOS_APP_ID,
      label: input.label,
    });
  } catch (error) {
    throw new Error(
      `${input.errorPrefix} failed to resolve Runtime app storage projection from ${runtimeEndpoint}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function normalizeSessionKind(value) {
  const normalized = String(value || '').trim();
  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error(`ParentOS Runtime session kind is invalid: ${normalized || '(empty)'}`);
  }
  return normalized;
}

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'unknown error');
}
