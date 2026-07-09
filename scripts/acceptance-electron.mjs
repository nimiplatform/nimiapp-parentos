import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  const sidecarLogPath = path.join(evidenceDir, 'sidecar.jsonl');
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
      NIMI_PARENTOS_ELECTRON_SIDECAR_LOG: sidecarLogPath,
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
    const rawPathStandardCommandResults = {};
    for (const command of [
      NIMI_STANDARD_SHELL_COMMANDS['file-dialog.open'],
      NIMI_STANDARD_SHELL_COMMANDS['file-reveal.reveal'],
      NIMI_STANDARD_SHELL_COMMANDS['export.saveFile'],
    ]) {
      const result = await invokeBridge(page, command, {});
      assert.equal(result.ok, false, `${command} must fail closed in ParentOS Electron`);
      assert.equal(result.error.code, 'forbidden-renderer-access');
      assert.equal(result.error.source, 'host');
      rawPathStandardCommandResults[command] = result;
    }

    const authSessionCommandResults = await invokeForbiddenStandardCommands(page, [
      NIMI_STANDARD_SHELL_COMMANDS['auth.sessionLoad'],
      NIMI_STANDARD_SHELL_COMMANDS['auth.sessionSave'],
      NIMI_STANDARD_SHELL_COMMANDS['auth.sessionClear'],
    ]);
    const protectedRuntimeHealthResult = await invokeProtectedRuntimeHealth(page);
    assert.equal(
      protectedRuntimeHealthResult.ok,
      true,
      `Runtime health protected call must succeed through the host broker: ${JSON.stringify(protectedRuntimeHealthResult.error)}`,
    );
    const identitySpoofResult = await invokeRendererIdentitySpoof(page);
    assert.equal(identitySpoofResult.ok, false, 'renderer-supplied Runtime identity metadata must fail closed');

    const childDisplayName = `Electron Acceptance Child ${Date.now()}`;
    const childUiResult = await createAcceptanceChildThroughUi(page, childDisplayName);
    const familyResult = await expectBridgeOk(page, 'get_family', {});
    assert.ok(familyResult.value?.familyId, `get_family must return the UI-created family: ${JSON.stringify(familyResult.value)}`);
    const childrenResult = await expectBridgeOk(page, 'get_children', { familyId: familyResult.value.familyId });
    assert.ok(
      childrenResult.value.some((child) => child.displayName === childDisplayName),
      `sidecar get_children must include the UI-created child: ${JSON.stringify(childrenResult.value)}`,
    );

    const reportExportMissingGrantResult = await invokeBridge(page, 'report_export_write_grant', {
      saveTargetId: 'missing-acceptance-grant',
      base64Data: 'YQ==',
    });
    assert.equal(reportExportMissingGrantResult.ok, false, 'report export write without grant must fail closed');

    await page.setViewportSize({ width: 1365, height: 900 });
    const dentalRouteSnapshot = await navigateAndCaptureRoute(page, '/profile/dental', path.join(screenshotDir, 'desktop.png'));
    assert.match(
      dentalRouteSnapshot.bodyText,
      new RegExp(escapeRegExp(childDisplayName), 'i'),
      'desktop routed screenshot must reflect the seeded acceptance child/family, not a welcome shell',
    );
    const desktopOverflowScan = await assertNoVisibleOverflow(page, 'electron-desktop-dental');
    await page.setViewportSize({ width: 390, height: 844 });
    const dentalRouteNarrowSnapshot = await captureCurrentRouteSnapshot(page, path.join(screenshotDir, 'narrow.png'));
    assert.match(
      dentalRouteNarrowSnapshot.bodyText,
      new RegExp(escapeRegExp(childDisplayName), 'i'),
      'narrow routed screenshot must reflect the seeded acceptance child/family, not a welcome shell',
    );
    const narrowOverflowScan = await assertNoVisibleOverflow(page, 'electron-narrow-dental');
    const sidecarEvents = await readSidecarEvents(sidecarLogPath);
    const sidecarStart = sidecarEvents.find((entry) => entry.event === 'sidecar-start');
    const sidecarReady = sidecarEvents.find((entry) => entry.event === 'sidecar-ready');
    assert.ok(sidecarStart, 'Electron acceptance must record sidecar-start');
    assert.ok(sidecarReady, 'Electron acceptance must record sidecar-ready');
    assert.equal(sidecarStart.isPackaged, true, 'Electron acceptance must run the packaged app sidecar path');
    assert.match(
      String(sidecarStart.hostBin || ''),
      /resources[\\/]+bin[\\/]+parentos_host(?:\.exe)?$/u,
      'packaged sidecar path must resolve under process.resourcesPath/bin',
    );
    assert.ok(Number.isInteger(sidecarStart.pid), 'sidecar-start must record child process pid');
    assert.deepEqual(sidecarReady.ready, { ready: true, appId: 'nimi.parentos' });

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
      rawPathStandardCommandResults,
      authSessionCommandResults,
      protectedRuntimeHealthResult,
      identitySpoofResult,
      childUiResult,
      childrenResult,
      reportExportMissingGrantResult,
      dentalRouteSnapshot,
      dentalRouteNarrowSnapshot,
      overflowScan: {
        desktop: desktopOverflowScan,
        narrow: narrowOverflowScan,
      },
      consoleEvents,
      pageErrors,
      stdoutTail,
      stderrTail,
      sidecarEvents,
      screenshots: {
        desktop: path.join(screenshotDir, 'desktop.png'),
        narrow: path.join(screenshotDir, 'narrow.png'),
      },
      bootLogPath,
      sidecarLogPath,
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
      sidecarLogPath,
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

