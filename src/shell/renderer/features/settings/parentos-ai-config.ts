import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import {
  getParentOSNimiClient,
  hasParentOSNimiClient,
} from '../../infra/parentos-nimi-client.js';

export type ParentosPortableAIConfig = Awaited<ReturnType<NimiLocalAppClient['aiConfig']['get']>>;
export type ParentosAIConfigCapabilityContract = 'text.generate' | 'audio.transcribe';

export const PARENTOS_TEXT_CAPABILITY_CONTRACT = 'text.generate';
export const PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT = 'audio.transcribe';
export const PARENTOS_AI_CAPABILITY_CONTRACTS: readonly ParentosAIConfigCapabilityContract[] = [
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
  PARENTOS_AUDIO_TRANSCRIBE_CAPABILITY_CONTRACT,
];

function reasonCodeFromUnknownError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const reasonCode = typeof record.reasonCode === 'string' ? record.reasonCode.trim() : '';
  if (reasonCode) {
    return reasonCode;
  }
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  return code || 'runtime-service-unavailable';
}

// Local Apps receive a read-only projection of their platform-owned AIConfig.
// ParentOS never mutates route selection or capability declarations from the
// renderer; missing text.generate remains a typed, feature-local unavailable
// posture and does not participate in app-owned data bootstrap.
export async function readParentosAIConfig(): Promise<
  | { readonly state: 'ready'; readonly config: ParentosPortableAIConfig }
  | { readonly state: 'not-configured'; readonly reasonCode: 'ai-config-not-found' }
  | { readonly state: 'unavailable'; readonly reasonCode: string }
> {
  if (!hasParentOSNimiClient()) {
    return { state: 'unavailable', reasonCode: 'nimi-shell-runtime-bridge-unavailable' };
  }
  try {
    const config = await getParentOSNimiClient().aiConfig.get();
    return { state: 'ready', config };
  } catch (error) {
    const reasonCode = reasonCodeFromUnknownError(error);
    if (reasonCode === 'ai-config-not-found') {
      return { state: 'not-configured', reasonCode };
    }
    return { state: 'unavailable', reasonCode };
  }
}

export async function hasParentosAIConfigCapability(
  capabilityContract: ParentosAIConfigCapabilityContract,
): Promise<boolean> {
  const result = await readParentosAIConfig();
  return result.state === 'ready'
    && result.config.capabilities.some((capability) => (
      capability.capabilityContract === capabilityContract
      && capability.route.oneofKind === 'local'
    ));
}
