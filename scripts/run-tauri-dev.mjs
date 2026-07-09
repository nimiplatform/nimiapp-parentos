import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveParentOSDevStorageRoots,
  resolveParentOSRuntimeEndpoint,
} from './runtime-app-storage-projection.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '..');
const runtimeEndpoint = resolveParentOSRuntimeEndpoint(
  'NIMI_RUNTIME_GRPC_ADDR',
  'NIMI_PARENTOS_TAURI_RUNTIME_ENDPOINT',
);
const tauriBin = path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri');
const children = new Set();
const SIGNAL_EXIT_CODES = new Map([
  ['SIGINT', 130],
  ['SIGTERM', 143],
]);

for (const signal of SIGNAL_EXIT_CODES.keys()) {
  process.on(signal, () => shutdownFromSignal(signal));
}

try {
  ensureRendererPortAvailable();
  const storageRoots = resolveParentOSDevStorageRoots({
    sessionKind: 'tauri-dev',
  });
  const launchNonce = process.env.NIMI_APP_LAUNCH_NONCE
    || process.env.NIMI_PARENTOS_TAURI_LAUNCH_NONCE
    || randomUUID();
  const tauri = spawnTracked(tauriBin, ['dev', '--config', 'src-tauri/tauri.conf.json'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NIMI_RUNTIME_GRPC_ADDR: runtimeEndpoint,
      NIMI_APP_LAUNCH_NONCE: launchNonce,
      NIMI_APP_DURABLE_DATA_ROOT: storageRoots.dataRoot,
      NIMI_APP_CACHE_ROOT: storageRoots.cacheRoot,
      NIMI_APP_TEMP_ROOT: storageRoots.tempRoot,
      NIMI_PARENTOS_TAURI_LAUNCH_NONCE: launchNonce,
      NIMI_PARENTOS_TAURI_DURABLE_DATA_ROOT: storageRoots.dataRoot,
      NIMI_PARENTOS_TAURI_CACHE_ROOT: storageRoots.cacheRoot,
      NIMI_PARENTOS_TAURI_TEMP_ROOT: storageRoots.tempRoot,
    },
  });
  const exitCode = await waitForExit(tauri);
  await requestAllChildrenShutdown('SIGTERM');
  process.exit(exitCode ?? 0);
} catch (error) {
  await requestAllChildrenShutdown('SIGTERM');
  console.error(error instanceof Error ? error.message : String(error || 'Tauri dev failed'));
  process.exit(1);
}

function ensureRendererPortAvailable() {
  const result = spawnSync(process.execPath, ['scripts/ensure-dev-renderer-port.mjs'], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`[run-tauri-dev] failed to start renderer port preflight: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[run-tauri-dev] renderer port preflight failed with status ${result.status ?? 'unknown'}`);
  }
}

function spawnTracked(command, args, options) {
  const resolved = resolveSpawnCommand(command, args);
  const child = spawn(resolved.command, resolved.args, {
    ...options,
    cwd: appRoot,
  });
  children.add(child);
  child.once('exit', () => {
    children.delete(child);
  });
  return child;
}

function resolveSpawnCommand(command, args) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] };
  }
  return { command, args };
}

async function shutdownFromSignal(signal) {
  await requestAllChildrenShutdown(signal);
  process.exit(SIGNAL_EXIT_CODES.get(signal) ?? 1);
}

async function requestAllChildrenShutdown(signal) {
  await Promise.all([...children].map((child) => requestProcessTreeShutdown(child, signal)));
}

async function requestProcessTreeShutdown(child, signal) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/t'], { stdio: 'ignore' });
  } else {
    child.kill(signal);
  }
  const stopped = await waitForExitOrTimeout(child, 2_000);
  if (!stopped) {
    forceKillProcessTree(child);
    await waitForExitOrTimeout(child, 1_000);
  }
}

function forceKillProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGKILL');
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });
}

function waitForExitOrTimeout(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off('exit', onExit);
    };
    child.once('exit', onExit);
  });
}