async function readSidecarEvents(sidecarLogPath) {
  const content = await readFile(sidecarLogPath, 'utf8');
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

async function createAcceptanceChildThroughUi(page, displayName) {
  const settingsUrl = await routeUrl(page, '/settings/children');
  await page.goto(settingsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForRouteReady(page, '/settings/children');
  await waitForChildrenSettingsReady(page);
  if (!await childFormVisible(page)) {
    await clickButtonByText(page, [/^\u6dfb\u52a0\u5b69\u5b50$/u, /^Add child$/i, /\u6dfb\u52a0\u5bb6\u5ead\u6210\u5458/u]);
    await page.waitForFunction(() => document.body?.innerText?.includes('\u51fa\u751f\u65e5\u671f') || document.body?.innerText?.includes('Birth date'), null, { timeout: 10_000 });
  }

  const disabledBefore = await readButtonStateByText(page, [/^\u6dfb\u52a0$/u, /^Add$/i]);
  assert.equal(disabledBefore.disabled, true, 'child submit button must be disabled before required fields are filled');

  const nameInput = await inputAfterLabel(page, [/\u59d3\u540d/u, /Name/i]);
  await setInputValue(nameInput, displayName);
  const disabledAfterName = await readButtonStateByText(page, [/^\u6dfb\u52a0$/u, /^Add$/i]);
  assert.equal(disabledAfterName.disabled, true, 'child submit button must remain disabled until birth date is filled');

  const birthDateInput = await inputAfterLabel(page, [/\u51fa\u751f\u65e5\u671f/u, /Birth date/i]);
  await clickFieldContainingInput(birthDateInput);
  await waitForButtonVisibleByText(page, [/^\u786e\u5b9a$/u, /^Confirm$/i, /^OK$/i]);
  await clickButtonByText(page, [/^\u786e\u5b9a$/u, /^Confirm$/i, /^OK$/i]);
  await waitForButtonDisabledByText(page, [/^\u6dfb\u52a0$/u, /^Add$/i], false);
  const disabledAfterBirth = await readButtonStateByText(page, [/^\u6dfb\u52a0$/u, /^Add$/i]);
  assert.equal(disabledAfterBirth.disabled, false, 'child submit button must enable after required fields are filled');

  await clickButtonByText(page, [/^\u6dfb\u52a0$/u, /^Add$/i]);
  await page.waitForFunction((expectedName) => {
    const text = document.body?.innerText ?? '';
    return text.includes(expectedName);
  }, displayName, { timeout: 30_000 });
  return {
    mode: 'playwright-ui',
    displayName,
    settingsUrl,
    disabledBefore,
    disabledAfterName,
    disabledAfterBirth,
    finalUrl: page.url(),
  };
}

async function setInputValue(locator, value) {
  await locator.evaluate((input, nextValue) => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function clickFieldContainingInput(locator) {
  const handle = await locator.evaluateHandle((input) => input.parentElement ?? input);
  const element = handle.asElement();
  assert.ok(element, 'input field container not found');
  await element.click({ timeout: 10_000 });
}

async function clickButtonByText(page, patterns) {
  const handle = await page.evaluateHandle((patternSources) => {
    const patterns = patternSources.map(({ source, flags }) => new RegExp(source, flags));
    const elements = Array.from(document.querySelectorAll('button,a,[role="button"],input,textarea,select,div,span'))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });
    const matches = elements.filter((element) => {
      const text = (element.innerText || element.textContent || '').trim();
      return patterns.some((pattern) => pattern.test(text));
    }).sort((left, right) => {
      const leftText = (left.innerText || left.textContent || '').trim();
      const rightText = (right.innerText || right.textContent || '').trim();
      return leftText.length - rightText.length;
    });
    return matches[0] ?? null;
  }, patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })));
  const element = handle.asElement();
  if (!element) {
    const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button,a,[role="button"],input,textarea,select,div,span'))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map((element) => (element.innerText || element.textContent || '').trim())
      .filter(Boolean));
    assert.fail(`button not found; visible buttons: ${JSON.stringify(buttons)}`);
  }
  await element.click({ timeout: 10_000 });
}

