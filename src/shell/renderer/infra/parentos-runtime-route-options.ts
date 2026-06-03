import { getPlatformClient } from '@nimiplatform/sdk';
import {
  listRuntimeRouteOptions,
  normalizeRuntimeRouteCapabilityToken,
  type RuntimeCanonicalCapability,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/runtime';
import { useAppStore } from '../app-shell/app-store.js';

export type ParentosRuntimeRouteCapability =
  | RuntimeCanonicalCapability
  | 'chat'
  | 'vision'
  | 'stt';

export function normalizeParentosRuntimeRouteCapability(
  capability: unknown,
): RuntimeCanonicalCapability {
  const normalized = normalizeRuntimeRouteCapabilityToken(capability);
  if (!normalized) {
    throw new Error(`ParentOS runtime route capability is unsupported: ${String(capability || '')}`);
  }
  return normalized;
}

export function readParentosSelectedRuntimeRouteBinding(
  capability: ParentosRuntimeRouteCapability,
): RuntimeRouteBinding | null {
  const normalized = normalizeParentosRuntimeRouteCapability(capability);
  const binding = useAppStore.getState().aiConfig?.capabilities.selectedBindings?.[normalized] || null;
  return binding as RuntimeRouteBinding | null;
}

export async function loadParentosRuntimeRouteOptions(
  capability: ParentosRuntimeRouteCapability,
): Promise<RuntimeRouteOptionsSnapshot> {
  const normalized = normalizeParentosRuntimeRouteCapability(capability);
  return listRuntimeRouteOptions(getPlatformClient(), {
    capability: normalized,
    selectedBinding: readParentosSelectedRuntimeRouteBinding(normalized),
  });
}
