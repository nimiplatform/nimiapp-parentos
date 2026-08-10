import { createNimiClient } from '@nimiplatform/sdk';
import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import {
  createNimiLocalAppStandardShellSurface,
  hasNimiShellRuntime,
} from '../bridge/index.js';

let parentOSNimiClient: NimiLocalAppClient | null = null;

export function setParentOSNimiClient(client: NimiLocalAppClient | null): void {
  parentOSNimiClient = client;
}

export function hasParentOSNimiClient(): boolean {
  return parentOSNimiClient !== null;
}

export function getParentOSNimiClient(): NimiLocalAppClient {
  if (!parentOSNimiClient) {
    throw new Error('ParentOS Nimi client is not initialized. Run bootstrap before using Runtime surfaces.');
  }
  return parentOSNimiClient;
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
