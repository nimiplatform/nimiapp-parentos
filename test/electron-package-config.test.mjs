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

test('Electron package evidence is written to the shell refactor acceptance root', async () => {
  const packageScript = await readFile('scripts/package-electron.mjs', 'utf8');
  const warningGate = await readFile('scripts/check-electron-builder-warnings.mjs', 'utf8');

  assert.match(
    packageScript,
    /['"]\.nimi['"][\s\S]*['"]local['"][\s\S]*['"]acceptance['"][\s\S]*['"]20260707-tauri-electron-shell-refactory['"]/u,
    'package-electron must write package-electron.json beside the shell refactor acceptance evidence',
  );
  assert.match(
    warningGate,
    /['"]\.nimi['"][\s\S]*['"]local['"][\s\S]*['"]acceptance['"][\s\S]*['"]20260707-tauri-electron-shell-refactory['"]/u,
    'builder warning gate must read the same shell refactor acceptance log',
  );
  assert.doesNotMatch(
    packageScript,
    /20260708-build-warning-cleanup/u,
    'package evidence must not be stranded under the old build-warning cleanup root',
  );
  assert.doesNotMatch(
    warningGate,
    /20260708-build-warning-cleanup/u,
    'builder warning evidence must not be stranded under the old build-warning cleanup root',
  );
});
