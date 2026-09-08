import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const ELECTRON_NATIVE_APP_COMMANDS = new Set([
  'pick_image_files_as_base64',
  'report_export_create_save_target',
]);
// Data transfer dialogs are owned by Electron, not the Rust sidecar.
const ELECTRON_ONLY_NATIVE_APP_COMMANDS = new Set([
  'data_transfer_write_export_file',
  'data_transfer_read_import_file',
]);
const INTERNAL_SIDECAR_COMMANDS = new Set([
  'dropped_file_read_image_files_as_base64',
  'report_export_register_save_target',
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

function assertSameSet(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
}

test('Electron and Rust expose the exact app-owned command surface', () => {
  const electronHandlers = readRepoFile('src-electron/parentos-command-handlers.ts');
  const electronMain = readRepoFile('src-electron/main.ts');
  const rustSidecar = readRepoFile('src-tauri/src/sidecar_commands.rs');
  const directElectronSidecar = extractTsCommandList(electronHandlers);
  const rustImplemented = extractRustImplementedCommands(rustSidecar);
  const rustImplementedSet = new Set(rustImplemented);
  assert.match(
    electronMain,
    /appCommandHandlers\s*:\s*createParentOSElectronCommandHandlers/u,
    'Electron must register the exact app-owned command map',
  );
  assert.deepEqual(
    directElectronSidecar.filter((command) => !rustImplementedSet.has(command)),
    [],
    'Electron app-domain passthrough commands must exist in the Rust sidecar',
  );

  for (const command of ELECTRON_NATIVE_APP_COMMANDS) {
    assert.match(electronHandlers, new RegExp(`${command}\\s*:`), `Electron must implement native command ${command}`);
    assert.ok(!directElectronSidecar.includes(command), `native command ${command} must not be direct sidecar passthrough`);
  }
  for (const command of ELECTRON_ONLY_NATIVE_APP_COMMANDS) {
    assert.match(electronHandlers, new RegExp(`${command}\\s*:`), `Electron must implement native command ${command}`);
    assert.ok(!directElectronSidecar.includes(command), `native command ${command} must not be direct sidecar passthrough`);
    assert.ok(!rustImplementedSet.has(command), `native command ${command} must not be implemented in the Rust sidecar`);
  }
  for (const internal of INTERNAL_SIDECAR_COMMANDS) {
    assert.ok(rustImplementedSet.has(internal), `Rust sidecar must implement internal command ${internal}`);
    assert.ok(!directElectronSidecar.includes(internal), `internal command ${internal} must not be renderer-exposed`);
  }

  const expectedRustRendererCommands = rustImplemented.filter((command) => !INTERNAL_SIDECAR_COMMANDS.has(command));
  assertSameSet(
    directElectronSidecar,
    expectedRustRendererCommands,
    'Electron and Rust sidecar app-domain implementations must not drift',
  );
});
