import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
  '2026-07-10-third-party-installed-app-reference-hardcut',
  'parentos-tauri',
);
const bridgeKey = '__NIMI_TAURI_RUNTIME__';

async function main() {
  const evidenceDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/gu, '-'));
  const screenshotDir = path.join(evidenceDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });

  const port = Number(process.env.NIMI_PARENTOS_TAURI_ACCEPTANCE_CDP_PORT || await reservePort());
  const webviewArgs = `--remote-debugging-port=${port} --lang=zh-CN`;
  const appProcess = spawn(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', [
    'pnpm',
    'dev:shell',
    '--',
    '--shell',
    'tauri',
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: webviewArgs,
    },
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

    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 });
    await page.waitForFunction((key) => Boolean(window[key]?.invoke), bridgeKey, { timeout: 60_000 });
    await waitForProtectedFailure(page);

    const desktopState = await captureProtectedState(page);
    assertProtectedState(desktopState, 'Tauri');
    await page.setViewportSize({ width: 1365, height: 900 });
    const desktopOverflow = await assertNoVisibleOverflow(page, 'tauri-desktop');
    const desktopScreenshot = path.join(screenshotDir, 'desktop.png');
    await page.screenshot({ path: desktopScreenshot, fullPage: true });

    await page.getByTestId('parentos-protected-session-retry').click();
    await waitForProtectedFailure(page);
    const retriedState = await captureProtectedState(page);
    assertProtectedState(retriedState, 'Tauri retry');

    const appHostBootstrapResult = await invokeBridge(
      page,
      'nimi.app-host.bootstrap',
      {},
    );
    assert.equal(appHostBootstrapResult.ok, true, 'Tauri dev host must bootstrap through Desktop supervision');
    assert.equal(appHostBootstrapResult.value?.state, 'ready', 'Tauri dev host must report ready');
    assert.equal(
      appHostBootstrapResult.value?.trustClass,
      'local-development',
      'Tauri dev host must remain in the non-production trust class',
    );
    assert.equal(appHostBootstrapResult.value?.appId, 'nimi.parentos', 'Tauri dev host must bind ParentOS app id');
    assert.equal(
      typeof appHostBootstrapResult.value?.bootstrapArtifactId,
      'string',
      'Tauri dev host must receive a Runtime-owned bootstrap artifact id',
    );

    const artifactResult = await invokeBridge(
      page,
      NIMI_STANDARD_SHELL_COMMANDS['artifacts.readRuntimeBytes'],
      { payload: { artifactId: appHostBootstrapResult.value.bootstrapArtifactId } },
    );
    assert.equal(artifactResult.ok, true, 'Tauri dev host must read the admitted Runtime bootstrap artifact');
    assert.equal(
      artifactResult.value?.sizeBytes > 0,
      true,
      'Tauri dev bootstrap artifact must contain real Runtime bytes',
    );

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
    assert.equal(directRuntimeResult.ok, false, 'Tauri direct Runtime command must not be registered');

    const appDomainResult = await invokeBridge(page, 'get_family', {});
    assert.equal(appDomainResult.ok, false, 'Tauri app-domain data must remain unregistered before protected admission');

    const accountControlResults = {};
    for (const command of [
      'auth_session_load',
      'auth_session_save',
      'auth_session_clear',
    ]) {
      assert.ok(command.length > 0, 'Tauri account-control probe command must be concrete');
      const result = await invokeBridge(page, command, {});
      assert.equal(result.ok, false, `${command} must fail closed in ParentOS Tauri`);
      accountControlResults[command] = result;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const narrowState = await captureProtectedState(page);
    assertProtectedState(narrowState, 'Tauri narrow');
    const narrowOverflow = await assertNoVisibleOverflow(page, 'tauri-narrow');
    const narrowScreenshot = path.join(screenshotDir, 'narrow.png');
    await page.screenshot({ path: narrowScreenshot, fullPage: true });

    await delay(250);
    assert.deepEqual(pageErrors, [], 'Tauri page must not emit page errors');
    assert.deepEqual(
      consoleEvents.filter((event) => event.type === 'error'),
      [],
      'Tauri page must not emit console.error events',
    );

    const evidencePath = path.join(evidenceDir, 'evidence.json');
    await writeFile(evidencePath, JSON.stringify({
      shell: 'tauri',
      cdpEndpoint,
      webviewArgs,
      desktopState,
      retriedState,
      narrowState,
      appHostBootstrapResult,
      artifactResult,
      directRuntimeResult,
      appDomainResult,
      accountControlResults,
      overflowScan: { desktop: desktopOverflow, narrow: narrowOverflow },
      consoleEvents,
      pageErrors,
      diagnostics: diagnostics(),
      screenshots: { desktop: desktopScreenshot, narrow: narrowScreenshot },
    }, null, 2), 'utf8');
    process.stdout.write(`Tauri protected-state acceptance: ${evidencePath}\n`);
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
  }
}