async function waitForButtonVisibleByText(page, patterns) {
  await page.waitForFunction((patternSources) => {
    const compiled = patternSources.map(({ source, flags }) => new RegExp(source, flags));
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    return Array.from(document.querySelectorAll('button'))
      .some((button) => visible(button) && compiled.some((pattern) => pattern.test((button.innerText || button.textContent || '').trim())));
  }, patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })), { timeout: 10_000 });
}

async function invokeForbiddenStandardCommands(page, commands) {
  const results = {};
  for (const command of commands) {
    const result = await invokeBridge(page, command, {});
    assert.equal(result.ok, false, `${command} must fail closed`);
    assert.equal(result.error.code, 'forbidden-renderer-access');
    assert.equal(result.error.source, 'host');
    results[command] = result;
  }
  return results;
}

async function invokeRendererIdentitySpoof(page) {
  return invokeBridge(page, NIMI_STANDARD_SHELL_COMMANDS['runtime.unary'], {
    methodId: '/nimi.runtime.v1.RuntimeAuditService/GetRuntimeHealth',
    requestBytesBase64: '',
    metadata: {
      appId: 'evil.parentos.spoof',
      participantId: 'evil.participant',
      callerKind: 'third-party-app',
      callerId: 'evil.caller',
      extra: {
        'x-nimi-app-id': 'evil.extra.app',
      },
    },
  });
}

async function invokeProtectedRuntimeHealth(page) {
  return invokeBridge(page, NIMI_STANDARD_SHELL_COMMANDS['runtime.unary'], {
    methodId: '/nimi.runtime.v1.RuntimeAuditService/GetRuntimeHealth',
    requestBytesBase64: '',
    metadata: {
      surfaceId: 'parentos.acceptance.runtime-health',
    },
  });
}

async function routeUrl(page, route) {
  return page.evaluate((nextRoute) => {
    const url = new URL(window.location.href);
    if (url.protocol === 'file:') {
      url.hash = nextRoute;
      return url.href;
    }
    return new URL(nextRoute, window.location.origin).href;
  }, route);
}

async function waitForRouteReady(page, route) {
  await page.waitForFunction((nextRoute) => {
    if (window.location.protocol === 'file:') {
      return window.location.hash === `#${nextRoute}`;
    }
    return window.location.pathname === nextRoute;
  }, route, { timeout: 10_000 });
  await waitForParentOSUiReady(page, 60_000);
  await enterLaunchPageIfPresent(page);
  await waitForParentOSPostLaunchReady(page, 30_000);
}

async function childFormVisible(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return (text.includes('\u51fa\u751f\u65e5\u671f') || /Birth date/i.test(text))
      && Array.from(document.querySelectorAll('input')).some((input) => {
        const rect = input.getBoundingClientRect();
        const style = window.getComputedStyle(input);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });
  });
}

async function waitForChildrenSettingsReady(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText ?? '';
    return !text.includes('Loading...')
      && !text.includes('\u52a0\u8f7d\u4e2d')
      && (text.includes('\u5b69\u5b50\u7ba1\u7406') || /Child management/i.test(text))
      && (text.includes('\u6dfb\u52a0\u5b69\u5b50') || /Add child/i.test(text) || text.includes('\u51fa\u751f\u65e5\u671f') || /Birth date/i.test(text));
  }, null, { timeout: 30_000 });
}

async function inputAfterLabel(page, patterns) {
  const handle = await page.evaluateHandle((patternSources) => {
    const compiled = patternSources.map(({ source, flags }) => new RegExp(source, flags));
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const label = Array.from(document.querySelectorAll('label'))
      .find((candidate) => visible(candidate) && compiled.some((pattern) => pattern.test(candidate.textContent || '')));
    if (!label) return null;
    const containers = [
      label,
      label.parentElement,
      label.parentElement?.nextElementSibling,
      label.parentElement?.parentElement,
    ].filter(Boolean);
    for (const container of containers) {
      const input = container.querySelector?.('input');
      if (input instanceof HTMLInputElement && visible(input)) return input;
    }
    return null;
  }, patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })));
  const element = handle.asElement();
  assert.ok(element, `input not found for labels: ${patterns.map((pattern) => pattern.toString()).join(', ')}`);
  return element;
}

