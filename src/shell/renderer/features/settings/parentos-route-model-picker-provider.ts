import {
  createRuntimeRouteModelPickerProviderCache,
  type RouteModelPickerDataProvider,
} from '@nimiplatform/kit/features/model-picker/runtime';
import {
  createNimiRuntimeRouteOptionsHostDeps,
  listNimiRuntimeRouteOptionsWithHost,
} from '@nimiplatform/sdk/runtime';
import { normalizeParentosRuntimeRouteCapability } from '../../infra/parentos-runtime-route-options.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';

export function createParentosRuntimeModelPickerProviderCache(): (
  capability: string,
) => RouteModelPickerDataProvider | null {
  const resolveRuntimeRouteModelPickerProvider = createRuntimeRouteModelPickerProviderCache({
    loadOptions: async (input) => {
      const client = getParentOSNimiClient();
      return listNimiRuntimeRouteOptionsWithHost(
        input,
        createNimiRuntimeRouteOptionsHostDeps(client.runtime),
      );
    },
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
