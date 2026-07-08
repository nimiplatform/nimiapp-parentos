import {
  createNimiElectronRuntimeAccountTrustedMetadataProvider,
  type ElectronRuntimeBridgeTrustedMetadataProvider,
} from '@nimiplatform/kit/shell/electron/main';

const ACCOUNT_CALLER_MODE_LOCAL_DEVELOPER_APP = 7;
const PARENTOS_APP_ID = 'nimi.parentos';
const PARENTOS_RUNTIME_APP_INSTANCE_ID = 'nimi.parentos.local-developer';
const PARENTOS_RUNTIME_DEVICE_ID = 'parentos-local-developer-device';
const PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID = 'nimi.parentos.platform-runtime-session';
const PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID = 'platform-runtime-session';
const PARENTOS_RUNTIME_PROTECTED_SCOPES = ['ai.spend.meter'] as const;
const PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION = 'sdk-v2';
const PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS = 3600;
const PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS = 30_000;
const PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS = 3600;
const PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS = 60_000;

type ElectronRuntimeAccountCaller =
  Parameters<typeof createNimiElectronRuntimeAccountTrustedMetadataProvider>[0]['accountCaller'];

export function createParentOSElectronTrustedRuntimeMetadataProvider(input: {
  readonly appId: string;
  readonly runtimeEndpoint: string;
  readonly developerRegistration?: boolean;
}): ElectronRuntimeBridgeTrustedMetadataProvider {
  const appId = requireText(input.appId, 'appId');
  if (appId !== PARENTOS_APP_ID) {
    throw new Error(`ParentOS Electron Runtime auth requires appId ${PARENTOS_APP_ID}`);
  }
  const runtimeEndpoint = requireText(input.runtimeEndpoint, 'runtimeEndpoint');
  const developerRegistration = input.developerRegistration === true;
  return createNimiElectronRuntimeAccountTrustedMetadataProvider({
    appId,
    runtimeEndpoint,
    accountCaller: {
      appId,
      appInstanceId: PARENTOS_RUNTIME_APP_INSTANCE_ID,
      deviceId: PARENTOS_RUNTIME_DEVICE_ID,
      mode: ACCOUNT_CALLER_MODE_LOCAL_DEVELOPER_APP,
      scopes: [],
    } as unknown as ElectronRuntimeAccountCaller,
    appSession: {
      appInstanceId: PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID,
      deviceId: PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID,
      capabilities: [...PARENTOS_RUNTIME_PROTECTED_SCOPES],
      ttlSeconds: PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS,
      refreshSkewMs: PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS,
      developerRegistration,
    },
    protectedAccess: {
      consentId: 'parentos-runtime-account',
      authorizationVersion: 'v1',
      policyVersion: 'parentos-runtime-account-v1',
      scopeCatalogVersion: PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION,
      scopes: [...PARENTOS_RUNTIME_PROTECTED_SCOPES],
      ttlSeconds: PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS,
      refreshSkewMs: PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS,
      idempotencyKey: ({ normalizedSubjectUserId }) =>
        `parentos-runtime-protected-${normalizedSubjectUserId}`,
    },
  });
}

function requireText(value: unknown, field: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`ParentOS Electron Runtime auth requires ${field}`);
  }
  return normalized;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
