import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { NIMI_STANDARD_SHELL_COMMANDS } from '@nimiplatform/kit/shell/capabilities';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const evidenceRoot = path.join(
  repoRoot,
  '.nimi',
  'local',
  'acceptance',
  '2026-07-18-app-launch-migration-wave',
  'parentos-electron',
);
const bridgeKey = '__NIMI_ELECTRON_RUNTIME__';
const reservedPermissionId = 'agents.interact';
const storageRunId = new Date().toISOString().replace(/[^0-9A-Za-z]/gu, '-');
const storageRelativePath = `acceptance/parentos-base-entitlement-${storageRunId}.json`;
const plainNegative = process.argv.includes('--plain-negative');

async function main() {
  const evidenceDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/gu, '-'));
  const screenshotDir = path.join(evidenceDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });

  const configuredSupervisorPort = String(
    process.env.NIMI_PARENTOS_ELECTRON_ACCEPTANCE_CDP_PORT
    || process.env.NIMI_LOCAL_AGENT_PRODUCT_ZHIYU_CDP_PORT
    || '',
  ).trim();
  if (!plainNegative && !configuredSupervisorPort) {
    throw new Error(
      'Desktop-supervised Electron acceptance requires the checkpoint CDP port used when Desktop was started.',
    );
  }
  const port = Number(configuredSupervisorPort || await reservePort());
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Electron acceptance CDP port is invalid.');
  }
  let rendererProcess = null;
  let launcherCommand;
  let launcherArgs;
  let launcherEnv = process.env;
  if (plainNegative) {
    rendererProcess = spawn(process.execPath, [
      path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--host', '127.0.0.1', '--port', '1426', '--strictPort',
    ], {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForHttp('http://127.0.0.1:1426', rendererProcess);
    launcherCommand = path.join(
      repoRoot,
      'dist-electron',
      'win-unpacked',
      process.platform === 'win32' ? 'ParentOS.exe' : 'ParentOS',
    );
    launcherArgs = [
      `--remote-debugging-port=${port}`,
      '--lang=zh-CN',
      '--nimi-dev-renderer-url=http://127.0.0.1:1426',
    ];
    launcherEnv = {
      ...process.env,
      NIMI_PARENTOS_ELECTRON_REMOTE_DEBUGGING_PORT: String(port),
    };
  } else {
    launcherCommand = process.execPath;
    launcherArgs = [
      path.join(repoRoot, 'node_modules', '@nimiplatform', 'app-tools', 'bin', 'nimi-app.mjs'),
      'dev', '--shell', 'electron',
    ];
  }
  const appProcess = spawn(launcherCommand, launcherArgs, {
    cwd: repoRoot,
    env: launcherEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const diagnostics = captureProcessOutput(appProcess);
  const consoleEvents = [];
  const pageErrors = [];
  let browser;
  let page;

  try {
    const cdpEndpoint = await waitForCdpEndpoint(port, appProcess, diagnostics);
    browser = await chromium.connectOverCDP(cdpEndpoint);
    page = await waitForAppPage(browser);
    attachPageDiagnostics(page, consoleEvents, pageErrors);

    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await page.waitForFunction((key) => Boolean(window[key]?.invoke), bridgeKey, { timeout: 30_000 });
    await page.setViewportSize({ width: 1365, height: 900 });
    await waitForProductLaunch(page);
    const launchState = await captureLaunchState(page);
    assertLaunchState(launchState, 'Electron');
    await page.getByTestId('parentos-launch-trigger').click();
    await waitForProductRoute(page);
    await dismissWelcomeIntro(page);
    const desktopState = await captureProductState(page);
    assertProductState(desktopState, 'Electron');
    const desktopOverflow = await assertNoVisibleOverflow(page, 'electron-desktop');
    const desktopScreenshot = path.join(screenshotDir, 'desktop.png');
    await page.screenshot({ path: desktopScreenshot, fullPage: true });
    const hmrResult = await verifyRendererHmr(page, consoleEvents);

    const sessionStatusResult = await invokeBridge(
      page,
      NIMI_STANDARD_SHELL_COMMANDS['local-app.sessionStatus'],
      {},
    );
    if (plainNegative) {
      assert.equal(sessionStatusResult.ok, false, 'unsupervised Electron must not acquire a local-app session');
      assert.match(
        JSON.stringify(sessionStatusResult.error),
        /protected-carrier-required|runtime-service-unavailable|local-development|supervisor/iu,
        `unsupervised Electron denial must name the protected carrier: ${JSON.stringify(sessionStatusResult)}`,
      );
    } else {
      assert.equal(sessionStatusResult.ok, true, 'Electron must bind a real Desktop-supervised local-app session');
      assert.match(
        String(sessionStatusResult.value?.state || ''),
        /ready/u,
        `Electron local-app session must be bound: ${JSON.stringify(sessionStatusResult)}`,
      );
    }

    const permissionStatusResult = await invokeBridge(
      page,
      NIMI_STANDARD_SHELL_COMMANDS['local-app.permissionStatus'],
      { payload: { permissionId: reservedPermissionId } },
    );
    const baseEntitlementWriteResult = await invokeBridge(
      page,
      NIMI_STANDARD_SHELL_COMMANDS['storage.writeJson'],
      { payload: { relativePath: storageRelativePath, value: { shell: 'electron', class: 'base_entitlement' } } },
    );
    if (plainNegative) {
      assert.equal(permissionStatusResult.ok, false, 'unsupervised Electron must not read protected permission posture');
      assert.equal(baseEntitlementWriteResult.ok, false, 'unsupervised Electron must not acquire the Runtime private-storage base entitlement');
    } else {
      assert.equal(permissionStatusResult.ok, true, `reserved permission posture must be readable: ${JSON.stringify(permissionStatusResult)}`);
      assert.equal(permissionStatusResult.value?.state, 'unavailable', 'reserved permission must remain unavailable');
      assert.equal(permissionStatusResult.value?.canRequest, false, 'reserved permission must not be requestable');
      assert.equal(baseEntitlementWriteResult.ok, true, `app-private JSON must use its base entitlement without a prompt: ${JSON.stringify(baseEntitlementWriteResult)}`);
    }

    const directRuntimeResult = await invokeBridge(
      page,
      NIMI_STANDARD_SHELL_COMMANDS['runtime.unary'],
      {
        payload: {
          methodId: '/nimi.runtime.v1.RuntimeAuditService/GetRuntimeHealth',
          requestBytesBase64: '',
          metadata: {
            appId: 'renderer-spoof-parentos',
            callerId: 'renderer-spoof',
          },
        },
      },
    );
    assert.equal(directRuntimeResult.ok, false, 'Electron direct Runtime must be denied by the local-app capability set');

    const appDomainResult = await invokeBridge(page, 'get_family', {});
    assert.equal(appDomainResult.ok, true, `Electron app-owned SQLite command must remain available independently: ${JSON.stringify(appDomainResult)}`);

    const accountControlResults = {};
    for (const command of [
      'nimi.shell.auth.session.load',
      'nimi.shell.auth.session.save',
      'nimi.shell.auth.session.clear',
    ]) {
      assert.ok(command.length > 0, 'Electron account-control probe command must be concrete');
      const result = await invokeBridge(page, command, {});
      assert.equal(result.ok, false, `${command} must fail closed in ParentOS Electron`);
      accountControlResults[command] = result;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const narrowState = await captureProductState(page);
    assertProductState(narrowState, 'Electron narrow');
    const narrowOverflow = await assertNoVisibleOverflow(page, 'electron-narrow');
    const narrowScreenshot = path.join(screenshotDir, 'narrow.png');
    await page.screenshot({ path: narrowScreenshot, fullPage: true });

    await delay(250);
    assert.deepEqual(pageErrors, [], 'Electron page must not emit page errors');
    assert.deepEqual(
      consoleEvents.filter((event) => event.type === 'error'),
      [],
      'Electron page must not emit console.error events',
    );

    const evidencePath = path.join(evidenceDir, 'evidence.json');
    await writeFile(evidencePath, JSON.stringify({
      shell: 'electron',
      mode: plainNegative ? 'plain-negative' : 'desktop-supervised',
      launcher: { command: launcherCommand, args: launcherArgs },
      cdpEndpoint,
      launchState,
      desktopState,
      narrowState,
      sessionStatusResult,
      permissionStatusResult,
      baseEntitlementWriteResult,
      directRuntimeResult,
      appDomainResult,
      accountControlResults,
      overflowScan: { desktop: desktopOverflow, narrow: narrowOverflow },
      hmrResult,
      consoleEvents,
      pageErrors,
      diagnostics: diagnostics(),
      screenshots: { desktop: desktopScreenshot, narrow: narrowScreenshot },
    }, null, 2), 'utf8');
    process.stdout.write(`Electron app-owned authority acceptance: ${evidencePath}\n`);
  } catch (error) {
    await writeFailureEvidence({
      evidenceDir,
      page,
      error,
      consoleEvents,
      pageErrors,
      diagnostics: diagnostics(),
    });
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await terminateProcessTree(appProcess);
    if (rendererProcess) await terminateProcessTree(rendererProcess);
  }
}

async function verifyRendererHmr(page, consoleEvents) {
  const baseline = consoleEvents.length;
  const probePath = path.join(repoRoot, 'src', 'shell', 'renderer', 'App.tsx');
  const now = new Date();
  await utimes(probePath, now, now);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const event = consoleEvents.slice(baseline).find((entry) => /hot updated|hmr update/iu.test(entry.text));
    if (event) {
      await waitForProductRoute(page);
      return { probePath, event };
    }
    await delay(100);
  }
  throw new Error(`Renderer HMR did not emit an update for ${probePath}`);
}

function assertLaunchState(state, label) {
  assert.equal(state.loading, false, `${label} must leave bootstrap loading`);
  assert.equal(state.failure, false, `${label} must not show an app-data failure`);
  assert.equal(state.launch, true, `${label} must render the ParentOS launch surface`);
  assert.equal(state.routed, false, `${label} must wait for explicit launch interaction`);
  assert.ok(state.launchLabel.length > 0, `${label} launch control must have an accessible name`);
  assert.doesNotMatch(state.bodyText, /�/u, `${label} must not contain replacement-glyph text`);
}

function assertProductState(state, label) {
  assert.equal(state.loading, false, `${label} must leave bootstrap loading`);
  assert.equal(state.failure, false, `${label} must not show an app-data failure`);
  assert.equal(state.routed, true, `${label} must render ParentOS product routes`);
  assert.equal(state.launch, false, `${label} must leave the launch surface after interaction`);
  assert.ok(state.bodyText.trim().length > 0, `${label} must render readable product content`);
  assert.doesNotMatch(state.bodyText, /�/u, `${label} must not contain replacement-glyph text`);
}

async function waitForProductLaunch(page) {
  await page.waitForFunction(() => {
    const launch = document.querySelector('[data-testid="parentos-launch-page"]');
    const loading = document.querySelector('[data-testid="parentos-bootstrap-loading"]');
    const failure = document.querySelector('[data-testid="parentos-bootstrap-failure"]');
    return Boolean(launch) && !loading && !failure;
  }, null, { timeout: 30_000 });
}

async function waitForProductRoute(page) {
  await page.waitForFunction(() => (
    Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]'))
    && !document.querySelector('[data-testid="parentos-bootstrap-loading"]')
    && !document.querySelector('[data-testid="parentos-bootstrap-failure"]')
  ), null, { timeout: 30_000 });
}

async function dismissWelcomeIntro(page) {
  const skip = page.getByTestId('parentos-welcome-intro-skip');
  await skip.waitFor({ state: 'visible', timeout: 5_000 });
  await skip.click();
  await page.waitForSelector('[data-testid="parentos-welcome-intro"]', { state: 'detached' });
}

async function captureLaunchState(page) {
  return page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="parentos-launch-trigger"]');
    return {
      title: document.title,
      bodyText: document.body?.innerText ?? '',
      loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
      failure: Boolean(document.querySelector('[data-testid="parentos-bootstrap-failure"]')),
      routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
      launch: Boolean(document.querySelector('[data-testid="parentos-launch-page"]')),
      launchLabel: trigger?.getAttribute('aria-label')?.trim() ?? '',
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function captureProductState(page) {
  return page.evaluate(() => ({
    title: document.title,
    bodyText: document.body?.innerText ?? '',
    loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
    failure: Boolean(document.querySelector('[data-testid="parentos-bootstrap-failure"]')),
    routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
    launch: Boolean(document.querySelector('[data-testid="parentos-launch-page"]')),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }));
}

async function invokeBridge(page, command, payload) {
  return page.evaluate(async ({ key, bridgeCommand, bridgePayload }) => {
    try {
      const value = await window[key].invoke(bridgeCommand, bridgePayload);
      return { ok: true, value };
    } catch (error) {
      const record = error && typeof error === 'object' ? error : { message: String(error) };
      return {
        ok: false,
        error: {
          name: record.name,
          message: record.message,
          code: record.code,
          reasonCode: record.reasonCode,
          actionHint: record.actionHint,
          source: record.source,
          details: record.details,
        },
      };
    }
  }, { key: bridgeKey, bridgeCommand: command, bridgePayload: payload });
}

async function assertNoVisibleOverflow(page, label) {
  const result = await page.evaluate((scanLabel) => {
    const viewportWidth = window.innerWidth;
    const root = document.querySelector('[data-testid="parentos-app-routed-surface"]');
    const issues = [];
    const isClippedByAncestor = (element) => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== root?.parentElement) {
        const overflowX = window.getComputedStyle(ancestor).overflowX;
        if (overflowX === 'hidden' || overflowX === 'clip') return true;
        ancestor = ancestor.parentElement;
      }
      return false;
    };
    for (const element of Array.from(root?.querySelectorAll('*') ?? [])) {
      if (!(element instanceof HTMLElement)) continue;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      if ((rect.left < -2 || rect.right > viewportWidth + 2) && !isClippedByAncestor(element)) {
        issues.push({
          tag: element.tagName,
          className: element.className,
          text: element.innerText.slice(0, 80),
          left: rect.left,
          right: rect.right,
        });
      }
    }
    return {
      label: scanLabel,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      issues,
    };
  }, label);
  assert.ok(result.documentOverflow <= 2, `${label} document overflows horizontally: ${JSON.stringify(result)}`);
  assert.deepEqual(result.issues, [], `${label} has horizontal overflow: ${JSON.stringify(result.issues)}`);
  return result;
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
  child.stderr.on('data', (chunk) => { stderrTail = `${stderrTail}${chunk}`.slice(-16384); });
  return () => ({ stdoutTail, stderrTail, exitCode: child.exitCode, signalCode: child.signalCode });
}

async function writeFailureEvidence(input) {
  const failurePath = path.join(input.evidenceDir, 'failure.json');
  let state;
  try {
    state = input.page ? await captureProductState(input.page) : null;
    if (input.page) await input.page.screenshot({ path: path.join(input.evidenceDir, 'failure.png'), fullPage: true });
  } catch (snapshotError) {
    state = { snapshotError: snapshotError instanceof Error ? snapshotError.message : String(snapshotError) };
  }
  await writeFile(failurePath, JSON.stringify({
    state,
    consoleEvents: input.consoleEvents,
    pageErrors: input.pageErrors,
    diagnostics: input.diagnostics,
    error: input.error instanceof Error ? input.error.stack || input.error.message : String(input.error),
  }, null, 2), 'utf8');
}

async function waitForCdpEndpoint(port, appProcess, diagnostics) {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Electron exited before CDP attach: ${JSON.stringify(diagnostics())}`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return endpoint;
    } catch {
      // The packaged shell is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron CDP ${endpoint}: ${JSON.stringify(diagnostics())}`);
}

async function waitForHttp(origin, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`renderer exited before readiness (${child.exitCode})`);
    try {
      const response = await fetch(origin);
      if (response.status < 500) return;
    } catch {
      // The renderer is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for renderer ${origin}`);
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
