// PO-SHELL-008 / spec K-ACCSVC-008: ParentOS does not own access/refresh
// token custody. Legacy auth-session IPC, daemon lifecycle/config writes, and
// raw runtime defaults are kept out of this renderer bridge.
export {
  BridgeError,
  createNimiLocalAppStandardShellSurface,
  focusMainWindow,
  hasElectronRuntime,
  hasNimiShellRuntime,
  hasTauriRuntime,
} from '@nimiplatform/kit/shell/renderer/bridge';
export type {
  NimiLocalAppStandardShellSurface,
  NimiLocalAppStorageRemoveResult,
  JsonValue,
  JsonObject,
  JsonPrimitive,
} from '@nimiplatform/kit/shell/renderer/bridge';
