// PO-SHELL-008 / spec K-ACCSVC-008: ParentOS does not own access/refresh
// token custody. Legacy auth-session IPC, daemon lifecycle/config writes, and
// raw runtime defaults are kept out of this renderer bridge.
export {
  hasTauriInvoke,
  invoke,
  invokeChecked,
  BridgeError,
  getDaemonStatus,
  oauthListenForCode,
  openExternalUrl,
  focusMainWindow,
  parseRuntimeBridgeDaemonStatus,
  hasElectronRuntime,
  hasTauriRuntime,
  invokeTauri,
} from '@nimiplatform/kit/shell/renderer/bridge';
export type {
  RuntimeBridgeDaemonStatus,
  JsonValue,
  JsonObject,
  JsonPrimitive,
} from '@nimiplatform/kit/shell/renderer/bridge';

import { createStandardShellOAuthCodeBridge } from '@nimiplatform/kit/shell/renderer/bridge';
export const parentosTauriOAuthBridge = createStandardShellOAuthCodeBridge();

export type { ParentOSRuntimeDefaults } from './parentos-types.js';
export { getParentOSRuntimeDefaults } from './parentos-runtime-defaults.js';
