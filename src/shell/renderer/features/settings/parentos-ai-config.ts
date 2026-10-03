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

export function getParentosAIConfigManager(): NimiLocalAppClient['aiConfig'] {
  return getParentOSNimiClient().aiConfig;
}

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

// ParentOS edits its covered self-owner through the canonical manager. Desktop
// handoff remains an optional resource-management convenience.
export async function readParentosAIConfig(): Promise<
  | { readonly state: 'ready'; readonly snapshot: ParentosAIConfigSnapshot }
  | { readonly state: 'not-configured'; readonly reasonCode: 'ai-config-not-found'; readonly snapshot: ParentosAIConfigSnapshot }
  | { readonly state: 'unavailable'; readonly reasonCode: string }
> {
  if (!hasParentOSNimiClient()) {
    return { state: 'unavailable', reasonCode: 'nimi-shell-runtime-bridge-unavailable' };
  }
  try {
    const snapshot = await getParentOSNimiClient().aiConfig.get();
    if (!snapshot.config) {
      return { state: 'not-configured', reasonCode: 'ai-config-not-found', snapshot };
    }
    requireParentosAIConfigOwner(snapshot);
    return { state: 'ready', snapshot };
  } catch (error) {
    const reasonCode = reasonCodeFromUnknownError(error);
    return { state: 'unavailable', reasonCode };
  }
}

// Ready means Runtime projected a ready resource for the route the user
// committed, Local or Cloud; a resource of the other kind never counts.
export function hasReadyParentosCapability(
  snapshot: NimiAIConfigSnapshot,
  capabilityContract: ParentosAIConfigCapabilityContract,
): boolean {
  const route = snapshot.config?.capabilities.find(
    (capability) => capability.capabilityContract === capabilityContract,
  )?.route.oneofKind;
  const selection = snapshot.effectiveSelections.find(
    (entry) => entry.capabilityContract === capabilityContract,
  );
  if (selection?.state !== 'ready') return false;
  switch (selection.resource?.oneofKind) {
    case 'local':
      return route === 'local' && selection.resource.local.capabilityContract === capabilityContract;
    case 'cloud':
      return route === 'cloud' && selection.resource.cloud.target.capabilityContract === capabilityContract;
    default:
      return false;
  }
}

export async function hasParentosAIConfigCapability(
  capabilityContract: ParentosAIConfigCapabilityContract,
): Promise<boolean> {
  const result = await readParentosAIConfig();
  if (result.state !== 'ready') return false;
  const route = result.snapshot.config?.capabilities.find(
    (capability) => capability.capabilityContract === capabilityContract,
  )?.route.oneofKind;
  // The user chooses the Local or Cloud route. Effective readiness belongs to
  // Runtime admission and must not be collapsed into an App-level
  // "unconfigured".
  return route === 'local' || route === 'cloud';
}

// Runtime composes the committed route; ParentOS never forces Local or
// rejects Cloud before the protected call.
// @nimi-authority: rule.parentos.shell.r010
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
  const intent = result.state === 'ready'
    ? result.snapshot.config?.capabilities.find(
      (capability) => capability.capabilityContract === capabilityContract,
    )
    : undefined;
  if (!intent) {
    throw Object.assign(
      new Error(`ParentOS requires a Nimi-owned ${capabilityContract} AIConfig intent.`),
      { reasonCode: 'parentos-ai-capability-not-configured' },
    ) as ParentosAIConfigCapabilityError;
  }
  if (intent.route.oneofKind !== 'local' && intent.route.oneofKind !== 'cloud') {
    throw Object.assign(
      new Error(`ParentOS requires a canonical ${capabilityContract} AIConfig route.`),
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
