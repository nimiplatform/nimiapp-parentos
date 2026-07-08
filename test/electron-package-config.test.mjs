import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import YAML from 'yaml';

test('Electron package metadata and staging-relative paths are configured', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const builderConfig = YAML.parse(await readFile('electron-builder.parentos.yml', 'utf8'));

  assert.equal(packageJson.description, 'AI-driven child growth operating system for ParentOS desktop.');
  assert.equal(packageJson.author, 'Nimi Platform');
  assert.equal(builderConfig.win.icon, '../../src-tauri/icons/icon.ico');
  assert.equal(builderConfig.directories.output, '../../dist-electron');
  assert.equal(builderConfig.extraResources[0].from, '../../build/electron-extra-resources/bin/parentos_host.exe');
});
