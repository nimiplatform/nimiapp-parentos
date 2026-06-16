import {
  createNimiClient,
  type NimiClient,
} from '@nimiplatform/sdk';
import {
  AccountSessionState,
  AuthorizationPreset,
  ExternalPrincipalType,
  PolicyMode,
  type AuthorizeExternalPrincipalResponse,
  type AccountProjection,
} from '@nimiplatform/sdk/runtime/generated';
import {
  Runtime,
  createNimiDeveloperRegisteredRuntimeAccountCaller,
  createNimiRuntimeAppSessionMetadataProvider,
  createNimiRuntimeFullAppRegistration,
  toNimiRuntimeTimestamp,
  withNimiRuntimeIdempotencyMetadata,
  type NimiRuntimeAccountCaller,
  type NimiRuntimeAppStorageProjection,
  type RuntimeOptions,
} from '@nimiplatform/sdk/runtime';
import { createNimiClientId, type CoreMetadata } from '@nimiplatform/sdk/types';
import {
  getParentOSRuntimeDefaults,
} from '../bridge/index.js';
import { useAppStore } from '../app-shell/app-store.js';
import {
  dbInit,
  getAppSetting,
  getChild,
  getChildren,
  getFamily,
  prepareParentOSAppStorage,
  type ParentOSAppStorageProjectionInput,
} from '../bridge/sqlite-bridge.js';
import { mapChildRow } from '../bridge/mappers.js';
import { loadPersistedParentosAIConfig } from '../features/settings/parentos-ai-config.js';
import { ensureParentosAIConfigFromFirstRunEvidence } from '../features/settings/parentos-ai-config-bootstrap.js';
import { loadAndApplyPersistedAppLanguage } from '../i18n/app-language.js';
import { describeError, logRendererEvent } from './telemetry/renderer-log.js';
import { hasParentOSNimiClient, setParentOSNimiClient } from './parentos-nimi-client.js';

// PO-SHELL-001 / PO-SHELL-008: ParentOS is a non-first-party
// developer-registered local Runtime account/session consumer. Runtime owns
// login custody, app sessions, and protected access metadata. No app-owned
// token surface is admitted.
export const PARENTOS_RUNTIME_APP_ID = 'nimi.parentos';
export const PARENTOS_RUNTIME_APP_INSTANCE_ID = `${PARENTOS_RUNTIME_APP_ID}.local-developer`;
export const PARENTOS_RUNTIME_DEVICE_ID = 'parentos-local-developer-device';
export const PARENTOS_RUNTIME_STORAGE_POLICY_REF = 'nimi-data-app-roots';
const PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID = `${PARENTOS_RUNTIME_APP_ID}.platform-runtime-session`;
const PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID = 'platform-runtime-session';
const PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS = 3600;
const PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS = 30_000;
const PARENTOS_RUNTIME_PROTECTED_SCOPES = ['ai.spend.meter'] as const;
const PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION = 'sdk-v2';
const PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS = 3600;
const PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS = 60_000;
const PARENTOS_RUNTIME_PROTECTED_CONSENT_ID = 'parentos-runtime-account';
const PARENTOS_RUNTIME_DEVELOPER_REGISTRATION = import.meta.env.DEV === true;

export const parentosRuntimeAccountCaller: NimiRuntimeAccountCaller =
  createNimiDeveloperRegisteredRuntimeAccountCaller({
    appId: PARENTOS_RUNTIME_APP_ID,
    appInstanceId: PARENTOS_RUNTIME_APP_INSTANCE_ID,
    deviceId: PARENTOS_RUNTIME_DEVICE_ID,
  });

let bootstrapPromise: Promise<void> | null = null;
let localDataSyncPromise: Promise<void> = Promise.resolve();
const ACTIVE_CHILD_SETTING_KEYS = ['activeChildId', 'inspection:last-active-child-id'] as const;
let protectedAccessCache: {
  readonly subjectUserId: string;
  readonly metadata: CoreMetadata;
  readonly expiresAtMs: number;
} | null = null;
let protectedAccessInflight: Promise<{
  readonly subjectUserId: string;
  readonly metadata: CoreMetadata;
  readonly expiresAtMs: number;
}> | null = null;

