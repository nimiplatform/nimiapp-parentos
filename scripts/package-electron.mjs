import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidecarName = process.platform === 'win32' ? 'parentos_host.exe' : 'parentos_host';
const cargoSidecar = path.join(appRoot, 'src-tauri', 'target', 'debug', sidecarName);
const extraSidecar = path.join(appRoot, 'build', 'electron-extra-resources', 'bin', sidecarName);
const stagingRoot = path.join(appRoot, 'build', 'electron-app');
const packageRoot = path.join(appRoot, 'build', 'electron-packages');
const sdkSource = path.resolve(appRoot, '..', '..', 'nimi', 'sdks', 'typescript');
const kitSource = path.resolve(appRoot, '..', '..', 'nimi', 'kit');
const packagedSidecar = path.join(appRoot, 'dist-electron', 'win-unpacked', 'resources', 'bin', sidecarName);
const packagedAsar = path.join(appRoot, 'dist-electron', 'win-unpacked', 'resources', 'app.asar');
const rootNodeModules = path.join(appRoot, 'node_modules');
const rootPnpmStore = path.join(rootNodeModules, '.pnpm');
const nimiWorkspacePnpmStore = path.join(path.dirname(kitSource), 'node_modules', '.pnpm');
const electronRuntimePackages = [
  '@nimiplatform/kit',
  '@nimiplatform/sdk',
  '@grpc/grpc-js',
  '@grpc/proto-loader',
  '@js-sdsl/ordered-map',
  '@protobuf-ts/runtime',
  '@protobufjs/aspromise',
  '@protobufjs/base64',
  '@protobufjs/codegen',
  '@protobufjs/eventemitter',
  '@protobufjs/fetch',
  '@protobufjs/float',
  '@protobufjs/path',
  '@protobufjs/pool',
  '@protobufjs/utf8',
  'lodash.camelcase',
  'long',
  'protobufjs',
  'sharp',
  '@img/colour',
  '@img/sharp-win32-x64',
  'detect-libc',
  'semver',
];
const electronRuntimePackageVersions = {
  'sharp': '0.35.3',
  '@img/colour': '1.1.0',
  '@img/sharp-win32-x64': '0.35.3',
  'detect-libc': '2.1.2',
  'semver': '7.8.5',
};
const evidenceDir = path.join(
  appRoot,
  '.nimi',
  'local',
  'acceptance',
  '2026-07-10-third-party-installed-app-reference-hardcut',
  'parentos-electron-package',
);
const evidencePath = path.join(evidenceDir, 'package-electron.json');
const builderLogPath = path.join(evidenceDir, 'electron-builder.log');

