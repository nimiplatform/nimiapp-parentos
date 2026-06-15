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
});
