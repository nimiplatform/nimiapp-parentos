import { createNimiClient, type NimiAppRuntimeClient } from '@nimiplatform/sdk';
import type { NimiCurrentUserDisplay, NimiLocalAppClient } from '@nimiplatform/sdk/app';
import type { NimiAppSession } from '@nimiplatform/kit/auth/app';
import {
  createNimiLocalAppStandardShellSurface,
  hasNimiShellRuntime,
} from '../bridge/index.js';

export type ParentOSNimiClient = NimiLocalAppClient | NimiAppRuntimeClient;

let parentOSNimiClient: NimiLocalAppClient | null = null;
let parentOSWebSession: NimiAppSession | null = null;

export function setParentOSNimiClient(client: NimiLocalAppClient | null): void {
  parentOSNimiClient = client;
}

export function bindParentOSWebSession(session: NimiAppSession | null): void {
  parentOSWebSession = session;
}

export function getParentOSWebSession(): NimiAppSession | null {
  return parentOSWebSession;
}

export function isParentOSWebMode(): boolean {
  return parentOSWebSession !== null;
}

export function hasParentOSNimiClient(): boolean {
  if (parentOSWebSession) {
    const runtime = parentOSWebSession.getSnapshot().runtime;
    return runtime.status === 'connected' && !runtime.scope.signal.aborted;
  }
  return parentOSNimiClient !== null;
}

export function getParentOSNimiClient(): ParentOSNimiClient {
  if (parentOSWebSession) {
    const runtime = parentOSWebSession.getSnapshot().runtime;
    if (runtime.status !== 'connected') {
      throw Object.assign(
        new Error('ParentOS Web session is not connected to a primary PC Runtime.'),
        { reasonCode: 'runtime-disconnected' },
      );
    }
    runtime.scope.signal.throwIfAborted();
    return runtime.scope.client;
  }
  if (!parentOSNimiClient) {
    throw new Error('ParentOS Nimi client is not initialized. Run bootstrap before using Runtime surfaces.');
  }
  return parentOSNimiClient;
}

export async function getParentOSCurrentUser(): Promise<NimiCurrentUserDisplay | null> {
  if (parentOSWebSession) {
    const identity = parentOSWebSession.getSnapshot().identity;
    if (identity.status !== 'signed-in' || !identity.user) {
      return null;
    }
    return {
      displayName: identity.user.displayName,
      handle: identity.user.handle ?? '',
      avatarUrl: identity.user.avatarUrl ?? null,
    };
  }
  if (!parentOSNimiClient) {
    return null;
  }
  return await parentOSNimiClient.currentUser.get();
}

export function subscribeParentOSSessionInvalidated(listener: () => void): () => void {
  if (parentOSWebSession) {
    const session = parentOSWebSession;
    const readKey = () => {
      const snapshot = session.getSnapshot();
      const identityKey = snapshot.identity.status === 'signed-in' ? snapshot.identity.viewKey : '';
      const runtimeKey = snapshot.runtime.status === 'connected' ? snapshot.runtime.scope.viewKey : '';
      return `${identityKey}|${runtimeKey}`;
    };
    let previousKey = readKey();
    return session.subscribe(() => {
      const nextKey = readKey();
      if (nextKey !== previousKey) {
        previousKey = nextKey;
        listener();
      }
    });
  }
  return window.parentOSHost?.onSessionInvalidated(listener) ?? (() => {});
}

// The local-app client is a thin typed carrier over the host-injected standard
// shell. Creating it never contacts the Runtime; probing access is a separate
// call (see infra/runtime-status.ts), so app-owned hydration stays independent
// from Nimi access posture.
export function createParentOSNimiClient(): NimiLocalAppClient | null {
  if (!hasNimiShellRuntime()) {
    return null;
  }
  try {
    return createNimiClient({
      localApp: {
        standardShell: createNimiLocalAppStandardShellSurface(),
      },
    });
  } catch {
    return null;
  }
}