export type ParentOSAuthUser = {
  id: string;
  displayName: string;
};

export function normalizeParentOSAccountProjection(
  projection: AccountProjection | null | undefined,
): ParentOSAuthUser | null {
  const accountId = String(projection?.accountId || '').trim();
  if (!accountId) {
    return null;
  }
  return {
    id: accountId,
    displayName: String(projection?.displayName || '').trim(),
  };
}

export async function loadParentOSRuntimeAccountUser(
  runtime: Runtime,
): Promise<ParentOSAuthUser | null> {
  const response = await runtime.account.getAccountSessionStatus({
    caller: parentosRuntimeAccountCaller,
  });
  if (response.state !== AccountSessionState.AUTHENTICATED) {
    return null;
  }
  return normalizeParentOSAccountProjection(response.accountProjection);
}

function requireParentOSAppStorageProjection(
  projection: NimiRuntimeAppStorageProjection,
): ParentOSAppStorageProjectionInput {
  if (projection.appId !== PARENTOS_RUNTIME_APP_ID) {
    throw new Error(
      `ParentOS storage projection expected ${PARENTOS_RUNTIME_APP_ID}, got ${projection.appId}`,
    );
  }
  if (projection.state !== 'ready') {
    throw new Error(
      `ParentOS storage projection requires Runtime ready state, got ${projection.state}`,
    );
  }
  if (projection.storagePolicyRef !== PARENTOS_RUNTIME_STORAGE_POLICY_REF) {
    throw new Error(
      `ParentOS storage projection expected storagePolicyRef ${PARENTOS_RUNTIME_STORAGE_POLICY_REF}, got ${projection.storagePolicyRef}`,
    );
  }
  const roots = {
    durableDataRoot: projection.durableDataRoot.trim(),
    cacheRoot: projection.cacheRoot.trim(),
    tempRoot: projection.tempRoot.trim(),
  };
  if (!roots.durableDataRoot || !roots.cacheRoot || !roots.tempRoot) {
    throw new Error('ParentOS storage projection returned an empty Runtime app storage root');
  }
  return {
    appId: projection.appId,
    state: projection.state,
    storagePolicyRef: projection.storagePolicyRef,
    ...roots,
  };
}

async function resolveParentOSAppStorageProjection(
  runtime: Runtime,
): Promise<ParentOSAppStorageProjectionInput> {
  const projection = await runtime.appLifecycle.storage({ appId: PARENTOS_RUNTIME_APP_ID });
  return requireParentOSAppStorageProjection(projection);
}

export async function runParentOSBootstrap(options: { force?: boolean } = {}): Promise<void> {
  if (bootstrapPromise && !options.force) {
    return bootstrapPromise;
  }
  if (options.force) {
    bootstrapPromise = null;
  }
  bootstrapPromise = doRunParentOSBootstrap().finally(() => {
    if (!useAppStore.getState().bootstrapReady) {
      bootstrapPromise = null;
    }
  });
  return bootstrapPromise;
}

export async function ensureParentOSBootstrapReady(): Promise<void> {
  const store = useAppStore.getState();
  if (store.bootstrapReady) {
    return;
  }
  await runParentOSBootstrap();
  const next = useAppStore.getState();
  if (!next.bootstrapReady) {
    throw new Error(next.bootstrapError || 'ParentOS bootstrap did not complete');
  }
}

export async function ensureParentOSRuntimeClientReady(): Promise<void> {
  await ensureParentOSBootstrapReady();
  if (hasParentOSNimiClient()) {
    return;
  }

  await runParentOSBootstrap({ force: true });
  if (!hasParentOSNimiClient()) {
    throw new Error('ParentOS Nimi client is unavailable after bootstrap retry');
  }
}