function assertProtectedState(state, label) {
  assert.equal(state.loading, false, `${label} must leave bootstrap loading`);
  assert.equal(state.protectedState, 'capability-unavailable', `${label} must expose the transitional capability state`);
  assert.equal(state.localDataDisabled, true, `${label} must keep local data disabled`);
  assert.equal(state.retryEnabled, true, `${label} retry must remain usable`);
  assert.equal(state.routed, false, `${label} must not render product routes`);
  assert.equal(state.launch, false, `${label} must not render the old launch screen`);
  assert.equal(state.alertRole, 'alert', `${label} protected failure must be announced accessibly`);
  assert.match(state.bodyText, /ParentOS 受保护访问尚未开放/u, `${label} must render readable Chinese failure copy`);
  assert.match(state.bodyText, /本地数据已锁定/u, `${label} must render the locked-data action`);
  assert.match(state.alertText, /parentos-protected-operation-set-not-admitted/u, `${label} must expose the exact denial reason`);
  assert.doesNotMatch(state.bodyText, /�/u, `${label} must not contain replacement-glyph text`);
}

async function waitForProtectedFailure(page) {
  await page.waitForFunction(() => {
    const failure = document.querySelector('[data-testid="parentos-protected-session-failure"]');
    const loading = document.querySelector('[data-testid="parentos-bootstrap-loading"]');
    return Boolean(failure) && !loading;
  }, null, { timeout: 60_000 });
}

async function captureProtectedState(page) {
  return page.evaluate(() => {
    const failure = document.querySelector('[data-testid="parentos-protected-session-failure"]');
    const localData = document.querySelector('[data-testid="parentos-local-data-locked"]');
    const retry = document.querySelector('[data-testid="parentos-protected-session-retry"]');
    const alert = document.querySelector('[role="alert"]');
    return {
      title: document.title,
      bodyText: document.body?.innerText ?? '',
      loading: Boolean(document.querySelector('[data-testid="parentos-bootstrap-loading"]')),
      protectedState: failure?.getAttribute('data-protected-state') ?? '',
      localDataDisabled: localData instanceof HTMLButtonElement && localData.disabled,
      retryEnabled: retry instanceof HTMLButtonElement && !retry.disabled,
      alertRole: alert?.getAttribute('role') ?? '',
      alertText: alert?.textContent?.trim() ?? '',
      routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
      launch: Boolean(document.querySelector('[data-testid="parentos-launch-page"]')),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
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
    const root = document.querySelector('[data-testid="parentos-protected-session-failure"]');
    const issues = [];
    for (const element of Array.from(root?.querySelectorAll('*') ?? [])) {
      if (!(element instanceof HTMLElement)) continue;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      if (rect.left < -2 || rect.right > viewportWidth + 2) {
        issues.push({ tag: element.tagName, text: element.innerText.slice(0, 80), left: rect.left, right: rect.right });
      }
    }
    return { label: scanLabel, viewport: { width: window.innerWidth, height: window.innerHeight }, issues };
  }, label);
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
    state = input.page ? await captureProtectedState(input.page) : null;
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
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Tauri exited before CDP attach: ${JSON.stringify(diagnostics())}`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return endpoint;
    } catch {
      // The Tauri/WebView2 shell is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Tauri CDP ${endpoint}: ${JSON.stringify(diagnostics())}`);
}

async function waitForAppPage(browser) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => (
        !candidate.url().startsWith('devtools://')
        && !candidate.url().startsWith('chrome://')
      ));
      if (page) return page;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the Tauri app page');
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
