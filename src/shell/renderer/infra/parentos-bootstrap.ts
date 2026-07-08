import {
  createNimiClient,
  type NimiClient,
} from '@nimiplatform/sdk';
import {
  AccountSessionState,
  AccountCallerMode,
  type AccountProjection,
} from '@nimiplatform/sdk/runtime/wire-types';
import {
  Runtime,
  type NimiRuntimeAccountCaller,
  type RuntimeOptions,
} from '@nimiplatform/sdk/runtime';
import {
  getParentOSRuntimeDefaults,
  hasElectronRuntime,
} from '../bridge/index.js';
import { useAppStore } from '../app-shell/app-store.js';
import {
  dbInit,
  getAppSetting,
  getChild,
  getChildren,
  getFamily,
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

export const parentosRuntimeAccountCaller: NimiRuntimeAccountCaller = {
  appId: PARENTOS_RUNTIME_APP_ID,
  appInstanceId: PARENTOS_RUNTIME_APP_INSTANCE_ID,
  deviceId: PARENTOS_RUNTIME_DEVICE_ID,
  mode: AccountCallerMode.LOCAL_DEVELOPER_APP,
  scopes: [],
  launchHostId: '',
  launchNonce: '',
  releaseDescriptorRef: '',
};

let bootstrapPromise: Promise<void> | null = null;
let localDataSyncPromise: Promise<void> = Promise.resolve();
const ACTIVE_CHILD_SETTING_KEYS = ['activeChildId', 'inspection:last-active-child-id'] as const;

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

function parentosRuntimeOptions(): RuntimeOptions {
  return {
    appId: PARENTOS_RUNTIME_APP_ID,
    hostOwnedIdentity: true,
    metadata: {
      surfaceId: 'parentos.runtime',
    },
    transport: parentosRuntimeTransport(),
  };
}

function parentosRuntimeTransport(): RuntimeOptions['transport'] {
  if (hasElectronRuntime()) {
    return { type: 'electron-ipc' };
  }
  return {
    type: 'tauri-ipc',
    commandNamespace: 'runtime_bridge',
    eventNamespace: 'runtime_bridge',
  };
}

async function buildParentOSNimiClient(): Promise<NimiClient> {
  // PO-SHELL-008 / K-ACCSVC-008: Runtime account custody owns login,
  // app session metadata, and protected AI spend tokens.
  // ParentOS renderer constructs only the SDK Runtime transport/client. The
  // Tauri host trusted metadata provider owns RegisterApp, app session, and
  // protected access metadata.
  const runtime = new Runtime(parentosRuntimeOptions());
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

    // Step 3: Host-owned storage roots were already bound before renderer hydration.
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

    // Step 5: Local SQLite scope. Renderer only selects anonymous/account DB
    // scope here; storage roots are host-owned.
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
