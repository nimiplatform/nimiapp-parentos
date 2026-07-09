import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ParentOS installed app auth bridge boundary', () => {
  const bridgeSource = readFileSync(join(process.cwd(), 'src/shell/renderer/bridge/index.ts'), 'utf8');
  const aiConfigSource = readFileSync(
    join(process.cwd(), 'src/shell/renderer/features/settings/parentos-ai-config.ts'),
    'utf8',
  );
  const bootstrapSource = readFileSync(join(process.cwd(), 'src/shell/renderer/infra/parentos-bootstrap.ts'), 'utf8');
  const commandPolicySource = readFileSync(join(process.cwd(), 'src-electron/parentos-command-policy.ts'), 'utf8');
  const electronMainSource = readFileSync(join(process.cwd(), 'src-electron/main.ts'), 'utf8');
  const electronRuntimeAuthSource = readFileSync(join(process.cwd(), 'src-electron/runtime-auth.ts'), 'utf8');
  const electronDevRunnerSource = readFileSync(join(process.cwd(), 'scripts/run-electron-dev.mjs'), 'utf8');
  const tauriMainSource = readFileSync(join(process.cwd(), 'src-tauri/src/main.rs'), 'utf8');
  const tauriDevRunnerSource = readFileSync(join(process.cwd(), 'scripts/run-tauri-dev.mjs'), 'utf8');

  it('declares ParentOS as the same submitted installed app surface type as other Nimi apps', () => {
    const manifestPath = join(process.cwd(), 'nimi.app.yaml');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readFileSync(manifestPath, 'utf8');
    expect(manifest).toContain('app_id: nimi.parentos');
    expect(manifest).toContain('manifest_role: submitted-input');
    expect(manifest).toContain('declared_nimi_api_scopes');
  });

  it('does not expose daemon lifecycle or developer-registration config writers', () => {
    expect(bridgeSource).not.toMatch(/startDaemon|stopDaemon|restartDaemon|getDaemonConfig|setDaemonConfig/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_start/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_stop/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_restart/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_config_get/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_config_set/);
  });

  it('does not expose full RuntimeDefaults or token-bearing OAuth surfaces', () => {
    expect(bridgeSource).not.toMatch(/getParentOSRuntimeDefaults|getRuntimeDefaults|parseRuntimeDefaults/);
    expect(bridgeSource).not.toMatch(/oauthListenForCode|openExternalUrl|parentosTauriOAuthBridge/);
    expect(bootstrapSource).not.toContain('getParentOSRuntimeDefaults');
    expect(tauriMainSource).not.toMatch(/runtime_defaults::runtime_defaults|defaults::runtime_defaults/);
    expect(tauriMainSource).not.toMatch(/oauth::open_external_url|oauth::oauth_listen_for_code|oauth_commands::oauth_token_exchange/);
    expect(commandPolicySource).not.toMatch(/oauth\.openExternalUrl|oauth\.listenForCode|local-agent\.identity/);
  });

  it('uses host-owned installed launch binding instead of renderer-owned local developer identity', () => {
    expect(bridgeSource).toContain('readInstalledNimiAppLaunchBinding');
    expect(bootstrapSource).toContain('createInstalledNimiAppBootstrap');
    expect(bootstrapSource).toContain('readInstalledNimiAppLaunchBinding');
    expect(bootstrapSource).not.toMatch(/parentosRuntimeAccountCaller|LOCAL_DEVELOPER_APP|local-developer/);
    expect(electronRuntimeAuthSource).toContain('createNimiElectronInstalledAppRuntimeAccountTrustedMetadataProvider');
    expect(electronRuntimeAuthSource).toContain('createParentOSRendererLaunchBinding');
    expect(electronRuntimeAuthSource).toContain('NIMI_APP_LAUNCH_NONCE');
    expect(electronRuntimeAuthSource).toContain('NIMI_PARENTOS_ELECTRON_LAUNCH_NONCE');
    expect(electronRuntimeAuthSource).toContain('resolveElectronRuntimeDefaults');
    expect(electronRuntimeAuthSource).not.toMatch(/createNimiElectronRuntimeAccountTrustedMetadataProvider|LOCAL_DEVELOPER_APP|local-developer/);
    expect(electronMainSource).toContain('--nimi-installed-app-launch-binding=');
    expect(electronMainSource).toContain("capabilitySetRef: 'installed-nimi-app-standard-shell-v1'");
    expect(electronMainSource).toContain('ParentOS Electron requires host-bound standard app storage roots');
    expect(electronMainSource).not.toMatch(/app\.getPath\('userData'\).*installed-app-data/s);
    expect(electronDevRunnerSource).toContain('randomUUID');
    expect(electronDevRunnerSource).toContain('NIMI_APP_LAUNCH_NONCE');
    expect(electronDevRunnerSource).toContain('NIMI_PARENTOS_ELECTRON_LAUNCH_NONCE');
    expect(tauriMainSource).toContain('nimi_shell_tauri::installed_app_launch');
    expect(tauriMainSource).toContain('resolve_installed_nimi_app_launch_binding_from_env');
    expect(tauriMainSource).toContain('build_installed_nimi_app_launch_binding_script');
    expect(tauriMainSource).toContain('append_invoke_initialization_script');
    expect(tauriMainSource).toContain('DESKTOP_INSTALLED_APP_LAUNCH_HOST_ID: &str = "desktop-electron-installed-app-host"');
    expect(tauriMainSource).toContain('NIMI_PARENTOS_TAURI_LAUNCH_NONCE');
    expect(tauriDevRunnerSource).toContain('randomUUID');
    expect(tauriDevRunnerSource).toContain('NIMI_APP_LAUNCH_NONCE');
    expect(tauriDevRunnerSource).toContain('NIMI_PARENTOS_TAURI_LAUNCH_NONCE');
  });

  it('persists AI config only through the installed app standard shell surface', () => {
    expect(bridgeSource).toContain('createInstalledNimiAppStandardShellSurface');
    expect(aiConfigSource).toContain('createInstalledNimiAppStandardShellSurface');
    expect(aiConfigSource).toContain('standardShell.aiConfig.get');
    expect(aiConfigSource).toContain('standardShell.aiConfig.set');
    expect(aiConfigSource).not.toMatch(/getAppSetting|setAppSetting|PARENTOS_AI_CONFIG_SETTING_KEY/);
  });

  it('registers standard shell capabilities and shell-ui aliases through Kit', () => {
    expect(tauriMainSource).toContain('use nimi_shell_tauri::capabilities::{');
    expect(tauriMainSource).toContain('ai_config');
    expect(tauriMainSource).toContain('data');
    expect(tauriMainSource).toContain('storage');
    expect(tauriMainSource).toContain('runtime');
    expect(tauriMainSource).toContain('session_logging');
    expect(tauriMainSource).toContain('data::data_path_resolve');
    expect(tauriMainSource).toContain('storage::storage_read_json');
    expect(tauriMainSource).toContain('storage::storage_write_json');
    expect(tauriMainSource).toContain('storage::storage_remove_json');
    expect(tauriMainSource).toContain('ai_config::ai_config_get');
    expect(tauriMainSource).toContain('ai_config::ai_config_set');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_unary');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_stream_open');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_stream_close');
    expect(tauriMainSource).toContain('confirm_dialog');
    expect(tauriMainSource).toContain('start_window_drag');
    expect(tauriMainSource).toContain('focus_main_window');
    expect(tauriMainSource).not.toContain('runtime::runtime_bridge_status');
    expect(tauriMainSource).not.toContain('session_logging::log_renderer_event');
    expect(tauriMainSource).not.toContain('use nimi_shell_tauri::oauth_commands');
    expect(tauriMainSource).not.toContain('use nimi_shell_tauri::runtime_bridge');
    expect(commandPolicySource).toContain("NIMI_STANDARD_SHELL_COMMANDS['ai-config.get']");
    expect(commandPolicySource).toContain("NIMI_STANDARD_SHELL_COMMANDS['ai-config.set']");
    expect(commandPolicySource).not.toContain("NIMI_STANDARD_SHELL_COMMANDS['artifacts.write']");
  });
});
