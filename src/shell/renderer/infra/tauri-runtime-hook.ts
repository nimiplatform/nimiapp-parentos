import {
  installNimiShellRuntimeBridge,
  type NimiShellRuntimeBridgeResult,
} from '@nimiplatform/kit/shell/renderer/bridge';

export function installParentosTauriRuntimeHook(): NimiShellRuntimeBridgeResult {
  return installNimiShellRuntimeBridge();
}
