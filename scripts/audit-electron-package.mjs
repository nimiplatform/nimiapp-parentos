import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const appAsarPath = path.resolve('dist-electron/win-unpacked/resources/app.asar');
await stat(appAsarPath);

const entries = asar.listPackage(appAsarPath).map((entry) => {
  const normalized = entry.replaceAll('\\', '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
});

const sdkKitPackage = /^\/node_modules\/@nimiplatform\/(?:kit|sdk)\//;

function violationReason(entry) {
  if (/\/node_modules\/@nimiplatform\/(?:kit|sdk)\/.*\/src\//.test(entry)) {
    return 'SDK/Kit src tree is forbidden';
  }
  if (entry.includes('/node_modules/@nimiplatform/sdk/adapters/')) {
    return 'SDK adapters tree is forbidden';
  }
  if (entry.includes('/test/')) {
    return 'test directory is forbidden';
  }
  if (/^\/node_modules\/(?:@radix-ui\/|react(?:-dom)?\/|three\/|remark-gfm\/)/.test(entry)) {
    return 'unused renderer-only dependency is forbidden in Electron runtime package';
  }
  if (/\.(?:test|example)\.tsx?$/.test(entry)) {
    return 'test/example TypeScript file is forbidden';
  }
  if (sdkKitPackage.test(entry) && /\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
    return 'non-declaration TypeScript source in SDK/Kit package is forbidden';
  }
  return null;
}

const violations = entries
  .map((entry) => ({ entry, reason: violationReason(entry) }))
  .filter((item) => item.reason !== null);

if (violations.length > 0) {
  process.stderr.write('[audit-electron-package] forbidden development files in app.asar:\n');
  for (const violation of violations.slice(0, 100)) {
    process.stderr.write(`${violation.entry} — ${violation.reason}\n`);
  }
  if (violations.length > 100) {
    process.stderr.write(`...and ${violations.length - 100} more violations\n`);
  }
  process.exit(1);
}

const required = [
  '/node_modules/@nimiplatform/sdk/dist/index.js',
  '/node_modules/@nimiplatform/sdk/dist/runtime/index.js',
  '/node_modules/@nimiplatform/sdk/dist/runtime/wire-types/index.js',
  '/node_modules/@nimiplatform/kit/dist/auth/shell/index.js',
  '/node_modules/@nimiplatform/kit/dist/shell/electron/main/index.js',
  '/node_modules/@nimiplatform/kit/dist/shell/capabilities/index.js',
  '/node_modules/@nimiplatform/kit-protected-local-win32-x64/index.cjs',
  '/node_modules/@nimiplatform/kit-protected-local-win32-x64/nimi_shell_protected_local.node',
  `/node_modules/${['@grpc', 'grpc-js'].join('/')}/build/src/index.js`,
  '/node_modules/@grpc/proto-loader/build/src/index.js',
  '/node_modules/@protobuf-ts/runtime/build/commonjs/index.js',
  '/node_modules/protobufjs/index.js',
];
const missing = required.filter((entry) => !entries.includes(entry));
if (missing.length > 0) {
  process.stderr.write(`[audit-electron-package] required packed dist entries are missing:\n${missing.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`[audit-electron-package] app.asar passed (${entries.length} entries).\n`);