async function readButtonStateByText(page, patterns) {
  const state = await page.evaluate((patternSources) => {
    const compiled = patternSources.map(({ source, flags }) => new RegExp(source, flags));
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter((button) => visible(button) && compiled.some((pattern) => pattern.test((button.innerText || button.textContent || '').trim())))
      .sort((left, right) => {
        const leftText = (left.innerText || left.textContent || '').trim();
        const rightText = (right.innerText || right.textContent || '').trim();
        return leftText.length - rightText.length;
      });
    const button = buttons[0];
    if (!button) return null;
    return {
      text: (button.innerText || button.textContent || '').trim(),
      disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
    };
  }, patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })));
  assert.ok(state, `button not found for state check: ${patterns.map((pattern) => pattern.toString()).join(', ')}`);
  return state;
}

async function waitForButtonDisabledByText(page, patterns, expectedDisabled) {
  await page.waitForFunction(({ patternSources, expected }) => {
    const compiled = patternSources.map(({ source, flags }) => new RegExp(source, flags));
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter((button) => visible(button) && compiled.some((pattern) => pattern.test((button.innerText || button.textContent || '').trim())))
      .sort((left, right) => {
        const leftText = (left.innerText || left.textContent || '').trim();
        const rightText = (right.innerText || right.textContent || '').trim();
        return leftText.length - rightText.length;
      });
    const button = buttons[0];
    if (!button) return false;
    const disabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
    return disabled === expected;
  }, {
    patternSources: patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })),
    expected: expectedDisabled,
  }, { timeout: 10_000 });
}

async function assertNoVisibleOverflow(page, label) {
  const overflowScan = await page.evaluate((scanLabel) => {
    const viewportWidth = window.innerWidth;
    const root = document.querySelector('[data-testid="shell-main-drag-region"]') ?? document.body;
    const issues = [];
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const selectorFor = (element) => {
      if (!(element instanceof HTMLElement)) return element.tagName.toLowerCase();
      const testId = element.getAttribute('data-testid');
      if (testId) return `${element.tagName.toLowerCase()}[data-testid="${testId}"]`;
      const scrollScope = element.getAttribute('data-acceptance-scroll-x');
      if (scrollScope) return `${element.tagName.toLowerCase()}[data-acceptance-scroll-x="${scrollScope}"]`;
      const text = (element.innerText || element.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 80);
      return `${element.tagName.toLowerCase()}${text ? `:${text}` : ''}`;
    };
    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (!(element instanceof HTMLElement)) continue;
      if (!isVisible(element)) continue;
      if (element.closest('[data-acceptance-scroll-x]')) continue;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.left < -2 || rect.right > viewportWidth + 2) {
        issues.push({
          type: 'viewport-overflow-x',
          selector: selectorFor(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
      const clipsText = element.scrollWidth > element.clientWidth + 1
        && style.textOverflow !== 'ellipsis'
        && !['auto', 'scroll'].includes(style.overflowX);
      if (clipsText) {
        issues.push({
          type: 'text-overflow-x',
          selector: selectorFor(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        });
      }
    }
    return {
      label: scanLabel,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      issueCount: issues.length,
      issues: issues.slice(0, 20),
    };
  }, label);
  assert.equal(overflowScan.issueCount, 0, `${label} has visible overflow: ${JSON.stringify(overflowScan.issues)}`);
  return overflowScan;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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

async function captureCurrentRouteSnapshot(page, screenshotPath) {
  await waitForParentOSUiReady(page, 60_000);
  await waitForParentOSPostLaunchReady(page, 30_000);
  const snapshot = await page.evaluate(() => ({
    url: window.location.href,
    bodyText: document.body?.innerText?.slice(0, 2000) ?? '',
    routed: Boolean(document.querySelector('[data-testid="parentos-app-routed-surface"]')),
    alertText: document.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }));
  assert.equal(snapshot.routed, true, 'current route must remain inside ParentOS routed surface');
  assert.equal(snapshot.alertText, '', `current route must not render alert: ${snapshot.alertText}`);
  assert.match(snapshot.url, /\/profile\/dental|#\/profile\/dental/u, 'current route must remain on dental route');
  assert.match(snapshot.bodyText, /口腔档案|牙齿状态总览|FDI|Dental/i, 'current route must render real dental UI text');
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