async function loadPersistedActiveChildId(): Promise<string | null> {
  for (const key of ACTIVE_CHILD_SETTING_KEYS) {
    const value = String(await getAppSetting(key) || '').trim();
    if (value) {
      return value;
    }
  }
  return null;
}

async function loadScopedLocalData(subjectUserId?: string | null): Promise<void> {
  const store = useAppStore.getState();
  store.clearLocalData();

  await dbInit(subjectUserId);

  await loadAndApplyPersistedAppLanguage();

  const persistedAIConfig = await loadPersistedParentosAIConfig();
  if (persistedAIConfig) {
    useAppStore.getState().setAIConfig(persistedAIConfig);
  }

  const persistedActiveChildId = await loadPersistedActiveChildId();
  const persistedActiveChild = persistedActiveChildId
    ? await getChild(persistedActiveChildId)
    : null;
  const familyId = persistedActiveChild?.familyId
    ?? (await getFamily())?.familyId
    ?? null;
  if (!familyId) {
    return;
  }

  useAppStore.getState().setFamilyId(familyId);
  const rows = await getChildren(familyId);
  const children = rows.map(mapChildRow);
  useAppStore.getState().setChildren(children);
  if (children.length > 0) {
    const resolvedActiveChildId = children.find((child) => child.childId === persistedActiveChildId)?.childId
      ?? children[0]!.childId;
    useAppStore.getState().setActiveChildId(resolvedActiveChildId);
  }
}

export function syncParentOSLocalDataScope(subjectUserId?: string | null): Promise<void> {
  const normalizedSubjectUserId = String(subjectUserId || '').trim() || null;
  localDataSyncPromise = localDataSyncPromise
    .catch(() => undefined)
    .then(() => loadScopedLocalData(normalizedSubjectUserId));
  return localDataSyncPromise;
}

function parentosRuntimeOptions(authMetadata?: () => Promise<CoreMetadata>): RuntimeOptions {
  return {
    appId: PARENTOS_RUNTIME_APP_ID,
    metadata: {
      callerId: PARENTOS_RUNTIME_APP_ID,
      surfaceId: 'parentos.runtime',
    },
    ...(authMetadata ? { authMetadata } : {}),
    transport: {
      type: 'tauri-ipc',
      commandNamespace: 'runtime_bridge',
      eventNamespace: 'runtime_bridge',
    },
  };
}

async function registerParentOSRuntimeAccountCaller(accountRuntime: Runtime): Promise<void> {
  await createNimiRuntimeFullAppRegistration(
    () => ({ auth: accountRuntime.auth }),
    {
      appId: PARENTOS_RUNTIME_APP_ID,
      appInstanceId: parentosRuntimeAccountCaller.appInstanceId,
      deviceId: parentosRuntimeAccountCaller.deviceId,
      capabilities: [...PARENTOS_RUNTIME_PROTECTED_SCOPES],
      developerRegistration: PARENTOS_RUNTIME_DEVELOPER_REGISTRATION,
      rejectionLabel: 'ParentOS Runtime account caller registration rejected',
    },
  )();
}

function createParentOSRuntimeAuthMetadataProvider(accountRuntime: Runtime): () => Promise<CoreMetadata> {
  const requiredRuntimeSessionMetadata = createNimiRuntimeAppSessionMetadataProvider({
    appId: PARENTOS_RUNTIME_APP_ID,
    appInstanceId: PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID,
    deviceId: PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID,
    ttlSeconds: PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS,
    refreshSkewMs: PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS,
    capabilities: [...PARENTOS_RUNTIME_PROTECTED_SCOPES],
    developerRegistration: PARENTOS_RUNTIME_DEVELOPER_REGISTRATION,
    auth: accountRuntime.auth,
  });
  return async () => {
    const session = await accountRuntime.account.getAccountSessionStatus({
      caller: parentosRuntimeAccountCaller,
    });
    if (session.state !== AccountSessionState.AUTHENTICATED || !session.accountProjection?.accountId) {
      return {};
    }
    const appSessionMetadata = await requiredRuntimeSessionMetadata();
    const protectedAccessMetadata = await getParentOSRuntimeProtectedAccessMetadata(
      accountRuntime,
      session.accountProjection.accountId,
    );
    return {
      ...appSessionMetadata,
      ...protectedAccessMetadata,
    };
  };
}

