import {
  NIMI_STANDARD_SHELL_COMMANDS,
  type NimiStandardShellErrorCode,
} from '@nimiplatform/kit/shell/capabilities';
import type {
  NimiElectronHostCommandPolicy,
  NimiElectronHostCommandPolicyDecision,
} from '@nimiplatform/kit/shell/electron/main';

const allowedStandardCommands = new Set<string>([
  NIMI_STANDARD_SHELL_COMMANDS['runtime.unary'],
  NIMI_STANDARD_SHELL_COMMANDS['runtime.streamOpen'],
  NIMI_STANDARD_SHELL_COMMANDS['runtime.streamClose'],
  NIMI_STANDARD_SHELL_COMMANDS['runtime-lifecycle.status'],
  NIMI_STANDARD_SHELL_COMMANDS['oauth.openExternalUrl'],
  NIMI_STANDARD_SHELL_COMMANDS['oauth.listenForCode'],
  NIMI_STANDARD_SHELL_COMMANDS['shell-ui.confirmDialog'],
  NIMI_STANDARD_SHELL_COMMANDS['shell-ui.startWindowDrag'],
  NIMI_STANDARD_SHELL_COMMANDS['shell-ui.focusMainWindow'],
  NIMI_STANDARD_SHELL_COMMANDS['data.pathResolve'],
  NIMI_STANDARD_SHELL_COMMANDS['storage.readJson'],
  NIMI_STANDARD_SHELL_COMMANDS['storage.writeJson'],
  NIMI_STANDARD_SHELL_COMMANDS['storage.removeJson'],
  NIMI_STANDARD_SHELL_COMMANDS['config.get'],
  NIMI_STANDARD_SHELL_COMMANDS['local-assets.resolveUrl'],
  NIMI_STANDARD_SHELL_COMMANDS['local-agent.identity'],
  NIMI_STANDARD_SHELL_COMMANDS['ai-config.get'],
  NIMI_STANDARD_SHELL_COMMANDS['ai-config.set'],
  NIMI_STANDARD_SHELL_COMMANDS['file-dialog.open'],
  NIMI_STANDARD_SHELL_COMMANDS['file-reveal.reveal'],
  NIMI_STANDARD_SHELL_COMMANDS['export.saveFile'],
  NIMI_STANDARD_SHELL_COMMANDS['artifacts.write'],
]);

const deniedCode: NimiStandardShellErrorCode = 'forbidden-renderer-access';

export const parentosElectronHostCommandPolicy: NimiElectronHostCommandPolicy = (input): NimiElectronHostCommandPolicyDecision => {
  if (input.commandKind === 'app-domain') {
    return { allow: true };
  }
  if (input.commandKind === 'standard' && allowedStandardCommands.has(input.command)) {
    return { allow: true };
  }
  return {
    allow: false,
    code: deniedCode,
    reasonCode: 'parentos-electron-command-forbidden',
    actionHint: 'use_parentos_runtime_broker_or_host_owned_surface',
    details: { command: input.command },
  };
};
