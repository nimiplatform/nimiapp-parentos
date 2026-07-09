import {
  createNimiElectronInstalledAppRuntimeAccountTrustedMetadataProvider,
  resolveElectronRuntimeDefaults,
  type ElectronRuntimeBridgeTrustedMetadataProvider,
} from '@nimiplatform/kit/shell/electron/main';

const PARENTOS_APP_ID = 'nimi.parentos';
const PARENTOS_RUNTIME_APP_INSTANCE_ID = 'nimi.parentos.desktop-installed';
const PARENTOS_RUNTIME_DEVICE_ID = 'desktop-installed-app';
const PARENTOS_RELEASE_DESCRIPTOR_REF = 'nimi.parentos.bundled-with-nimi';
const PARENTOS_RUNTIME_PROTECTED_SCOPES = ['ai.spend.meter'] as const;
const PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION = 'sdk-v2';
const PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS = 3600;
const PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS = 30_000;
const PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS = 3600;
const PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS = 60_000;
const DESKTOP_INSTALLED_APP_LAUNCH_HOST_ID = 'desktop-electron-installed-app-host';

export type ParentOSRendererLaunchBinding = {
  readonly appId: string;
  readonly appInstanceId: string;
  readonly deviceId: string;
  readonly launchHostId: string;
  readonly launchNonce: string;
  readonly releaseDescriptorRef: string;
  readonly realmBaseUrl: string;
};

export function createParentOSElectronTrustedRuntimeMetadataProvider(input: {
  readonly appId: string;
  readonly runtimeEndpoint: string;
}): ElectronRuntimeBridgeTrustedMetadataProvider {
  const appId = requireText(input.appId, 'appId');
  if (appId !== PARENTOS_APP_ID) {
    throw new Error(`ParentOS Electron Runtime auth requires appId ${PARENTOS_APP_ID}`);
  }
  const launchBinding = createParentOSRendererLaunchBinding();
  const runtimeEndpoint = requireText(input.runtimeEndpoint, 'runtimeEndpoint');
  return createNimiElectronInstalledAppRuntimeAccountTrustedMetadataProvider({
    appId,
    runtimeEndpoint,
    installedApp: {
      appInstanceId: launchBinding.appInstanceId,
      deviceId: launchBinding.deviceId,
      launchHostId: launchBinding.launchHostId,
      launchNonce: launchBinding.launchNonce,
      releaseDescriptorRef: launchBinding.releaseDescriptorRef,
    },
    appSession: {
      capabilities: [...PARENTOS_RUNTIME_PROTECTED_SCOPES],
      ttlSeconds: PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS,
      refreshSkewMs: PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS,
      developerRegistration: false,
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

export function createParentOSRendererLaunchBinding(): ParentOSRendererLaunchBinding {
  return {
    appId: PARENTOS_APP_ID,
    appInstanceId: optionalText(process.env.NIMI_APP_INSTANCE_ID)
      || optionalText(process.env.NIMI_PARENTOS_ELECTRON_APP_INSTANCE_ID)
      || PARENTOS_RUNTIME_APP_INSTANCE_ID,
    deviceId: optionalText(process.env.NIMI_APP_DEVICE_ID)
      || optionalText(process.env.NIMI_PARENTOS_ELECTRON_DEVICE_ID)
      || PARENTOS_RUNTIME_DEVICE_ID,
    launchHostId: DESKTOP_INSTALLED_APP_LAUNCH_HOST_ID,
    launchNonce: requireText(
      optionalText(process.env.NIMI_APP_LAUNCH_NONCE)
        || process.env.NIMI_PARENTOS_ELECTRON_LAUNCH_NONCE,
      'NIMI_APP_LAUNCH_NONCE or NIMI_PARENTOS_ELECTRON_LAUNCH_NONCE',
    ),
    releaseDescriptorRef: optionalText(process.env.NIMI_APP_RELEASE_DESCRIPTOR_REF)
      || optionalText(process.env.NIMI_PARENTOS_ELECTRON_RELEASE_DESCRIPTOR_REF)
      || PARENTOS_RELEASE_DESCRIPTOR_REF,
    realmBaseUrl: resolveParentOSRealmBaseUrl(),
  };
}

function resolveParentOSRealmBaseUrl(): string {
  const defaults = resolveElectronRuntimeDefaults();
  const realm = defaults.realm;
  const realmBaseUrl = realm && typeof realm === 'object' && !Array.isArray(realm)
    ? optionalText((realm as { realmBaseUrl?: unknown }).realmBaseUrl)
    : '';
  if (!realmBaseUrl) {
    throw new Error('ParentOS Electron launch binding requires host-projected Realm base URL.');
  }
  try {
    return new URL(realmBaseUrl).toString();
  } catch (error) {
    throw new Error(`ParentOS Electron launch binding has invalid Realm base URL: ${realmBaseUrl}`, {
      cause: error,
    });
  }
}

function requireText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) {
    throw new Error(`ParentOS Electron Runtime auth requires ${field}`);
  }
  return normalized;
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
