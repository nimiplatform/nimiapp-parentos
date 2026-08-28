import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/**
 * acceptance-mock-data.mjs — CDP acceptance for the ParentOS demo dataset.
 *
 * Launches the Electron dev shell with a CDP port, imports the mock fixtures
 * through the Settings dev card, then walks every data-bearing product route
 * and asserts each page renders real seeded content (not empty states).
 *
 * Usage: node scripts/acceptance-mock-data.mjs
 */

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const evidenceRoot = path.join(repoRoot, '.nimi', 'local', 'acceptance', 'mock-data');
const bridgeKey = '__NIMI_ELECTRON_RUNTIME__';

const routesToCheck = [
  { path: '/timeline', label: 'timeline', expectText: '林可然' },
  { path: '/profile', label: 'profile', expectText: '林可然' },
  { path: '/profile/growth', label: 'growth', expectText: null },
  { path: '/profile/milestones', label: 'milestones', expectText: null },
  { path: '/profile/vaccines', label: 'vaccines', expectText: null },
  { path: '/profile/vision', label: 'vision', expectText: null },
  { path: '/profile/dental', label: 'dental', expectText: null },
  { path: '/profile/sleep', label: 'sleep', expectText: null },
  { path: '/profile/allergies', label: 'allergies', expectText: null },
  { path: '/profile/medical-events', label: 'medical-events', expectText: null },
  { path: '/profile/posture', label: 'posture', expectText: null },
  { path: '/profile/outdoor', label: 'outdoor', expectText: null },
  { path: '/profile/dental?tab=orthodontic', label: 'orthodontic', expectText: null },
  { path: '/journal', label: 'journal', expectText: null },
  { path: '/reminders', label: 'reminders', expectText: null },
  { path: '/reports', label: 'reports', expectText: null },
  { path: '/advisor', label: 'advisor', expectText: null },
];

