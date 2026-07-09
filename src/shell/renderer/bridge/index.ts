// PO-SHELL-008 / spec K-ACCSVC-008: ParentOS does not own access/refresh
// token custody. Legacy auth-session IPC, daemon lifecycle/config writes, and
// raw runtime defaults are kept out of this renderer bridge.
export {
  BridgeError,
  createInstalledNimiAppStandardShellSurface,
  focusMainWindow,
  hasElectronRuntime,
  hasNimiShellRuntime,
  hasTauriRuntime,
  readInstalledNimiAppLaunchBinding,
} from '@nimiplatform/kit/shell/renderer/bridge';
export type {
  InstalledNimiAppLaunchBinding,
  InstalledNimiAppStandardShellSurface,
  InstalledNimiAppStorageRemoveJsonResult,
  JsonValue,
  JsonObject,
  JsonPrimitive,
} from '@nimiplatform/kit/shell/renderer/bridge';
