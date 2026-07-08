import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { NIMI_STANDARD_SHELL_COMMANDS } from '@nimiplatform/kit/shell/capabilities';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const planRef = '20260707-tauri-electron-shell-refactory';
const evidenceRoot = path.join(repoRoot, '.nimi', 'local', 'acceptance', planRef, 'electron-live');

const appExe = path.join(repoRoot, 'dist-electron', 'win-unpacked', process.platform === 'win32' ? 'ParentOS.exe' : 'ParentOS');
const bridgeKey = '__NIMI_ELECTRON_RUNTIME__';

async function main() {
  await access(appExe);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const evidenceDir = path.join(evidenceRoot, runId);
  const storageRoot = path.join(evidenceDir, 'storage');
  const screenshotDir = path.join(evidenceDir, 'screenshots');
  const bootLogPath = path.join(evidenceDir, 'boot.log');
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(path.join(storageRoot, 'data'), { recursive: true });
  await mkdir(path.join(storageRoot, 'cache'), { recursive: true });
  await mkdir(path.join(storageRoot, 'tmp'), { recursive: true });

  const port = Number(process.env.NIMI_PARENTOS_ELECTRON_ACCEPTANCE_CDP_PORT || await reservePort());
  const useEnvStorageRoots = process.env.NIMI_PARENTOS_ELECTRON_ACCEPTANCE_ALLOW_ENV_STORAGE_ROOTS === '1';
  const storageEnv = useEnvStorageRoots
    ? {
        NIMI_PARENTOS_ELECTRON_DURABLE_DATA_ROOT: path.join(storageRoot, 'data'),
        NIMI_PARENTOS_ELECTRON_CACHE_ROOT: path.join(storageRoot, 'cache'),
        NIMI_PARENTOS_ELECTRON_TEMP_ROOT: path.join(storageRoot, 'tmp'),
      }
    : {};
  const acceptanceDeveloperRegistration = process.env.NIMI_PARENTOS_ELECTRON_DEVELOPER_REGISTRATION || '1';
  const appProcess = spawn(appExe, [`--remote-debugging-port=${port}`], {
    env: {
      ...process.env,
      ...storageEnv,
      NIMI_PARENTOS_ELECTRON_REMOTE_DEBUGGING_PORT: String(port),
      NIMI_PARENTOS_ELECTRON_BOOT_LOG: bootLogPath,
      NIMI_PARENTOS_ELECTRON_DEVELOPER_REGISTRATION: acceptanceDeveloperRegistration,
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  appProcess.stdout.setEncoding('utf8');
  appProcess.stderr.setEncoding('utf8');
  let stdoutTail = '';
  let stderrTail = '';
  appProcess.stdout.on('data', (chunk) => {
    stdoutTail = `${stdoutTail}${chunk}`.slice(-8192);
  });
  appProcess.stderr.on('data', (chunk) => {
    stderrTail = `${stderrTail}${chunk}`.slice(-8192);
  });

  let browser;
  const consoleEvents = [];
  const consoleCaptureTasks = [];
  const pageErrors = [];
  let latestPage;
  let tokenExchangeResult = null;
  try {
    const cdpEndpoint = await waitForCdpEndpoint(port, appProcess, () => ({ stdoutTail, stderrTail }));
    browser = await chromium.connectOverCDP(cdpEndpoint);
    const page = await waitForAppPage(browser);
    latestPage = page;
    page.on('console', (message) => {
      const captureTask = Promise.all(message.args().map(async (arg) => {
        try {
          return await arg.jsonValue();
        } catch (error) {
          return {
            unserializable: true,
            text: String(arg),
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })).then((args) => {
        consoleEvents.push({
          type: message.type(),
          text: message.text(),
          location: message.location(),
          args,
        });
      });
      consoleCaptureTasks.push(captureTask);
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error instanceof Error ? error.stack || error.message : String(error));
    });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await page.waitForFunction((key) => Boolean(window[key]?.invoke), bridgeKey, { timeout: 30_000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('#root');
      return Boolean(root && root.childElementCount > 0);
    }, null, { timeout: 30_000 });
    await waitForParentOSUiReady(page, 60_000);
    const uiStateBeforeInteraction = await readParentOSUiState(page);
    assert.equal(uiStateBeforeInteraction.loading, false, 'Electron UI must leave bootstrap loading state');
    assert.equal(uiStateBeforeInteraction.alertText, '', `Electron UI bootstrap alert: ${uiStateBeforeInteraction.alertText}`);
    await enterLaunchPageIfPresent(page);
    await waitForParentOSPostLaunchReady(page, 30_000);
    await skipWelcomeIntroIfPresent(page);

    await page.setViewportSize({ width: 1365, height: 900 });
    await page.screenshot({ path: path.join(screenshotDir, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotDir, 'narrow.png'), fullPage: true });

    const domSnapshot = await page.evaluate((key) => ({
      title: document.title,
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 2000) ?? '',
      bridgeAvailable: Boolean(window[key]?.invoke),
      bridgeKeys: Object.keys(window[key] ?? {}),
      bridgeInvokeType: typeof window[key]?.invoke,
      bridgeListenType: typeof window[key]?.listen,
      electronTestAvailable: Boolean(window.__NIMI_ELECTRON_TEST__?.invoke),
      tauriAvailable: Boolean(window.__TAURI__?.core?.invoke),
      rootChildCount: document.querySelector('#root')?.childElementCount ?? 0,
      uiState: {
        loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
        launch: Boolean(document.querySelector('[data-testid="parentos-launch-page"]')),
        login: Boolean(document.querySelector('[data-testid="parentos-login-page"]')),
        routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
        shell: Boolean(document.querySelector('[data-testid="shell-main-drag-region"]')),
        alertText: document.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }), bridgeKey);
    assert.equal(domSnapshot.bridgeAvailable, true, 'Electron preload bridge must be available');
    assert.ok(domSnapshot.rootChildCount > 0, 'Electron React root must contain mounted content');
    assert.ok(domSnapshot.bodyText.trim().length > 0, 'Electron body text must not be blank');
    assert.equal(domSnapshot.uiState.loading, false, 'Electron UI must not be stuck in bootstrap loading');
    assert.equal(domSnapshot.uiState.alertText, '', `Electron UI must not render bootstrap alert: ${domSnapshot.uiState.alertText}`);
    assert.ok(
      domSnapshot.uiState.login || domSnapshot.uiState.routed,
      'Electron UI must reach login or main shell after launch interaction',
    );
    assert.match(domSnapshot.title, /ParentOS|成长底稿/i);

    tokenExchangeResult = await invokeBridge(page, NIMI_STANDARD_SHELL_COMMANDS['oauth.tokenExchange'], {
      provider: 'acceptance',
      code: 'must-not-exchange-in-parentos',
    });
    assert.equal(tokenExchangeResult.ok, false, 'oauth.tokenExchange must fail closed');
    assert.equal(tokenExchangeResult.error.code, 'forbidden-renderer-access');
    assert.equal(
      tokenExchangeResult.error.source,
      'host',
      `oauth.tokenExchange must be rejected by host policy, got ${JSON.stringify(tokenExchangeResult.error)}`,
    );

    const timestamp = new Date().toISOString();
    const familyId = `fam_electron_${Date.now()}`;
    const childId = `child_electron_${Date.now()}`;
    await expectBridgeOk(page, 'db_init', { subjectUserId: null });
    await expectBridgeOk(page, 'create_family', {
      familyId,
      displayName: 'Electron Acceptance Family',
      now: timestamp,
    });
    await expectBridgeOk(page, 'create_child', {
      childId,
      familyId,
      displayName: '小明',
      gender: 'male',
      birthDate: '2020-01-02',
      birthWeightKg: 3.2,
      birthHeightCm: 50,
      birthHeadCircCm: null,
      avatarPath: null,
      nurtureMode: 'balanced',
      nurtureModeOverrides: null,
      allergies: null,
      medicalNotes: null,
      recorderProfiles: null,
      now: timestamp,
    });
    await expectBridgeOk(page, 'set_app_setting', { key: 'activeChildId', value: childId, now: timestamp });
    const childrenResult = await expectBridgeOk(page, 'get_children', { familyId });
    assert.equal(childrenResult.value.length, 1);
    assert.equal(childrenResult.value[0].childId, childId);
    assert.equal(childrenResult.value[0].displayName, '小明');

    const reportExportMissingGrantResult = await invokeBridge(page, 'report_export_write_grant', {
      saveTargetId: 'missing-acceptance-grant',
      base64Data: 'YQ==',
    });
    assert.equal(reportExportMissingGrantResult.ok, false, 'report export write without grant must fail closed');

    const dentalRouteSnapshot = await navigateAndCaptureRoute(page, '/profile/dental', path.join(screenshotDir, 'dental.png'));

    await Promise.allSettled(consoleCaptureTasks);

    await writeFile(path.join(evidenceDir, 'evidence.json'), JSON.stringify({
      appExe,
      cdpEndpoint,
      remoteDebuggingPort: port,
      storageProjectionMode: useEnvStorageRoots ? 'test-env-roots' : 'runtime-get-app-storage',
      developerRegistrationMode: acceptanceDeveloperRegistration === '1' || acceptanceDeveloperRegistration.toLowerCase() === 'true'
        ? 'acceptance-dev-registration'
        : 'packaged-production-default',
      domSnapshot,
      tokenExchangeResult,
      childrenResult,
      reportExportMissingGrantResult,
      dentalRouteSnapshot,
      consoleEvents,
      pageErrors,
      stdoutTail,
      stderrTail,
      screenshots: {
        desktop: path.join(screenshotDir, 'desktop.png'),
        narrow: path.join(screenshotDir, 'narrow.png'),
      },
      bootLogPath,
    }, null, 2), 'utf8');

    assert.deepEqual(pageErrors, [], 'Electron page must not emit page errors');
    const severeConsole = consoleEvents.filter((entry) => entry.type === 'error');
    assert.deepEqual(severeConsole, [], 'Electron page must not emit console.error events');
    process.stdout.write(`Electron acceptance evidence: ${path.join(evidenceDir, 'evidence.json')}\n`);
  } catch (error) {
    await Promise.allSettled(consoleCaptureTasks);
    let failureDomSnapshot = null;
    if (latestPage) {
      try {
        failureDomSnapshot = await latestPage.evaluate((key) => ({
          title: document.title,
          readyState: document.readyState,
          bodyText: document.body?.innerText?.slice(0, 4000) ?? '',
          bridgeAvailable: Boolean(window[key]?.invoke),
          bridgeKeys: Object.keys(window[key] ?? {}),
          bridgeInvokeType: typeof window[key]?.invoke,
          bridgeListenType: typeof window[key]?.listen,
          electronTestAvailable: Boolean(window.__NIMI_ELECTRON_TEST__?.invoke),
          tauriAvailable: Boolean(window.__TAURI__?.core?.invoke),
          rootChildCount: document.querySelector('#root')?.childElementCount ?? 0,
          uiState: {
            loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
            launch: Boolean(document.querySelector('[data-testid="parentos-launch-page"]')),
            login: Boolean(document.querySelector('[data-testid="parentos-login-page"]')),
            routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
            shell: Boolean(document.querySelector('[data-testid="shell-main-drag-region"]')),
            alertText: document.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
          },
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }), bridgeKey);
        await latestPage.screenshot({ path: path.join(screenshotDir, 'failure.png'), fullPage: true });
      } catch (snapshotError) {
        failureDomSnapshot = {
          snapshotError: snapshotError instanceof Error
            ? snapshotError.stack || snapshotError.message
            : String(snapshotError),
        };
      }
    }
    await writeFile(path.join(evidenceDir, 'failure.json'), JSON.stringify({
      appExe,
      remoteDebuggingPort: port,
      storageProjectionMode: useEnvStorageRoots ? 'test-env-roots' : 'runtime-get-app-storage',
      developerRegistrationMode: acceptanceDeveloperRegistration === '1' || acceptanceDeveloperRegistration.toLowerCase() === 'true'
        ? 'acceptance-dev-registration'
        : 'packaged-production-default',
      exitCode: appProcess.exitCode,
      signalCode: appProcess.signalCode,
      stdoutTail,
      stderrTail,
      bootLogPath,
      failureDomSnapshot,
      tokenExchangeResult,
      consoleEvents,
      pageErrors,
      error: error instanceof Error ? error.stack || error.message : String(error),
    }, null, 2), 'utf8');
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    if (appProcess.exitCode === null) {
      const exited = once(appProcess, 'exit');
      appProcess.kill();
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    }
  }
}

async function invokeBridge(page, command, payload) {
  return page.evaluate(async ({ key, command: bridgeCommand, payload: bridgePayload }) => {
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
  }, { key: bridgeKey, command, payload });
}

async function navigateAndCaptureRoute(page, route, screenshotPath) {
  const protocol = await page.evaluate(() => window.location.protocol);
  if (protocol === 'file:') {
    await page.evaluate((nextRoute) => {
      window.location.hash = nextRoute;
    }, route);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  } else {
    const targetUrl = await page.evaluate((nextRoute) => new URL(nextRoute, window.location.origin).href, route);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await page.waitForFunction((nextRoute) => {
    if (window.location.protocol === 'file:') {
      return window.location.hash === `#${nextRoute}`;
    }
    return window.location.pathname === nextRoute;
  }, route, { timeout: 10_000 });
  await waitForParentOSUiReady(page, 60_000);
  await enterLaunchPageIfPresent(page);
  await waitForParentOSPostLaunchReady(page, 30_000);
  await page.waitForFunction(() => {
    const text = document.body?.innerText ?? '';
    return !text.includes('Loading...') && !text.includes('加载中');
  }, null, { timeout: 30_000 });
  const snapshot = await page.evaluate(() => ({
    url: window.location.href,
    bodyText: document.body?.innerText?.slice(0, 2000) ?? '',
    routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
    alertText: document.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
  }));
  assert.equal(snapshot.routed, true, 'route must remain inside ParentOS routed surface');
  assert.equal(snapshot.alertText, '', `route must not render alert: ${snapshot.alertText}`);
  assert.match(snapshot.bodyText, /口腔档案|Dental/i, 'dental route must render real dental UI text');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { ...snapshot, screenshot: screenshotPath };
}

async function expectBridgeOk(page, command, payload) {
  const result = await invokeBridge(page, command, payload);
  assert.equal(result.ok, true, `${command} failed: ${JSON.stringify(result.error)}`);
  return result;
}

async function waitForParentOSUiReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    const loading = document.querySelector('[data-testid="parentos-bootstrap-loading"]');
    const alert = document.querySelector('[role="alert"]');
    const launch = document.querySelector('[data-testid="parentos-launch-page"]');
    const login = document.querySelector('[data-testid="parentos-login-page"]');
    const routed = document.querySelector('[data-testid="parentos-app-routed-surface"]');
    return !loading && Boolean(alert || launch || login || routed);
  }, null, { timeout: timeoutMs });
}

async function waitForParentOSPostLaunchReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    const loading = document.querySelector('[data-testid="parentos-bootstrap-loading"]');
    const alert = document.querySelector('[role="alert"]');
    const launch = document.querySelector('[data-testid="parentos-launch-page"]');
    const login = document.querySelector('[data-testid="parentos-login-page"]');
    const routed = document.querySelector('[data-testid="parentos-app-routed-surface"]');
    return !loading && !launch && Boolean(alert || login || routed);
  }, null, { timeout: timeoutMs });
}

