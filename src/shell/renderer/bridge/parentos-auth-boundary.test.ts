import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ParentOS developer app auth bridge boundary', () => {
  const bridgeSource = readFileSync(join(process.cwd(), 'src/shell/renderer/bridge/index.ts'), 'utf8');
  const defaultsSource = readFileSync(
    join(process.cwd(), 'src/shell/renderer/bridge/parentos-runtime-defaults.ts'),
    'utf8',
  );
  const tauriMainSource = readFileSync(join(process.cwd(), 'src-tauri/src/main.rs'), 'utf8');

  it('does not expose daemon lifecycle or developer-registration config writers', () => {
    expect(bridgeSource).not.toMatch(/startDaemon|stopDaemon|restartDaemon|getDaemonConfig|setDaemonConfig/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_start/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_stop/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_restart/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_config_get/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge::runtime_bridge_config_set/);
  });

  it('does not expose full RuntimeDefaults or token-bearing OAuth surfaces', () => {
    expect(bridgeSource).not.toContain('  getRuntimeDefaults,');
    expect(bridgeSource).not.toContain('parseRuntimeDefaults');
    expect(bridgeSource).not.toContain('  RuntimeDefaults,');
    expect(bridgeSource).not.toContain('  RealmDefaults,');
    expect(bridgeSource).not.toContain('  RuntimeExecutionDefaults,');
    expect(defaultsSource).not.toContain('getRuntimeDefaults');
    expect(defaultsSource).not.toContain('...shared');
    expect(tauriMainSource).not.toMatch(/runtime_defaults::runtime_defaults|defaults::runtime_defaults/);
    expect(tauriMainSource).not.toContain('oauth_commands::oauth_token_exchange');
  });

  it('uses Kit standard code-only OAuth bridge rather than an app-local or removed Tauri bridge factory', () => {
    expect(bridgeSource).toContain('createStandardShellOAuthCodeBridge');
    expect(bridgeSource).not.toContain('createTauriOAuthCodeBridge');
    expect(bridgeSource).not.toContain('createStandardShellOAuthBridge');
  });

  it('registers standard shell capabilities and shell-ui aliases through Kit', () => {
    expect(tauriMainSource).toContain('use nimi_shell_tauri::capabilities::{');
    expect(tauriMainSource).toContain('data');
    expect(tauriMainSource).toContain('storage');
    expect(tauriMainSource).toContain('oauth');
    expect(tauriMainSource).toContain('runtime');
    expect(tauriMainSource).toContain('session_logging');
    expect(tauriMainSource).toContain('data::data_path_resolve');
    expect(tauriMainSource).toContain('storage::storage_read_json');
    expect(tauriMainSource).toContain('storage::storage_write_json');
    expect(tauriMainSource).toContain('storage::storage_remove_json');
    expect(tauriMainSource).toContain('oauth::open_external_url');
    expect(tauriMainSource).toContain('oauth::oauth_listen_for_code');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_unary');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_stream_open');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_stream_close');
    expect(tauriMainSource).toContain('runtime::runtime_bridge_status');
    expect(tauriMainSource).toContain('confirm_dialog');
    expect(tauriMainSource).toContain('start_window_drag');
    expect(tauriMainSource).toContain('focus_main_window');
    expect(tauriMainSource).not.toContain('use nimi_shell_tauri::oauth_commands');
    expect(tauriMainSource).not.toContain('use nimi_shell_tauri::runtime_bridge');
  });
});
