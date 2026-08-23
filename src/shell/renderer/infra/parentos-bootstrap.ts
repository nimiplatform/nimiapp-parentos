import { useAppStore } from '../app-shell/app-store.js';
import { classifyParentOSBootstrapFailure } from '../app-shell/bootstrap-failure.js';
import {
  dbInit,
  getAppSetting,
  getChild,
  getChildren,
  getFamily,
} from '../bridge/sqlite-bridge.js';
import { mapChildRow } from '../bridge/mappers.js';
import { loadAndApplyPersistedAppLanguage } from '../i18n/app-language.js';
import { REMINDER_RULES } from '../knowledge-base/index.js';
import { describeError, logRendererEvent } from './telemetry/renderer-log.js';
import { createParentOSNimiClient, setParentOSNimiClient } from './parentos-nimi-client.js';

// ParentOS owns its SQLite, media, settings, and product commands. The native
// host binds those surfaces to fixed OS app-data roots and the exact renderer;
// Nimi App Access posture never participates in local hydration.
const ACTIVE_CHILD_SETTING_KEYS = ['activeChildId', 'inspection:last-active-child-id'] as const;
const ADMITTED_REMINDER_RULE_IDS = REMINDER_RULES.map((rule) => rule.ruleId);

let bootstrapPromise: Promise<void> | null = null;

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
      || 'ParentOS app-owned local data is unavailable.',
    );
  }
}

async function doRunParentOSBootstrap(): Promise<void> {
  const store = useAppStore.getState();
  const flowId = `parentos-bootstrap-${Date.now().toString(36)}`;

  store.setBootstrapReady(false);
  store.setBootstrapError(null);
  store.setBootstrapFailure(null);
  store.clearLocalData();
  // Nimi access is established independently from app-owned data hydration:
  // client creation is side-effect free and never blocks local bootstrap.
  setParentOSNimiClient(createParentOSNimiClient());

  try {
    await loadLocalData();
    store.setBootstrapReady(true);
    logRendererEvent({
      level: 'info',
      area: 'bootstrap.app-data',
      message: 'action:app-owned-data-ready',
      flowId,
      details: {
        authorityClass: 'app_owned_authority',
        databaseScope: 'device-local',
      },
    });
  } catch (error) {
    const failure = classifyParentOSBootstrapFailure(error);
    logRendererEvent({
      level: 'error',
      area: 'bootstrap.app-data',
      message: 'action:app-owned-data-unavailable',
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

async function loadLocalData(): Promise<void> {
  const store = useAppStore.getState();
  store.clearLocalData();

  // The current ParentOS product is local-first. Its database is scoped to the
  // OS app-data root, not to a Nimi account or App Access decision.
  await dbInit(null, ADMITTED_REMINDER_RULE_IDS);
  await loadAndApplyPersistedAppLanguage();

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
