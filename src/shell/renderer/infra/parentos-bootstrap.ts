import {
  createInstalledNimiAppBootstrap,
  createNimiError,
} from '@nimiplatform/sdk';
import { useAppStore } from '../app-shell/app-store.js';
import { classifyParentOSProtectedSessionFailure } from '../app-shell/protected-session-state.js';
import {
  createInstalledNimiAppStandardShellSurface,
} from '../bridge/index.js';
import {
  dbInit,
  getAppSetting,
  getChild,
  getChildren,
  getFamily,
} from '../bridge/sqlite-bridge.js';
import { mapChildRow } from '../bridge/mappers.js';
import { loadPersistedParentosAIConfig } from '../features/settings/parentos-ai-config.js';
import { loadAndApplyPersistedAppLanguage } from '../i18n/app-language.js';
import { describeError, logRendererEvent } from './telemetry/renderer-log.js';
import { setParentOSNimiClient } from './parentos-nimi-client.js';

// ParentOS has no renderer-owned app identity, release, endpoint, account
// caller, or session authority. The only admitted installed projection today
// is the typed protected artifact carrier. Product data stays locked until the
// complete ParentOS operation set is admitted by Runtime.
export const PARENTOS_RUNTIME_APP_ID = 'nimi.parentos';

const PARENTOS_OPERATION_SET_REASON = 'parentos-protected-operation-set-not-admitted';
const PARENTOS_OPERATION_SET_ACTION = 'wait_for_parentos_protected_operation_admission';
const ACTIVE_CHILD_SETTING_KEYS = ['activeChildId', 'inspection:last-active-child-id'] as const;

let bootstrapPromise: Promise<void> | null = null;
let localDataSyncPromise: Promise<void> = Promise.resolve();

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
  if (!useAppStore.getState().bootstrapReady) {
    await runParentOSBootstrap();
  }
  const state = useAppStore.getState();
  if (!state.bootstrapReady) {
    throw new Error(
      state.bootstrapFailure?.message
      || state.bootstrapError
      || 'The protected ParentOS operation set is unavailable.',
    );
  }
}

export async function ensureParentOSRuntimeClientReady(): Promise<void> {
  await runParentOSBootstrap({ force: true });
  const failure = useAppStore.getState().bootstrapFailure;
  throw new Error(
    failure?.message
    || 'The protected ParentOS operation set is not admitted; generic Runtime access is forbidden.',
  );
}

async function doRunParentOSBootstrap(): Promise<void> {
  const store = useAppStore.getState();
  const flowId = `parentos-bootstrap-${Date.now().toString(36)}`;

  store.setBootstrapReady(false);
  store.setBootstrapError(null);
  store.setBootstrapFailure(null);
  store.clearAuthSession();
  setParentOSNimiClient(null);

  try {
    const standardShell = createInstalledNimiAppStandardShellSurface();
    createInstalledNimiAppBootstrap({ standardShell });

    throw createNimiError({
      message: 'The protected ParentOS operation set is not admitted.',
      reasonCode: PARENTOS_OPERATION_SET_REASON,
      actionHint: PARENTOS_OPERATION_SET_ACTION,
      source: 'sdk',
    });
  } catch (error) {
    const failure = classifyParentOSProtectedSessionFailure(error);
    logRendererEvent({
      level: 'warn',
      area: 'bootstrap.protected-session',
      message: 'action:protected-session-unavailable',
      flowId,
      details: {
        error: describeError(error),
        reasonCode: failure.reasonCode,
        actionHint: failure.actionHint,
        state: failure.state,
      },
    });
    store.setBootstrapFailure(failure);
    store.setBootstrapError(failure.message);
    store.setBootstrapReady(false);
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

// This is retained for the future admitted protected-session transition. It is
// deliberately not called by bootstrap while the ParentOS operation set is
// unadmitted, so neither SQLite nor AIConfig can become a parallel admission
// truth.
export function syncParentOSLocalDataScope(subjectUserId?: string | null): Promise<void> {
  const normalizedSubjectUserId = String(subjectUserId || '').trim() || null;
  localDataSyncPromise = localDataSyncPromise
    .catch(() => undefined)
    .then(() => loadScopedLocalData(normalizedSubjectUserId));
  return localDataSyncPromise;
}
