import {
  createNimiRuntimeRouteOptionsHostDeps,
  listNimiRuntimeRouteOptionsWithHost,
  normalizeNimiRuntimeRouteCapabilityToken,
  type NimiRuntimeCanonicalCapability,
  type NimiRuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/runtime';
import { getParentOSNimiClient } from './parentos-nimi-client.js';

export type ParentosRuntimeRouteCapability =
  | 'text.generate'
  | 'text.generate.vision'
  | 'audio.transcribe'
  | 'chat'
  | 'vision'
  | 'stt';

const PARENTOS_ROUTE_CAPABILITY_ALIASES: Record<string, NimiRuntimeCanonicalCapability> = {
  'text.generate': 'text.generate',
  chat: 'text.generate',
  'text.generate.vision': 'text.generate.vision',
  vision: 'text.generate.vision',
  'audio.transcribe': 'audio.transcribe',
  stt: 'audio.transcribe',
};

export function normalizeParentosRuntimeRouteCapability(
  capability: unknown,
): NimiRuntimeCanonicalCapability {
  const normalized = normalizeNimiRuntimeRouteCapabilityToken(capability);
  const canonical = normalized ? PARENTOS_ROUTE_CAPABILITY_ALIASES[normalized] : null;
  if (!canonical) {
    throw new Error(`ParentOS runtime route capability is unsupported: ${String(capability || '')}`);
  }
  return canonical;
}

export async function loadParentosRuntimeRouteOptions(
  capability: ParentosRuntimeRouteCapability,
): Promise<NimiRuntimeRouteOptionsSnapshot> {
  const normalized = normalizeParentosRuntimeRouteCapability(capability);
  const client = getParentOSNimiClient();
  return listNimiRuntimeRouteOptionsWithHost(
    { capability: normalized },
    createNimiRuntimeRouteOptionsHostDeps(client.runtime),
  );
}
