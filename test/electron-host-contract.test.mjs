import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('ParentOS Electron uses the fixed app host without portable authority', async () => {
  const main = await readProjectFile('src-electron/main.ts');
  const preload = await readProjectFile('src-electron/preload.cts');

  assert.match(main, /\bregisterNimiElectronAppBridge\b/u);
  assert.match(main, /--nimi-dev-renderer-url=/u);
  assert.doesNotMatch(main, /\bcreateNimiElectronInstalledHost\b/u);
  assert.doesNotMatch(main, /\bNIMI_INSTALLED_NIMI_APP_STANDARD_SHELL_CAPABILITY_SET_ID\b/u);
  assert.doesNotMatch(main, /\bcommandHandlers\s*:|createParentOSElectronCommandHandlers/u);
  assert.match(main, /app\.getPath\(\s*['"]appData['"]\s*\)/u);
  assert.doesNotMatch(main, /trustedRuntimeMetadataProvider|createParentOSElectronTrustedRuntimeMetadataProvider/u);
  assert.doesNotMatch(main, /additionalArguments|installed-app-launch-binding|LAUNCH_NONCE|releaseDescriptorRef/u);
  assert.doesNotMatch(main, /NIMI_APP_DURABLE_DATA_ROOT|NIMI_PARENTOS_ELECTRON_(?:DURABLE_DATA_ROOT|STANDARD_DATA_ROOT)/u);
  assert.doesNotMatch(main, /bundled-with-nimi/u);
  assert.doesNotMatch(main, /createNimiElectronFileAIConfigStore|standardDataRootBinding/u);
  assert.doesNotMatch(main, /commandPolicy\s*:/u);
  assert.doesNotMatch(main, /createElectronShellFileProtocolHost|localAssetProtocolHost|localAssetRoots/u);
  assert.match(main, /\bcontextIsolation\s*:\s*true\b/u);
  assert.match(main, /\bnodeIntegration\s*:\s*false\b/u);
  assert.match(main, /\bsandbox\s*:\s*true\b/u);
  assert.match(main, /\bsetWindowOpenHandler\b/u);
  assert.match(main, /\bwill-navigate\b/u);

  assert.match(preload, /\binstallNimiElectronRuntimeBridge\b/u);
  assert.equal(existsSync(path.join(root, 'src-electron/runtime-auth.ts')), false);
  assert.equal(existsSync(path.join(root, 'src-electron/parentos-command-policy.ts')), false);
});

test('ParentOS Tauri exposes only the local-app carrier before operation admission', async () => {
  const main = await readProjectFile('src-tauri/src/main.rs');

  assert.match(main, /RuntimeBridgeLocalAppHost::platform_default\(\)/u);
  assert.match(main, /nimi_shell_tauri_local_app_standard_shell_handler!\[\]/u);
  assert.match(main, /app\.path\(\)\.app_data_dir\(\)/u);
  assert.doesNotMatch(main, /installed_app_launch|append_invoke_initialization_script/u);
  assert.doesNotMatch(main, /load_dotenv_files|NIMI_APP_LAUNCH_NONCE|bundled-with-nimi/u);
  assert.doesNotMatch(main, /runtime_bridge_(?:unary|stream_open|stream_close)|ai_config_(?:get|set)/u);
  assert.doesNotMatch(main, /data_path_resolve|storage_(?:read_json|write_json|remove_json)/u);
  assert.doesNotMatch(main, /sqlite::|journal_audio::|report_export::/u);
  assert.doesNotMatch(main, /allow_data_root_in_asset_scope/u);
});

test('ParentOS manifest opts into the admitted Electron local-development profile', async () => {
  const manifest = await readProjectFile('nimi.app.yaml');
  assert.match(manifest, /local_development:\s+electron:/u);
  assert.match(manifest, /renderer_origin:\s+http:\/\/127\.0\.0\.1:1426/u);
  assert.match(manifest, /execution_profile_ref:\s+opaque:windows-native-electron-development-v1/u);
});

test('ParentOS package scripts use the canonical Electron entry and preserve explicit Tauri access', async () => {
  const packageJson = JSON.parse(await readProjectFile('package.json'));
  assert.equal(packageJson.scripts.dev, 'nimi-app dev --shell electron');
  assert.equal(packageJson.scripts['dev:shell'], 'nimi-app dev');
  assert.equal(packageJson.scripts['dev:renderer'], 'vite --host 127.0.0.1 --port 1426 --strictPort');
  assert.equal(packageJson.scripts['dev:electron'], 'nimi-app dev --shell electron');
  assert.equal(packageJson.scripts['dev:tauri'], 'nimi-app dev --shell tauri');
});

test('Electron sidecar remains dormant until app-domain admission while preserving observability', async () => {
  const hostClient = await readProjectFile('src-electron/parentos-host-client.ts');
  const main = await readProjectFile('src-electron/main.ts');
  assert.doesNotMatch(main, /createParentOSHostClient|parentos-host-client/u);
  assert.match(hostClient, /sidecar-start/u);
  assert.match(hostClient, /sidecar-ready/u);
  assert.match(hostClient, /\bresourcesPath\b/u);
});