async function getParentOSRuntimeProtectedAccessMetadata(
  accountRuntime: Runtime,
  subjectUserId: string,
): Promise<CoreMetadata> {
  if (
    protectedAccessCache
    && protectedAccessCache.subjectUserId === subjectUserId
    && protectedAccessCache.expiresAtMs - Date.now() > PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS
  ) {
    return protectedAccessCache.metadata;
  }
  protectedAccessInflight ??= issueParentOSRuntimeProtectedAccessMetadata(accountRuntime, subjectUserId);
  try {
    protectedAccessCache = await protectedAccessInflight;
    return protectedAccessCache.metadata;
  } finally {
    protectedAccessInflight = null;
  }
}

async function issueParentOSRuntimeProtectedAccessMetadata(
  accountRuntime: Runtime,
  subjectUserId: string,
): Promise<{
  readonly subjectUserId: string;
  readonly metadata: CoreMetadata;
  readonly expiresAtMs: number;
}> {
  const token = await accountRuntime.grants.authorizeExternalPrincipal({
    domain: 'app-auth',
    appId: PARENTOS_RUNTIME_APP_ID,
    externalPrincipalId: PARENTOS_RUNTIME_APP_ID,
    externalPrincipalType: ExternalPrincipalType.APP,
    subjectUserId,
    consentId: PARENTOS_RUNTIME_PROTECTED_CONSENT_ID,
    consentVersion: 'v1',
    decisionAt: toNimiRuntimeTimestamp(new Date()),
    policyVersion: 'parentos-runtime-account-v1',
    policyMode: PolicyMode.CUSTOM,
    preset: AuthorizationPreset.UNSPECIFIED,
    scopes: [...PARENTOS_RUNTIME_PROTECTED_SCOPES],
    resourceSelectors: {
      conversationIds: [],
      messageIds: [],
      documentIds: [],
      labels: {},
    },
    canDelegate: false,
    maxDelegationDepth: 0,
    ttlSeconds: PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS,
    scopeCatalogVersion: PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION,
    policyOverride: false,
  }, withNimiRuntimeIdempotencyMetadata({
    metadata: { domain: 'app-auth' },
  }, createNimiClientId(`parentos-runtime-protected-${sanitizeProtectedAccessId(subjectUserId)}`)));
  const tokenId = normalizeRuntimeAuthText(token.tokenId);
  const secret = normalizeRuntimeAuthText(token.secret);
  if (!tokenId || !secret) {
    throw new Error('ParentOS Runtime protected access token response is missing credentials.');
  }
  return {
    subjectUserId,
    metadata: {
      'x-nimi-access-token-id': tokenId,
      'x-nimi-access-token-secret': secret,
    },
    expiresAtMs: runtimeTimestampMillis(token) || Date.now() + (PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS * 1000),
  };
}

function runtimeTimestampMillis(token: AuthorizeExternalPrincipalResponse): number {
  const expiresAt = token.expiresAt;
  if (!expiresAt) {
    return 0;
  }
  const seconds = Number(expiresAt.seconds || 0);
  const nanos = Number(expiresAt.nanos || 0);
  const millis = (seconds * 1000) + Math.floor(nanos / 1_000_000);
  return Number.isFinite(millis) && millis > 0 ? millis : 0;
}

function sanitizeProtectedAccessId(subjectUserId: string): string {
  return subjectUserId.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 80) || 'unknown';
}