async function readParentOSUiState(page) {
  return page.evaluate(() => ({
    loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
    launch: Boolean(document.querySelector('[data-testid="parentos-launch-page"]')),
    login: Boolean(document.querySelector('[data-testid="parentos-login-page"]')),
    routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
    shell: Boolean(document.querySelector('[data-testid="shell-main-drag-region"]')),
    alertText: document.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
  }));
}

async function enterLaunchPageIfPresent(page) {
  const trigger = page.locator('[data-testid="parentos-launch-trigger"]');
  if (await trigger.count() === 0) {
    return;
  }
  await trigger.first().click();
  await page.waitForFunction(() => {
    const launch = document.querySelector('[data-testid="parentos-launch-page"]');
    const login = document.querySelector('[data-testid="parentos-login-page"]');
    const routed = document.querySelector('[data-testid="parentos-app-routed-surface"]');
    const alert = document.querySelector('[role="alert"]');
    return !launch && Boolean(login || routed || alert);
  }, null, { timeout: 30_000 });
}

async function skipWelcomeIntroIfPresent(page) {
  const intro = page.locator('[data-testid="parentos-welcome-intro"]');
  await intro.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  if (await intro.count() === 0 || !(await intro.first().isVisible().catch(() => false))) {
    return;
  }
  await page.locator('[data-testid="parentos-welcome-intro-skip"]').first().click();
  await page.waitForFunction(() => {
    return !document.querySelector('[data-testid="parentos-welcome-intro"]');
  }, null, { timeout: 10_000 });
}

async function waitForAppPage(browser) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const pages = context.pages().filter((page) => !page.url().startsWith('devtools://'));
      if (pages.length > 0) {
        return pages[0];
      }
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for Electron app page over CDP');
}

async function waitForCdpEndpoint(port, appProcess, diagnostics) {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Electron app exited before CDP attach: ${appProcess.exitCode}`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) {
        return endpoint;
      }
    } catch {
      // Keep polling until the remote debugging endpoint is ready.
    }
    await delay(250);
  }
  const detail = diagnostics();
  throw new Error(
    `Timed out waiting for Electron CDP endpoint ${endpoint}\nstdout:\n${detail.stdoutTail}\nstderr:\n${detail.stderrTail}`,
  );
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('failed to reserve TCP port'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
