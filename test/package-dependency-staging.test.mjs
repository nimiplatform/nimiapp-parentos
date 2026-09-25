import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { stageProductionDependencyInputs } from '../scripts/package-dependency-staging.mjs';

test('production staging keeps workspace overrides and frozen lock archive identities aligned', async () => {
  const workRoot = path.resolve('.nimi/local');
  await mkdir(workRoot, { recursive: true });
  const root = await mkdtemp(path.join(workRoot, 'package-staging-test-'));
  try {
    const appRoot = path.join(root, 'app');
    const staging = path.join(appRoot, '.nimi/local/build/electron-test/app');
    await mkdir(staging, { recursive: true });
    const sdk = 'file:../packages (candidate)/sdk.tgz';
    const kit = 'file:../packages (candidate)/kit.tar.gz';
    const overrides = { '@nimiplatform/sdk': sdk, '@nimiplatform/kit': kit };
    const lock = {
      lockfileVersion: '9.0', overrides,
      importers: { '.': { dependencies: { '@nimiplatform/kit': { specifier: kit, version: `${kit}(@nimiplatform/sdk@${sdk})` } } } },
      packages: {
        [`@nimiplatform/sdk@${sdk}`]: { resolution: { tarball: sdk, integrity: 'sha512-sdk' } },
        [`@nimiplatform/kit@${kit}`]: { resolution: { tarball: kit, integrity: 'sha512-kit' } },
      },
      snapshots: { [`@nimiplatform/kit@${kit}(@nimiplatform/sdk@${sdk})`]: { dependencies: { '@nimiplatform/sdk': sdk } } },
    };
    const originalLock = stringify(lock);
    const originalWorkspace = stringify({ packages: ['.', 'unrelated-workspace/*'], overrides, allowBuilds: { esbuild: true } });
    await writeFile(path.join(appRoot, 'pnpm-lock.yaml'), originalLock);
    await writeFile(path.join(appRoot, 'pnpm-workspace.yaml'), originalWorkspace);
    await stageProductionDependencyInputs(appRoot, staging);
    const stagedLock = parse(await readFile(path.join(staging, 'pnpm-lock.yaml'), 'utf8'));
    const stagedWorkspace = parse(await readFile(path.join(staging, 'pnpm-workspace.yaml'), 'utf8'));
    assert.deepEqual(stagedWorkspace.overrides, stagedLock.overrides);
    assert.deepEqual(stagedWorkspace.packages, ['.']);
    assert.deepEqual(stagedWorkspace.allowBuilds, { esbuild: true });
    for (const [name, original] of Object.entries(overrides)) {
      const selected = stagedWorkspace.overrides[name];
      assert.equal(path.resolve(staging, selected.slice(5)), path.resolve(appRoot, original.slice(5)));
      assert.deepEqual(stagedLock.packages[`${name}@${selected}`].resolution,
        { ...lock.packages[`${name}@${original}`].resolution, tarball: selected });
    }
    const nextSdk = stagedWorkspace.overrides['@nimiplatform/sdk'];
    const nextKit = stagedWorkspace.overrides['@nimiplatform/kit'];
    assert.equal(stagedLock.importers['.'].dependencies['@nimiplatform/kit'].specifier, nextKit);
    assert.equal(stagedLock.snapshots[`@nimiplatform/kit@${nextKit}(@nimiplatform/sdk@${nextSdk})`].dependencies['@nimiplatform/sdk'], nextSdk);
    assert.equal(await readFile(path.join(appRoot, 'pnpm-lock.yaml'), 'utf8'), originalLock);
    assert.equal(await readFile(path.join(appRoot, 'pnpm-workspace.yaml'), 'utf8'), originalWorkspace);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
