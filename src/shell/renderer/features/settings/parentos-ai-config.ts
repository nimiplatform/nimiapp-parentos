import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import type { NimiAIConfigSnapshot } from '@nimiplatform/sdk/ai';
import {
  getParentOSNimiClient,
  hasParentOSNimiClient,
} from '../../infra/parentos-nimi-client.js';

export type ParentosAIConfigSnapshot = Awaited<ReturnType<NimiLocalAppClient['aiConfig']['get']>>;
export type ParentosAIConfigCapabilityContract = 'text.generate' | 'audio.transcribe';

export const PARENTOS_TEXT_CAPABILITY_CONTRACT = 'text.generate';
export const PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT = 'audio.transcribe';
export const PARENTOS_AI_CAPABILITY_CONTRACTS: readonly ParentosAIConfigCapabilityContract[] = [
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
  PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT,
];

type ParentosAIConfigCapabilityError = Error & { readonly reasonCode: string };

function reasonCodeFromUnknownError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const reasonCode = typeof record.reasonCode === 'string' ? record.reasonCode.trim() : '';
  if (reasonCode) {
    return reasonCode;
  }
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  return code || 'runtime-service-unavailable';
}

// ParentOS chooses a read-only settings composition with an optional Desktop
// handoff. The covered self-owner manager still owns canonical get/options/CAS
// semantics; this UI choice is not an authorization boundary.
export async function readParentosAIConfig(): Promise<
  | { readonly state: 'ready'; readonly snapshot: ParentosAIConfigSnapshot }
  | { readonly state: 'not-configured'; readonly reasonCode: 'ai-config-not-found' }
  | { readonly state: 'unavailable'; readonly reasonCode: string }
> {
  if (!hasParentOSNimiClient()) {
    return { state: 'unavailable', reasonCode: 'nimi-shell-runtime-bridge-unavailable' };
  }
  try {
    const snapshot = await getParentOSNimiClient().aiConfig.get();
    if (!snapshot.config) {
      return { state: 'not-configured', reasonCode: 'ai-config-not-found' };
    }
    requireParentosAIConfigOwner(snapshot);
    return { state: 'ready', snapshot };
  } catch (error) {
    const reasonCode = reasonCodeFromUnknownError(error);
    return { state: 'unavailable', reasonCode };
  }
}

export function hasReadyParentosLocalCapability(
  snapshot: NimiAIConfigSnapshot,
  capabilityContract: ParentosAIConfigCapabilityContract,
): boolean {
  const intent = snapshot.config?.capabilities.find(
    (capability) => capability.capabilityContract === capabilityContract,
  );
  if (intent?.route.oneofKind !== 'local') return false;
  const selection = snapshot.effectiveSelections.find(
    (entry) => entry.capabilityContract === capabilityContract,
  );
  return selection?.state === 'ready'
    && selection.resource?.oneofKind === 'local'
    && selection.resource.local.loadoutRef === intent.route.local.loadoutRef;
}

export async function hasParentosAIConfigCapability(
  capabilityContract: ParentosAIConfigCapabilityContract,
): Promise<boolean> {
  const result = await readParentosAIConfig();
  return result.state === 'ready'
    && hasReadyParentosLocalCapability(result.snapshot, capabilityContract);
}

export async function requireParentosAIConfigCapability(
  capabilityContract: ParentosAIConfigCapabilityContract,
): Promise<void> {
  const result = await readParentosAIConfig();
  if (result.state === 'unavailable') {
    throw Object.assign(
      new Error(`ParentOS could not read the Nimi-owned ${capabilityContract} AIConfig intent.`),
      { reasonCode: result.reasonCode },
    ) as ParentosAIConfigCapabilityError;
  }
  const configured = result.state === 'ready'
    && hasReadyParentosLocalCapability(result.snapshot, capabilityContract);
  if (!configured) {
    throw Object.assign(
      new Error(`ParentOS requires a Nimi-owned local ${capabilityContract} AIConfig intent.`),
      { reasonCode: 'parentos-ai-capability-not-configured' },
    ) as ParentosAIConfigCapabilityError;
  }
}

function requireParentosAIConfigOwner(snapshot: NimiAIConfigSnapshot): void {
  const owner = snapshot.config?.owner?.owner;
  if (owner?.oneofKind !== 'app' || owner.app.appId !== 'nimi.parentos') {
    throw new Error('ParentOS AIConfig owner must be the exact nimi.parentos App.');
  }
}
