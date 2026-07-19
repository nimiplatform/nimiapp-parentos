import { hasElectronRuntime } from './bridge/index.js';

export function shouldUseParentOSHashRouter(input: {
  readonly electronRuntime: boolean;
  readonly locationProtocol: string;
} = {
  electronRuntime: hasElectronRuntime(),
  locationProtocol: globalThis.location?.protocol ?? '',
}): boolean {
  return input.electronRuntime && input.locationProtocol === 'file:';
}
