import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const ELECTRON_NATIVE_APP_COMMANDS = new Set([
  'pick_image_files_as_base64',
  'report_export_create_save_grant',
]);
const INTERNAL_SIDECAR_COMMANDS = new Set([
  'dropped_file_read_image_files_as_base64',
  'report_export_register_save_grant',
]);

function readRepoFile(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function extractTsCommandList(source) {
  const match = source.match(/const\s+PARENTOS_SIDECAR_COMMANDS\s*=\s*\[([\s\S]*?)\]\s+as\s+const/u);
  assert.ok(match, 'PARENTOS_SIDECAR_COMMANDS must be a literal as const array');
  return [...match[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1]).sort();
}

function extractRustImplementedCommands(source) {
  const match = source.match(/match\s+command\s*\{([\s\S]*?)_\s*=>\s*Err/u);
  assert.ok(match, 'Rust sidecar dispatch must match on command before the unknown-command arm');
  return [...match[1].matchAll(/"([^"]+)"\s*=>/gu)].map((entry) => entry[1]).sort();
}

function extractTauriRegisteredCommands(source) {
  const match = source.match(/nimi_shell_tauri_local_app_standard_shell_handler!\[([\s\S]*?)\]\s*,?\s*\)/u);
  assert.ok(match, 'Tauri main must use the local-app standard-shell macro with a literal app-domain command list');
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n\r]*/u, '').trim().replace(/,$/u, ''))
    .filter(Boolean)
    .map((path) => path.split('::').at(-1))
    .sort();
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
}

test('app-domain implementations stay complete but unregistered before protected admission', () => {
  const electronHandlers = readRepoFile('src-electron/parentos-command-handlers.ts');
  const electronMain = readRepoFile('src-electron/main.ts');
  const rustSidecar = readRepoFile('src-tauri/src/sidecar_commands.rs');
  const tauriMain = readRepoFile('src-tauri/src/main.rs');

  const tauriAppDomain = extractTauriRegisteredCommands(tauriMain);
  const directElectronSidecar = extractTsCommandList(electronHandlers);
  const rustImplemented = extractRustImplementedCommands(rustSidecar);
  const rustImplementedSet = new Set(rustImplemented);
  assert.deepEqual(tauriAppDomain, [], 'Tauri must not register app-domain commands before ParentOS operation admission');
  assert.doesNotMatch(
    electronMain,
    /commandHandlers\s*:|createParentOSElectronCommandHandlers/u,
    'Electron must not register the dormant app-domain handlers before admission',
  );
  assert.deepEqual(
    directElectronSidecar.filter((command) => !rustImplementedSet.has(command)),
    [],
    'dormant Electron app-domain implementations must still exist in the Rust sidecar',
  );

  for (const command of ELECTRON_NATIVE_APP_COMMANDS) {
    assert.match(electronHandlers, new RegExp(`${command}\\s*:`), `Electron must implement native command ${command}`);
    assert.ok(!tauriAppDomain.includes(command), `native command ${command} must remain unregistered before admission`);
    assert.ok(!directElectronSidecar.includes(command), `native command ${command} must not be direct sidecar passthrough`);
  }
  for (const internal of INTERNAL_SIDECAR_COMMANDS) {
    assert.ok(rustImplementedSet.has(internal), `Rust sidecar must implement internal command ${internal}`);
    assert.ok(!directElectronSidecar.includes(internal), `internal command ${internal} must not be renderer-exposed`);
  }

  const expectedRustRendererCommands = rustImplemented.filter((command) => !INTERNAL_SIDECAR_COMMANDS.has(command));
  assertSameSet(
    directElectronSidecar,
    expectedRustRendererCommands,
    'dormant Electron and Rust sidecar app-domain implementations must not drift',
  );
});
