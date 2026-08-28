import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('ParentOS Electron combines the fixed local-app carrier with exact app-owned commands', async () => {
  const main = await readProjectFile('src-electron/main.ts');
  const preload = await readProjectFile('src-electron/preload.cts');

  assert.match(main, /\bregisterNimiElectronAppBridge\b/u);
  assert.match(main, /--nimi-dev-renderer-url=/u);
  assert.doesNotMatch(main, /\bonProtectedSessionFailure\b/u);
  assert.doesNotMatch(main, /\bcreateNimiElectronInstalledHost\b/u);
  assert.doesNotMatch(main, /\bNIMI_INSTALLED_NIMI_APP_STANDARD_SHELL_CAPABILITY_SET_ID\b/u);
  assert.match(main, /appCommandHandlers\s*:\s*createParentOSElectronCommandHandlers/u);
  assert.match(main, /createParentOSHostClient/u);
  assert.match(main, /app\.getPath\(\s*['"]appData['"]\s*\)/u);
  assert.doesNotMatch(main, /trustedRuntimeMetadataProvider|createParentOSElectronTrustedRuntimeMetadataProvider/u);
  assert.doesNotMatch(main, /additionalArguments|installed-app-launch-binding|LAUNCH_NONCE|releaseDescriptorRef/u);
  assert.doesNotMatch(main, /NIMI_APP_DURABLE_DATA_ROOT|NIMI_PARENTOS_ELECTRON_(?:DURABLE_DATA_ROOT|STANDARD_DATA_ROOT)/u);
  assert.doesNotMatch(main, /NIMI_PARENTOS_ELECTRON_REMOTE_DEBUGGING_PORT|remote-debugging-(?:address|port)/u);
  assert.doesNotMatch(main, /bundled-with-nimi/u);
  assert.doesNotMatch(main, /createNimiElectronFileAIConfigStore|standardDataRootBinding/u);
  assert.doesNotMatch(main, /commandPolicy\s*:/u);
  assert.doesNotMatch(main, /createElectronShellFileProtocolHost|localAssetProtocolHost|localAssetRoots/u);
  assert.match(main, /\bcontextIsolation\s*:\s*true\b/u);
  assert.match(main, /\bnodeIntegration\s*:\s*false\b/u);
  assert.match(main, /\bsandbox\s*:\s*true\b/u);
  assert.match(main, /\bsetWindowOpenHandler\b/u);
  assert.match(main, /\bwill-navigate\b/u);
  assert.match(main, /\bdid-fail-load\b/u);
  assert.match(main, /界面资源未能加载/u);
  assert.match(main, /rendererLoadFailureUrl/u);
  assert.match(main, /allowedRendererUrls:\s*\[rendererUrl\]/u, 'failure surface must not receive renderer host-command authority');

  assert.match(preload, /\binstallNimiElectronRuntimeBridge\b/u);
  assert.equal(existsSync(path.join(root, 'src-electron/runtime-auth.ts')), false);
  assert.equal(existsSync(path.join(root, 'src-electron/parentos-command-policy.ts')), false);
});

test('ParentOS Tauri exposes the local-app carrier and exact app-owned commands', async () => {
  const main = await readProjectFile('src-tauri/src/main.rs');

  assert.match(main, /RuntimeBridgeLocalAppHost::platform_default\(\)/u);
  assert.match(main, /nimi_shell_tauri_local_app_standard_shell_handler!\[/u);
  assert.match(main, /app\.path\(\)\.app_data_dir\(\)/u);
  assert.doesNotMatch(main, /installed_app_launch|append_invoke_initialization_script/u);
  assert.doesNotMatch(main, /load_dotenv_files|NIMI_APP_LAUNCH_NONCE|bundled-with-nimi/u);
  assert.doesNotMatch(main, /runtime_bridge_(?:unary|stream_open|stream_close)|ai_config_(?:get|set)/u);
  assert.doesNotMatch(main, /data_path_resolve|storage_(?:read_json|write_json|remove_json)/u);
  assert.match(main, /sqlite::db_init/u);
  assert.match(main, /sqlite::queries::create_family/u);
  assert.match(main, /journal_audio::save_journal_voice_audio/u);
  assert.match(main, /report_export::report_export_write_save_target/u);
  assert.doesNotMatch(main, /allow_data_root_in_asset_scope/u);
});

test('all renderer-to-native media writes share bounded partition enforcement', async () => {
  const boundedPayloadModules = [
    'src-tauri/src/journal_audio.rs',
    'src-tauri/src/journal_photo.rs',
    'src-tauri/src/child_avatar.rs',
    'src-tauri/src/attachment_store.rs',
    'src-tauri/src/orthodontic_photos.rs',
  ];
  for (const modulePath of boundedPayloadModules) {
    const source = await readProjectFile(modulePath);
    assert.match(source, /decode_bounded_base64/u, `${modulePath} must bound payloads before decode`);
  }
  for (const modulePath of boundedPayloadModules.slice(0, 4)) {
    const source = await readProjectFile(modulePath);
    assert.match(source, /write_media_file/u, `${modulePath} must enforce the aggregate partition quota`);
  }
  const photos = await readProjectFile('src-tauri/src/photos/mod.rs');
  assert.match(photos, /write_media_file/u);

  const boundary = await readProjectFile('src-tauri/src/media_storage.rs');
  assert.match(boundary, /MAX_MEDIA_PARTITION_BYTES/u);
  assert.match(boundary, /NamedTempFile::new_in/u);
  assert.match(boundary, /file_type\(\)\.is_symlink\(\)/u);
});

test('ParentOS manifest declares the standalone App Access contract', async () => {
  const manifest = await readProjectFile('nimi.app.yaml');
  assert.match(manifest, /app_id:\s+nimi\.parentos/u);
  assert.match(manifest, /profile:\s+standalone/u);
  assert.match(manifest, /manifest_role:\s+submitted-input/u);
  assert.match(manifest, /app_access:\s*\n\s+-\s+runtime\.consume/u);
  assert.match(manifest, /ai_config_ui:\s*\n\s+allowed_routes:\s*\n\s+-\s+local/u);
  assert.doesNotMatch(manifest, /allowed_routes:[\s\S]*?-\s+cloud/u);
  assert.match(manifest, /local_development:\s+electron:/u);
  assert.match(manifest, /renderer_origin:\s+http:\/\/127\.0\.0\.1:1426/u);
  assert.doesNotMatch(manifest, /permissions|execution_profile_ref|schema_version|declared_nimi_api_scopes|app-local-drafts/u);
});

test('ParentOS package scripts use the canonical Electron local-development entries', async () => {
  const packageJson = JSON.parse(await readProjectFile('package.json'));
  assert.equal(packageJson.scripts.dev, 'nimi-app dev --shell electron');
  assert.equal(packageJson.scripts['dev:shell'], 'nimi-app dev');
  assert.equal(packageJson.scripts['dev:renderer'], 'vite --host 127.0.0.1 --port 1426 --strictPort');
  assert.equal(packageJson.scripts['dev:electron'], 'nimi-app dev --shell electron');
  assert.equal(packageJson.scripts['dev:tauri'], undefined);
});

test('Electron sidecar starts lazily for app-owned commands and preserves observability', async () => {
  const hostClient = await readProjectFile('src-electron/parentos-host-client.ts');
  const main = await readProjectFile('src-electron/main.ts');
  assert.match(main, /createParentOSHostClient|parentos-host-client/u);
  assert.match(hostClient, /sidecar-start/u);
  assert.match(hostClient, /sidecar-ready/u);
  assert.match(hostClient, /\bresourcesPath\b/u);
});
