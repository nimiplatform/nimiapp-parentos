import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

describe('ParentOS local-app authority hardcut', () => {
  const bridgeSource = read('src/shell/renderer/bridge/index.ts');
  const bootstrapSource = read('src/shell/renderer/infra/parentos-bootstrap.ts');
  const settingsSource = read('src/shell/renderer/features/settings/settings-page.tsx');
  const electronMainSource = read('src-electron/main.ts');

  it('keeps the canonical submitted app identity', () => {
    const manifestPath = join(root, 'nimi.app.yaml');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readFileSync(manifestPath, 'utf8');
    expect(manifest).toContain('app_id: nimi.parentos');
    expect(manifest).toContain('manifest_role: submitted-input');
    expect(manifest).toContain('profile: standalone');
    expect(manifest).toContain('app_access:');
    expect(manifest).not.toMatch(/permissions|execution_profile_ref|declared_nimi_api_scopes/u);
  });

  it('hydrates app-owned data without constructing a protected Runtime client', () => {
    expect(bridgeSource).toContain('createNimiLocalAppStandardShellSurface');
    expect(bridgeSource).not.toContain('readInstalledNimiAppLaunchBinding');
    expect(bridgeSource).not.toContain('InstalledNimiAppLaunchBinding');
    expect(bootstrapSource).toContain('await dbInit(null, ADMITTED_REMINDER_RULE_IDS)');
    expect(bootstrapSource).toContain("authorityClass: 'app_owned_authority'");
    expect(bootstrapSource).not.toMatch(/\bcreateNimiClient\b|\bnew Runtime\b|readInstalledNimiAppLaunchBinding|createInstalledNimiAppBootstrap/);
    expect(bootstrapSource).not.toMatch(/createNimiAppRuntimePlatformClient|getAccountSessionStatus|accountCaller|realmBaseUrl|releaseDescriptorRef/);
  });

  it('registers exact app-owned commands beside native local-app carriers', () => {
    expect(electronMainSource).toContain('registerNimiElectronAppBridge');
    expect(electronMainSource).toContain('appCommandHandlers: createParentOSElectronCommandHandlers');
    expect(electronMainSource).toContain('createParentOSHostClient');
    expect(electronMainSource).toContain('--nimi-dev-renderer-url=');
    expect(electronMainSource).toContain("app.getPath('appData')");
    expect(electronMainSource).not.toMatch(/trustedRuntimeMetadataProvider|additionalArguments|installed-app-launch-binding/);
    expect(electronMainSource).not.toMatch(/createElectronShellFileProtocolHost|runtimeEndpoint/);
    expect(electronMainSource).not.toMatch(/NIMI_APP_(?:LAUNCH_NONCE|DURABLE_DATA_ROOT|CACHE_ROOT|TEMP_ROOT)/);
    expect(existsSync(join(root, 'src-electron/runtime-auth.ts'))).toBe(false);
    expect(existsSync(join(root, 'src-electron/parentos-command-policy.ts'))).toBe(false);

  });

  it('removes app-owned development launchers', () => {
    expect(existsSync(join(root, 'scripts/run-electron-dev.mjs'))).toBe(false);
    expect(existsSync(join(root, 'scripts/run-tauri-dev.mjs'))).toBe(false);
  });

  it('does not expose app-owned account control or daemon configuration', () => {
    expect(existsSync(join(root, 'src/shell/renderer/features/auth/parentos-auth-adapter.ts'))).toBe(false);
    expect(existsSync(join(root, 'src/shell/renderer/features/auth/parentos-login-page.tsx'))).toBe(false);
    expect(existsSync(join(root, 'src/shell/renderer/features/auth/nimi-login-background.tsx'))).toBe(false);
    expect(settingsSource).not.toMatch(/logoutParentOSRuntimeAccount|clearAuthSession/);
    expect(bootstrapSource).not.toMatch(/clearAuthSession|parentos-launch-page|parentos-launch-trigger/);
    expect(bridgeSource).not.toMatch(/startDaemon|stopDaemon|restartDaemon|getDaemonConfig|setDaemonConfig/);
    expect(bridgeSource).not.toMatch(/oauthListenForCode|openExternalUrl|parentosTauriOAuthBridge/);
  });
});
