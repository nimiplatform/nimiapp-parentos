// PO-SHELL-008 / spec K-ACCSVC-008: ParentOS does not own access/refresh
// token custody. Legacy auth-session IPC, daemon lifecycle/config writes, and
// raw runtime defaults are kept out of this renderer bridge.
export {
  hasTauriInvoke,
  invoke,
  invokeChecked,
  BridgeError,
  getDaemonStatus,
  createTauriOAuthCodeBridge,
  oauthListenForCode,
  openExternalUrl,
  focusMainWindow,
  parseRuntimeBridgeDaemonStatus,
  hasTauriRuntime,
  invokeTauri,
} from '@nimiplatform/kit/shell/renderer/bridge';
export type {
  RuntimeBridgeDaemonStatus,
  JsonValue,
  JsonObject,
  JsonPrimitive,
} from '@nimiplatform/kit/shell/renderer/bridge';

import { createTauriOAuthCodeBridge } from '@nimiplatform/kit/shell/renderer/bridge';
export const parentosTauriOAuthBridge = createTauriOAuthCodeBridge();

export type { ParentOSRuntimeDefaults } from './parentos-types.js';
export { getParentOSRuntimeDefaults } from './parentos-runtime-defaults.js';