run('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'parentos_host']);
await assertFile(cargoSidecar, 'cargo sidecar output');
const cargoSidecarSelfTest = runCapture(cargoSidecar, ['--self-test']);
await mkdir(path.dirname(extraSidecar), { recursive: true });
await copyFile(cargoSidecar, extraSidecar);
await assertFile(extraSidecar, 'Electron extraResources sidecar input');

await removeTree(packageRoot);
await mkdir(packageRoot, { recursive: true });
await assertFile(path.join(sdkSource, 'dist', 'index.js'), 'upstream SDK dist index');
await assertFile(path.join(kitSource, 'dist', 'auth', 'shell', 'index.js'), 'upstream Kit auth shell dist index');
run('pnpm', ['--dir', sdkSource, 'pack', '--pack-destination', packageRoot, '--config.ignore-scripts=true']);
run('pnpm', ['--dir', kitSource, 'pack', '--pack-destination', packageRoot, '--config.ignore-scripts=true']);

const sdkPackage = await readPackageJson(path.join(sdkSource, 'package.json'));
const kitPackage = await readPackageJson(path.join(kitSource, 'package.json'));
const sdkTgz = await findPackedTarball(sdkPackage.name, sdkPackage.version);
const kitTgz = await findPackedTarball(kitPackage.name, kitPackage.version);
await rewriteKitRuntimeTarball(kitTgz, sdkPackage.version);

await removeTree(stagingRoot);
await mkdir(stagingRoot, { recursive: true });
await cp(path.join(appRoot, 'dist'), path.join(stagingRoot, 'dist'), { recursive: true });
await cp(path.join(appRoot, 'src-electron', 'dist'), path.join(stagingRoot, 'src-electron', 'dist'), { recursive: true });
await writeFile(path.join(stagingRoot, 'pnpm-workspace.yaml'), 'packages:\n  - .\n', 'utf8');
await writeFile(
  path.join(stagingRoot, '.npmrc'),
  [
    'shared-workspace-lockfile=false',
    'link-workspace-packages=false',
    'prefer-workspace-packages=false',
    'node-linker=hoisted',
    '',
  ].join('\n'),
  'utf8',
);
await mkdir(path.join(stagingRoot, 'node_modules'), { recursive: true });
await extractPackedPackage(sdkTgz, '@nimiplatform/sdk');
await extractPackedPackage(kitTgz, '@nimiplatform/kit');
for (const packageName of electronRuntimePackages.filter((name) => !name.startsWith('@nimiplatform/'))) {
  await copyRootPnpmPackage(packageName);
}
await writeFile(
  path.join(stagingRoot, 'package.json'),
  `${JSON.stringify({
    name: 'nimiapp-parentos-electron',
    version: '0.1.0',
    private: true,
    type: 'module',
    main: 'src-electron/dist/main-wrapper.cjs',
    description: 'AI-driven child growth operating system for ParentOS desktop.',
    author: 'Nimi Platform',
    dependencies: {
      '@grpc/grpc-js': '1.14.4',
      '@nimiplatform/kit': `file:../electron-packages/${kitTgz}`,
      '@nimiplatform/sdk': `file:../electron-packages/${sdkTgz}`,
    },
    pnpm: {
      overrides: {
        '@nimiplatform/sdk': `file:../electron-packages/${sdkTgz}`,
      },
    },
  }, null, 2)}\n`,
  'utf8',
);

await assertMaterializedPackage('@nimiplatform/sdk', 'dist/index.js');
await assertMaterializedPackage('@nimiplatform/kit', 'dist/shell/electron/main/index.js');
await pruneElectronRuntimeDependencies({ sdkTgz, kitTgz });

await removeTree(path.join(appRoot, 'dist-electron', 'win-unpacked'));
const builderResult = runCapture(process.execPath, [
  require.resolve('electron-builder/cli.js'),
  '--projectDir',
  'build/electron-app',
  '--config',
  '../../electron-builder.parentos.yml',
  '--win',
  'dir',
]);
await mkdir(evidenceDir, { recursive: true });
await writeFile(builderLogPath, builderResult.output, 'utf8');
assertNoBuilderWarnings(builderResult.output);
await assertFile(packagedSidecar, 'packaged Electron sidecar resources path');
const packagedSidecarSelfTest = runCapture(packagedSidecar, ['--self-test']);
await assertFile(packagedAsar, 'packaged Electron asar');
assertAsarEntry(packagedAsar, '/node_modules/@nimiplatform/sdk/dist/index.js');
assertAsarEntry(packagedAsar, '/node_modules/@nimiplatform/sdk/dist/runtime/index.js');
assertAsarEntry(packagedAsar, '/node_modules/@nimiplatform/kit/dist/shell/electron/main/index.js');
assertAsarEntry(packagedAsar, '/node_modules/@nimiplatform/kit/dist/shell/capabilities/index.js');
assertAsarEntry(packagedAsar, '/node_modules/sharp/dist/index.mjs');
assertAsarEntry(packagedAsar, '/node_modules/@img/sharp-win32-x64/index.cjs');

await writeFile(evidencePath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  cargoSidecar,
  extraSidecar,
  stagingRoot,
  packageRoot,
  sdkTgz: path.join(packageRoot, sdkTgz),
  kitTgz: path.join(packageRoot, kitTgz),
  packagedSidecar,
  packagedAsar,
  builderLogPath,
  cargoSidecarSelfTest,
  packagedSidecarSelfTest,
}, null, 2)}\n`, 'utf8');

function run(command, args, options = {}) {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: options.cwd ?? appRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`);
  }
}

