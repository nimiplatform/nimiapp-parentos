import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '..');
const rendererUrl = 'http://127.0.0.1:1426';
const viteBin = path.join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');
const children = new Set();
const SIGNAL_EXIT_CODES = new Map([
  ['SIGINT', 130],
  ['SIGTERM', 143],
]);

for (const signal of SIGNAL_EXIT_CODES.keys()) {
  process.on(signal, () => shutdownFromSignal(signal));
}

try {
  spawnRenderer();
  await waitForUrl(rendererUrl, 45_000);
  const electron = spawnElectron();
  const exitCode = await waitForExit(electron);
  await requestAllChildrenShutdown('SIGTERM');
  if (exitCode !== null && exitCode !== 0) {
    console.error(`[run-electron-dev] Electron exited with code ${formatElectronExitCode(exitCode)}`);
  }
  process.exit(exitCode ?? 0);
} catch (error) {
  await requestAllChildrenShutdown('SIGTERM');
  console.error(error instanceof Error ? error.message : String(error || 'Electron dev failed'));
  process.exit(1);
}

function spawnElectron() {
  const electron = spawnTracked(electronBin, ['src-electron/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NIMI_PARENTOS_ELECTRON_RENDERER_URL: rendererUrl,
    },
  });
  forwardChildOutput(electron.stdout, process.stdout);
  forwardChildOutput(electron.stderr, process.stderr);
  return electron;
}

function spawnRenderer() {
  return spawnTracked(process.execPath, [
    viteBin,
    '--host',
    '127.0.0.1',
    '--port',
    '1426',
    '--strictPort',
  ], {
    stdio: 'inherit',
    env: process.env,
  });
}

function forwardChildOutput(readable, writable) {
  if (!readable) {
    return;
  }
  readable.on('data', (chunk) => {
    writable.write(chunk);
  });
}

function spawnTracked(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    cwd: appRoot,
  });
  children.add(child);
  child.once('exit', () => {
    children.delete(child);
  });
  return child;
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
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
}

function formatElectronExitCode(code) {
  if (process.platform !== 'win32') {
    return String(code);
  }
  return `${code} (${formatWindowsExitCode(code)}${formatWindowsExitHint(code)})`;
}

function formatWindowsExitCode(code) {
  return `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function formatWindowsExitHint(code) {
  if (formatWindowsExitCode(code) === '0xC0000409') {
    return ': Windows fast-fail / stack buffer overrun';
  }
  return '';
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

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
      lastError = new Error(`renderer responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ParentOS renderer at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError || '')}`);
}
