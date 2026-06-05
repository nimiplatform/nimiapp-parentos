import type { NimiClient } from '@nimiplatform/sdk';

let parentOSNimiClient: NimiClient | null = null;

export function setParentOSNimiClient(client: NimiClient | null): void {
  parentOSNimiClient = client;
}

export function hasParentOSNimiClient(): boolean {
  return parentOSNimiClient !== null;
}

export function getParentOSNimiClient(): NimiClient {
  if (!parentOSNimiClient) {
    throw new Error('ParentOS Nimi client is not initialized. Run bootstrap before using Runtime surfaces.');
  }
  return parentOSNimiClient;
}
