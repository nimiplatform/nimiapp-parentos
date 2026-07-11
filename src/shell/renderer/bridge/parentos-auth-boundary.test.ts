import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

describe('ParentOS installed app authority hardcut', () => {
  const bridgeSource = read('src/shell/renderer/bridge/index.ts');
  const bootstrapSource = read('src/shell/renderer/infra/parentos-bootstrap.ts');
  const settingsSource = read('src/shell/renderer/features/settings/settings-page.tsx');
  const electronMainSource = read('src-electron/main.ts');
  const tauriMainSource = read('src-tauri/src/main.rs');

  it('keeps the canonical submitted app identity', () => {
    const manifestPath = join(root, 'nimi.app.yaml');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readFileSync(manifestPath, 'utf8');
    expect(manifest).toContain('app_id: nimi.parentos');
    expect(manifest).toContain('manifest_role: submitted-input');
    expect(manifest).toContain('declared_nimi_api_scopes');
  });

  it('constructs only the artifact installed bootstrap in renderer code', () => {
    expect(bridgeSource).toContain('createInstalledNimiAppStandardShellSurface');
    expect(bridgeSource).not.toContain('readInstalledNimiAppLaunchBinding');
    expect(bridgeSource).not.toContain('InstalledNimiAppLaunchBinding');
    expect(bootstrapSource).toContain('createInstalledNimiAppBootstrap({ standardShell })');
    expect(bootstrapSource).toContain('parentos-protected-operation-set-not-admitted');
    expect(bootstrapSource).not.toMatch(/\bcreateNimiClient\b|\bnew Runtime\b|readInstalledNimiAppLaunchBinding/);
    expect(bootstrapSource).not.toMatch(/getAccountSessionStatus|accountCaller|realmBaseUrl|releaseDescriptorRef/);
  });

  it('uses native installed hosts without portable authority inputs', () => {
    expect(electronMainSource).toContain('registerNimiElectronAppBridge');
    expect(electronMainSource).toContain('--nimi-dev-renderer-url=');
    expect(electronMainSource).toContain("app.getPath('appData')");
    expect(electronMainSource).not.toMatch(/trustedRuntimeMetadataProvider|additionalArguments|installed-app-launch-binding/);
    expect(electronMainSource).not.toMatch(/commandHandlers\s*:|createElectronShellFileProtocolHost/);
    expect(electronMainSource).not.toMatch(/NIMI_APP_(?:LAUNCH_NONCE|DURABLE_DATA_ROOT|CACHE_ROOT|TEMP_ROOT)/);
    expect(existsSync(join(root, 'src-electron/runtime-auth.ts'))).toBe(false);
    expect(existsSync(join(root, 'src-electron/parentos-command-policy.ts'))).toBe(false);

    expect(tauriMainSource).toContain('RuntimeBridgeAppHost::platform_default()');
    expect(tauriMainSource).toContain('nimi_shell_tauri_installed_app_standard_shell_handler![]');
    expect(tauriMainSource).toContain('app.path().app_data_dir()');
    expect(tauriMainSource).not.toMatch(/installed_app_launch|append_invoke_initialization_script/);
    expect(tauriMainSource).not.toMatch(/runtime_bridge_(?:unary|stream_open|stream_close)|ai_config_(?:get|set)/);
    expect(tauriMainSource).not.toMatch(/sqlite::|allow_data_root_in_asset_scope/);
  });

  it('removes app-owned development launchers', () => {
    expect(existsSync(join(root, 'scripts/run-electron-dev.mjs'))).toBe(false);
    expect(existsSync(join(root, 'scripts/run-tauri-dev.mjs'))).toBe(false);
  });

  it('does not expose app-owned account control or daemon configuration', () => {
    expect(existsSync(join(root, 'src/shell/renderer/features/auth/parentos-auth-adapter.ts'))).toBe(false);
    expect(settingsSource).not.toMatch(/logoutParentOSRuntimeAccount|clearAuthSession/);
    expect(bridgeSource).not.toMatch(/startDaemon|stopDaemon|restartDaemon|getDaemonConfig|setDaemonConfig/);
    expect(bridgeSource).not.toMatch(/oauthListenForCode|openExternalUrl|parentosTauriOAuthBridge/);
  });
});
