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

test('Electron package includes Kit native image runtime and writes hardcut evidence locally', async () => {
  const packageScript = await readFile('scripts/package-electron.mjs', 'utf8');
  const warningGate = await readFile('scripts/check-electron-builder-warnings.mjs', 'utf8');

  assert.match(
    packageScript,
    /['"]\.nimi['"][\s\S]*['"]local['"][\s\S]*['"]acceptance['"][\s\S]*['"]2026-07-10-third-party-installed-app-reference-hardcut['"]/u,
    'package-electron must keep hardcut package evidence local-only',
  );
  assert.match(
    warningGate,
    /['"]\.nimi['"][\s\S]*['"]local['"][\s\S]*['"]acceptance['"][\s\S]*['"]2026-07-10-third-party-installed-app-reference-hardcut['"]/u,
    'builder warning gate must read the same hardcut acceptance log',
  );
  for (const runtimePackage of ['sharp', '@img/colour', '@img/sharp-win32-x64', 'detect-libc', 'semver']) {
    assert.match(packageScript, new RegExp(`['"]${runtimePackage.replace('/', '\\/')}['"]`, 'u'));
  }
  assert.match(packageScript, /node_modules\/sharp\/dist\/index\.mjs/u);
  assert.match(packageScript, /node_modules\/@img\/sharp-win32-x64\/index\.cjs/u);
});