async function main() {
  const evidenceDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/gu, '-'));
  const screenshotDir = path.join(evidenceDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });

  const port = Number(process.env.NIMI_PARENTOS_MOCK_ACCEPTANCE_CDP_PORT || (await reservePort()));
  const consoleEvents = [];
  const pageErrors = [];
  let browser;
  let page;
  let rendererProcess = null;
  let appProcess = spawnNimiAppDev(port);
  let diagnostics = captureProcessOutput(appProcess);

  try {
    let cdpEndpoint;
    try {
      cdpEndpoint = await waitForCdpEndpoint(port, appProcess, diagnostics);
    } catch (firstError) {
      // A Desktop-supervised dev run without CDP already owns this app plan
      // (local-development-cdp-configuration-conflict). Fall back to a
      // self-hosted Electron with its own ephemeral profile so acceptance can
      // proceed without disturbing the operator's dev session.
      if (!/cdp-configuration-conflict|cdp-port-in-use/u.test(diagnostics().stderrTail || '')) {
        throw firstError;
      }
      console.log('Desktop-supervised dev run already active; falling back to self-hosted Electron.');
      rendererProcess = await ensureViteRenderer();
      appProcess = spawnSelfHostedElectron(port);
      diagnostics = captureProcessOutput(appProcess);
      cdpEndpoint = await waitForCdpEndpoint(port, appProcess, diagnostics);
    }
    browser = await chromium.connectOverCDP(cdpEndpoint);
    page = await waitForAppPage(browser);
    attachPageDiagnostics(page, consoleEvents, pageErrors);
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await page.waitForFunction((key) => Boolean(window[key]?.invoke), bridgeKey, { timeout: 30_000 });
    await page.setViewportSize({ width: 1365, height: 900 });
    await waitForProductRoute(page);

    const appUrl = new URL(page.url());
    const appOrigin = appUrl.origin;

    // 1. Import mock fixtures through the Settings dev card.
    await page.goto(`${appOrigin}/settings`, { waitUntil: 'domcontentloaded' });
    await waitForProductRoute(page);
    const importButton = page.locator('button', { hasText: /导入测试数据|导入/ }).last();
    await importButton.waitFor({ state: 'visible', timeout: 15_000 });
    await importButton.click();
    await page.waitForFunction(
      () => !/导入中/.test(document.body?.innerText || ''),
      null,
      { timeout: 180_000 },
    );
    const settingsText = await page.evaluate(() => document.body?.innerText || '');
    assert.match(settingsText, /children:\s*\d+\/\d+/u, `seed summary must report children: ${settingsText.slice(-400)}`);
    const seedSummary = (settingsText.match(/family:[^\n]*/u) || [''])[0];
    console.log(`seed summary: ${seedSummary}`);

    // 2. Walk every data route and assert seeded content renders.
    const routeResults = [];
    for (const route of routesToCheck) {
      await page.goto(`${appOrigin}${route.path}`, { waitUntil: 'domcontentloaded' });
      await waitForProductRoute(page);
      await delay(800);
      const state = await page.evaluate(() => ({
        bodyText: document.body?.innerText || '',
        loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
        failure: Boolean(document.querySelector('[data-testid="parentos-bootstrap-failure"]')),
      }));
      const screenshot = path.join(screenshotDir, `${route.label}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const errors = [];
      if (state.loading) errors.push('still loading');
      if (state.failure) errors.push('bootstrap failure');
      if (state.bodyText.trim().length < 30) errors.push(`page too empty (${state.bodyText.trim().length} chars)`);
      if (/�/u.test(state.bodyText)) errors.push('replacement glyph present');
      if (route.expectText && !state.bodyText.includes(route.expectText)) {
        errors.push(`missing expected text: ${route.expectText}`);
      }
      routeResults.push({
        route: route.path,
        label: route.label,
        textLength: state.bodyText.trim().length,
        errors,
        screenshot,
      });
      console.log(`${errors.length === 0 ? 'PASS' : 'FAIL'} ${route.path} (${state.bodyText.trim().length} chars)${errors.length ? ` -> ${errors.join('; ')}` : ''}`);
    }

    const failedRoutes = routeResults.filter((result) => result.errors.length > 0);
    assert.deepEqual(pageErrors, [], 'page must not emit page errors');
    // The self-hosted fallback does not register the nimi-shell-file:// media
    // scheme (that is owned by the Desktop-supervised host), so journal
    // photo/audio resources fail with ERR_UNKNOWN_URL_SCHEME there. Those are
    // environment noise, not data defects; every other console.error fails.
    const unexpectedConsoleErrors = consoleEvents.filter((event) => event.type === 'error'
      && !(event.text.includes('ERR_UNKNOWN_URL_SCHEME') && event.location?.url?.startsWith('nimi-shell-file://')));
    assert.deepEqual(
      unexpectedConsoleErrors,
      [],
      'page must not emit console.error events',
    );
    assert.deepEqual(
      failedRoutes.map((result) => ({ route: result.route, errors: result.errors })),
      [],
      'every data route must render seeded content',
    );

    const evidencePath = path.join(evidenceDir, 'evidence.json');
    await writeFile(evidencePath, JSON.stringify({
      seedSummary,
      routeResults,
      consoleEvents,
      pageErrors,
      diagnostics: diagnostics(),
    }, null, 2), 'utf8');
    console.log(`Mock data acceptance: ${evidencePath}`);
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(evidenceDir, 'failure.png'), fullPage: true }).catch(() => undefined);
    }
    await writeFile(path.join(evidenceDir, 'failure.json'), JSON.stringify({
      error: error instanceof Error ? error.stack || error.message : String(error),
      consoleEvents,
      pageErrors,
      diagnostics: diagnostics(),
    }, null, 2), 'utf8');
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await terminateProcessTree(appProcess);
    if (rendererProcess) await terminateProcessTree(rendererProcess);
  }
}

function spawnNimiAppDev(port) {
  return spawn(process.execPath, [
    path.join(repoRoot, 'node_modules', '@nimiplatform', 'app-tools', 'bin', 'nimi-app.mjs'),
    'dev', '--shell', 'electron', '--cdp-port', String(port),
  ], {
    cwd: repoRoot,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function ensureViteRenderer() {
  const origin = 'http://127.0.0.1:1426';
  try {
    const response = await fetch(origin);
    if (response.status < 500) return null; // an existing dev server is reused
  } catch {
    // No dev server yet; start one below.
  }
  const rendererProcess = spawn(process.execPath, [
    path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', '1426', '--strictPort',
  ], {
    cwd: repoRoot,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (rendererProcess.exitCode !== null) throw new Error(`vite exited before readiness (${rendererProcess.exitCode})`);
    try {
      const response = await fetch(origin);
      if (response.status < 500) return rendererProcess;
    } catch {
      // vite is still starting.
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for vite dev server');
}

function spawnSelfHostedElectron(port) {
  const electronBin = path.join(repoRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  const profileDir = path.join(evidenceRoot, 'self-host-profile');
  return spawn(electronBin, [
    path.join(repoRoot, 'dist-electron', 'main.js'),
    `--remote-debugging-port=${port}`,
    '--lang=zh-CN',
    '--nimi-dev-renderer-url=http://127.0.0.1:1426',
    `--user-data-dir=${profileDir}`,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NIMI_PARENTOS_ELECTRON_REMOTE_DEBUGGING_PORT: String(port),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForProductRoute(page) {
  await page.waitForFunction(() => {
    const routedSurface = document.querySelector('[data-testid="parentos-app-routed-surface"]');
    return Boolean(routedSurface?.textContent?.trim())
      && !document.querySelector('[data-testid="parentos-bootstrap-loading"]')
      && !document.querySelector('[data-testid="parentos-bootstrap-failure"]');
  }, null, { timeout: 30_000 });
}

function attachPageDiagnostics(page, consoleEvents, pageErrors) {
  page.on('console', (message) => {
    consoleEvents.push({ type: message.type(), text: message.text(), location: message.location() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.stack || error.message : String(error));
  });
}

function captureProcessOutput(child) {
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdoutTail = '';
  let stderrTail = '';
  child.stdout.on('data', (chunk) => { stdoutTail = `${stdoutTail}${chunk}`.slice(-16384); });
  child.stderr.on('data', (chunk) => { stderrTail = `${stderrTail}${chunk}`.slice(-8192); });
  return () => ({ stdoutTail, stderrTail, exitCode: child.exitCode, signalCode: child.signalCode });
}

async function waitForCdpEndpoint(port, appProcess, diagnostics) {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Electron exited before CDP attach: ${JSON.stringify(diagnostics())}`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return endpoint;
    } catch {
      // The shell is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron CDP ${endpoint}: ${JSON.stringify(diagnostics())}`);
}

async function waitForAppPage(browser) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => !candidate.url().startsWith('devtools://'));
      if (page) return page;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the Electron app page');
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') reject(new Error('failed to reserve CDP port'));
        else resolve(address.port);
      });
    });
  });
}

async function terminateProcessTree(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('exit', resolve);
      killer.once('error', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