function runCapture(command, args) {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`);
  }
  return { output };
}

function resolveCommand(command, args) {
  if (process.platform === 'win32' && (command === 'pnpm' || command === 'npm')) {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] };
  }
  return { command, args };
}

async function assertFile(filePath, label) {
  const info = await stat(filePath).catch((error) => {
    throw new Error(`${label} is missing at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!info.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

async function readPackageJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function removeTree(target) {
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function findPackedTarball(packageName, version) {
  const baseName = packageName.replace(/^@/, '').replace('/', '-');
  const expected = `${baseName}-${version}.tgz`;
  await assertFile(path.join(packageRoot, expected), `${packageName} packed tarball`);
  return expected;
}

async function rewriteKitRuntimeTarball(kitTgz, sdkVersion) {
  const tarballPath = path.join(packageRoot, kitTgz);
  const rewriteRoot = path.join(packageRoot, 'kit-runtime-tarball');
  const rewriteRootName = path.basename(rewriteRoot);
  const packageDir = path.join(rewriteRoot, 'package');
  await removeTree(rewriteRoot);
  await mkdir(rewriteRoot, { recursive: true });
  run('tar', ['-xzf', kitTgz, '-C', rewriteRootName], { cwd: packageRoot });
  const manifestPath = path.join(packageDir, 'package.json');
  const manifest = await readPackageJson(manifestPath);
  manifest.dependencies = {
    '@grpc/grpc-js': '^1.14.4',
    '@nimiplatform/sdk': sdkVersion,
  };
  delete manifest.devDependencies;
  delete manifest.peerDependencies;
  delete manifest.optionalDependencies;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rm(tarballPath, { force: true });
  run('tar', ['-czf', kitTgz, '-C', rewriteRootName, 'package'], { cwd: packageRoot });
  await removeTree(rewriteRoot);
}

async function extractPackedPackage(tarballName, packageName) {
  const extractRoot = path.join(packageRoot, `${packageName.replace('@', '').replace('/', '-')}-extract`);
  const extractRootName = path.basename(extractRoot);
  const extractedPackage = path.join(extractRoot, 'package');
  const destination = packageInstallPath(packageName);
  await removeTree(extractRoot);
  await mkdir(extractRoot, { recursive: true });
  run('tar', ['-xzf', tarballName, '-C', extractRootName], { cwd: packageRoot });
  await mkdir(path.dirname(destination), { recursive: true });
  await removeTree(destination);
  await cp(extractedPackage, destination, { recursive: true });
  await removeTree(extractRoot);
}

async function copyRootPnpmPackage(packageName) {
  const source = await findRuntimePnpmPackagePath(
    packageName,
    electronRuntimePackageVersions[packageName],
  );
  const destination = packageInstallPath(packageName);
  await mkdir(path.dirname(destination), { recursive: true });
  await removeTree(destination);
  await cp(source, destination, { recursive: true });
}

async function findRuntimePnpmPackagePath(packageName, version) {
  const encodedName = packageName.replace('/', '+');
  const entryPrefix = `${encodedName}@${version || ''}`;
  for (const store of [rootPnpmStore, nimiWorkspacePnpmStore]) {
    const entries = await readdir(store).catch(() => []);
    const matches = entries
      .filter((entry) => entry.startsWith(entryPrefix))
      .sort();
    for (const match of matches) {
      const candidate = path.join(store, match, 'node_modules', ...packageName.split('/'));
      const manifest = path.join(candidate, 'package.json');
      if (await stat(manifest).then((info) => info.isFile()).catch(() => false)) {
        return candidate;
      }
    }
  }
  throw new Error(
    `${packageName}${version ? `@${version}` : ''} is missing from the app and Nimi workspace pnpm stores.`,
  );
}

function packageInstallPath(packageName) {
  return path.join(stagingRoot, 'node_modules', ...packageName.split('/'));
}

async function pruneElectronRuntimeDependencies({ sdkTgz, kitTgz }) {
  const keep = new Set(electronRuntimePackages);
  const nodeModules = path.join(stagingRoot, 'node_modules');
  const dependencies = {
    '@nimiplatform/kit': `file:../electron-packages/${kitTgz}`,
    '@nimiplatform/sdk': `file:../electron-packages/${sdkTgz}`,
  };

  for (const packageName of electronRuntimePackages) {
    const packagePath = packageJsonPath(packageName);
    await assertFile(packagePath, `${packageName} staging package manifest`);
    const packageJson = await readPackageJson(packagePath);
    if (packageName !== '@nimiplatform/kit' && packageName !== '@nimiplatform/sdk') {
      dependencies[packageName] = packageJson.version;
    }
    delete packageJson.dependencies;
    delete packageJson.devDependencies;
    delete packageJson.peerDependencies;
    delete packageJson.optionalDependencies;
    delete packageJson.bin;
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  }

  const appPackageJson = await readPackageJson(path.join(stagingRoot, 'package.json'));
  appPackageJson.packageManager = 'npm@11.7.0';
  appPackageJson.dependencies = dependencies;
  delete appPackageJson.pnpm;
  await writeFile(path.join(stagingRoot, 'package.json'), `${JSON.stringify(appPackageJson, null, 2)}\n`, 'utf8');

  await rm(path.join(stagingRoot, 'pnpm-lock.yaml'), { force: true });
  await rm(path.join(nodeModules, '.pnpm'), { recursive: true, force: true });
  await rm(path.join(nodeModules, '.bin'), { recursive: true, force: true });

  for (const entry of await readdir(nodeModules)) {
    if (entry.startsWith('.')) {
      continue;
    }
    const entryPath = path.join(nodeModules, entry);
    if (entry.startsWith('@')) {
      for (const scopedEntry of await readdir(entryPath)) {
        const scopedPackageName = `${entry}/${scopedEntry}`;
        if (!keep.has(scopedPackageName)) {
          await rm(path.join(entryPath, scopedEntry), { recursive: true, force: true });
        }
      }
      const remainingEntries = await readdir(entryPath).catch(() => []);
      if (remainingEntries.length === 0) {
        await rm(entryPath, { recursive: true, force: true });
      }
      continue;
    }
    if (!keep.has(entry)) {
      await rm(entryPath, { recursive: true, force: true });
    }
  }
}

function packageJsonPath(packageName) {
  return path.join(stagingRoot, 'node_modules', ...packageName.split('/'), 'package.json');
}

async function assertMaterializedPackage(packageName, distEntry) {
  const packagePath = path.join(stagingRoot, 'node_modules', ...packageName.split('/'));
  const info = await stat(packagePath);
  if (!info.isDirectory()) {
    throw new Error(`${packageName} staging package must be a materialized directory from packed tgz`);
  }
  await assertFile(path.join(packagePath, 'package.json'), `${packageName} staging package manifest`);
  await assertFile(path.join(packagePath, distEntry), `${packageName} staging dist entry`);
}

function assertAsarEntry(asarPath, entryPath) {
  const normalize = (entry) => entry.replaceAll('\\', '/').replace(/^\/+/, '');
  const normalizedEntry = normalize(entryPath);
  const entries = new Set(asar.listPackage(asarPath).map(normalize));
  if (!entries.has(normalizedEntry)) {
    throw new Error(`packaged Electron asar is missing ${entryPath}`);
  }
}

function assertNoBuilderWarnings(output) {
  const forbidden = [
    { name: 'generic electron-builder warning', pattern: /(?:^|\s)(?:warn|warning|⚠)(?:\s|:|$)/i },
    { name: 'missing description warning', pattern: /description is missed/i },
    { name: 'missing author warning', pattern: /author is missed/i },
    { name: 'default Electron icon warning', pattern: /default Electron icon is used/i },
    { name: 'duplicate dependency references warning', pattern: /duplicate dependency references/i },
  ];
  const hits = forbidden.filter((entry) => entry.pattern.test(output));
  if (hits.length > 0) {
    for (const hit of hits) {
      process.stderr.write(`[package-electron] ${hit.name} is present.\n`);
    }
    throw new Error('electron-builder warning gate failed');
  }
}
