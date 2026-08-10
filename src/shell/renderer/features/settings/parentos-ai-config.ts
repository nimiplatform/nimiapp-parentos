import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import {
  getParentOSNimiClient,
  hasParentOSNimiClient,
} from '../../infra/parentos-nimi-client.js';

// App Access AIConfig is a portable capability intent: it carries no owner,
// account, connector-grant, or custody material. ParentOS declares a single
// local text-generation intent; route binding and connector selection remain
// with the platform. A cloud route without binding surfaces the bounded
// `ai-connector-grant-selection-required` outcome, which is legal.
export type ParentosAIConfigIntents = Parameters<NimiLocalAppClient['aiConfig']['overwrite']>[0];
export type ParentosPortableAIConfig = Awaited<ReturnType<NimiLocalAppClient['aiConfig']['get']>>;

export const PARENTOS_TEXT_CAPABILITY_CONTRACT = 'text.generate';

export function parentosDeclaredAIConfigIntents(): ParentosAIConfigIntents {
  return [
    {
      capabilityContract: PARENTOS_TEXT_CAPABILITY_CONTRACT,
      requiredFeatures: [],
      route: { oneofKind: 'local', local: {} },
    },
  ];
}

export type ParentosAIConfigDeclaration =
  | { readonly state: 'declared' }
  | { readonly state: 'unavailable'; readonly reasonCode: string };

function reasonCodeFromUnknownError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const reasonCode = typeof record.reasonCode === 'string' ? record.reasonCode.trim() : '';
  if (reasonCode) {
    return reasonCode;
  }
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  return code || 'runtime-service-unavailable';
}

// Declaring the app-owned intent is idempotent and side-effect bounded to the
// app scope; an existing declaration (any route) is never clobbered.
export async function ensureParentosAIConfigDeclared(): Promise<ParentosAIConfigDeclaration> {
  if (!hasParentOSNimiClient()) {
    return { state: 'unavailable', reasonCode: 'nimi-shell-runtime-bridge-unavailable' };
  }
  try {
    const client = getParentOSNimiClient();
    const current = await client.aiConfig.get();
    const declared = current.capabilities.some(
      (capability) => capability.capabilityContract === PARENTOS_TEXT_CAPABILITY_CONTRACT,
    );
    if (!declared) {
      await client.aiConfig.overwrite(parentosDeclaredAIConfigIntents());
    }
    return { state: 'declared' };
  } catch (error) {
    return { state: 'unavailable', reasonCode: reasonCodeFromUnknownError(error) };
  }
}

export async function readParentosAIConfig(): Promise<
  | { readonly state: 'ready'; readonly config: ParentosPortableAIConfig }
  | { readonly state: 'unavailable'; readonly reasonCode: string }
> {
  if (!hasParentOSNimiClient()) {
    return { state: 'unavailable', reasonCode: 'nimi-shell-runtime-bridge-unavailable' };
  }
  try {
    const config = await getParentOSNimiClient().aiConfig.get();
    return { state: 'ready', config };
  } catch (error) {
    return { state: 'unavailable', reasonCode: reasonCodeFromUnknownError(error) };
  }
}