function normalizeRuntimeAuthText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function buildParentOSNimiClient(): Promise<NimiClient> {
  // PO-SHELL-008 / K-ACCSVC-008: Runtime account custody owns login,
  // app session metadata, and protected AI spend tokens.
  // ParentOS constructs only SDK Runtime projections and never receives token
  // material.
  const accountRuntime = new Runtime(parentosRuntimeOptions());
  await accountRuntime.ready();
  await registerParentOSRuntimeAccountCaller(accountRuntime);
  const runtime = new Runtime(parentosRuntimeOptions(
    createParentOSRuntimeAuthMetadataProvider(accountRuntime),
  ));
  const client = createNimiClient({
    appId: PARENTOS_RUNTIME_APP_ID,
    runtime,
    app: false,
    permissions: false,
  });
  await client.runtime.ready();
  return client;
}

async function doRunParentOSBootstrap(): Promise<void> {
  const store = useAppStore.getState();
  const flowId = `parentos-bootstrap-${Date.now().toString(36)}`;

  try {
      // Step 1: Runtime defaults (realm base URL, transport).
      const runtimeDefaults = await getParentOSRuntimeDefaults();
      store.setRuntimeDefaults(runtimeDefaults);

    // Step 2: Construct and register the local-developer Runtime platform
    // client. The SDK helper type-rejects accessToken / refreshToken /
    // sessionStore inputs.
    setParentOSNimiClient(null);
      const client = await buildParentOSNimiClient();
    setParentOSNimiClient(client);
    const runtime = client.runtime;

    // Step 3: Prepare Nimi Data app storage after Runtime has admitted
    // nimi.parentos. This also grants the Runtime-projected durable data
    // root to the Tauri asset scope before any saved media can render.
    const storageProjection = await resolveParentOSAppStorageProjection(runtime);
    await prepareParentOSAppStorage(storageProjection);

    // Step 4: Resolve the current account from runtime projection. Anonymous /
    // unavailable / errors must NOT fail bootstrap (PO-SHELL-001) — ParentOS
    // opens against the anonymous local scope and waits for runtime broker
    // login to switch.
    const runtimeAccountUser = await loadParentOSRuntimeAccountUser(runtime).catch((error) => {
      logRendererEvent({
        level: 'warn',
        area: 'parentos-bootstrap.account',
        message: 'action:runtime-account-projection-unavailable',
        flowId,
        details: { error: describeError(error) },
      });
      return null;
    });
    if (runtimeAccountUser) {
      store.setAuthSession(runtimeAccountUser);
    } else {
      store.clearAuthSession();
    }

    // Step 5: Local SQLite scope (local-first; anonymous OK only after the
    // Runtime-owned app storage projection is available).
    await syncParentOSLocalDataScope(runtimeAccountUser?.id ?? null);

    // Step 6: Runtime SDK readiness (non-blocking — core surfaces work without
    // runtime extras).
    try {
      await runtime.ready();
      const aiConfigInit = await ensureParentosAIConfigFromFirstRunEvidence({
        client,
      });
      if (aiConfigInit.outcome === 'not-initialized') {
        logRendererEvent({
          level: 'warn',
          area: 'parentos-bootstrap.ai-config',
          message: 'action:first-run-ai-config-init-skipped',
          flowId,
          details: {
            reason: aiConfigInit.reason,
            detail: aiConfigInit.detail,
          },
        });
      }
    } catch (error) {
      logRendererEvent({
        level: 'warn',
        area: 'bootstrap.runtime',
        message: 'action:runtime-ready-nonblocking-failed',
        flowId,
        details: { error: describeError(error) },
      });
    }

    store.setBootstrapReady(true);
    store.setBootstrapError(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setParentOSNimiClient(null);
    store.clearAuthSession();
    logRendererEvent({
      level: 'error',
      area: 'bootstrap',
      message: 'action:bootstrap-failed',
      flowId,
      details: { error: describeError(error) },
    });
    store.setBootstrapError(message);
    store.setBootstrapReady(false);
  }
}
