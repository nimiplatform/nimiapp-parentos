import { getPlatformClient } from '@nimiplatform/sdk';
import {
  createRuntimeRouteModelPickerProviderCache,
  type RouteModelPickerDataProvider,
  type RuntimeRouteModelPickerClient,
} from '@nimiplatform/kit/features/model-picker/runtime';
import { normalizeParentosRuntimeRouteCapability } from '../../infra/parentos-runtime-route-options.js';

export function createParentosRuntimeModelPickerProviderCache(): (
  capability: string,
) => RouteModelPickerDataProvider | null {
  const resolveRuntimeRouteModelPickerProvider = createRuntimeRouteModelPickerProviderCache({
    getClient: async () => getPlatformClient() as RuntimeRouteModelPickerClient,
    unavailableMessage: 'ParentOS runtime route catalog is unavailable.',
  });

  return (capability: string): RouteModelPickerDataProvider | null => {
    const normalized = String(capability || '').trim();
    if (!normalized) {
      return null;
    }
    return resolveRuntimeRouteModelPickerProvider(
      normalizeParentosRuntimeRouteCapability(normalized),
    );
  };
}

const resolveParentosRuntimeModelPickerProvider = createParentosRuntimeModelPickerProviderCache();

export function getParentosRouteModelPickerProvider(capability: string): RouteModelPickerDataProvider | null {
  return resolveParentosRuntimeModelPickerProvider(capability);
}
