// Supplementary UI posture observation: enter the product and open the AI
// settings surface via in-app hash navigation (no reload), then verify the
// Nimi access posture card copy and machine-code folding.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const evidenceRoot = path.join(
  repoRoot,
  '.nimi',
  'local',
  'acceptance',
  '2026-08-08-app-access-migration',
  'parentos-electron-ui-posture',
);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort() {
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

async function postJson(endpoint, route, body) {
  const response = await fetch(`${endpoint}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function main() {
  const evidenceDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/gu, '-'));
  await mkdir(evidenceDir, { recursive: true });
  const evidence = { observations: {} };

  const presence = JSON.parse(await readFile(
    path.join(process.env.HOME, '.nimi/run/desktop/local-development/presence.v1.json'),
    'utf8',
  ));
  const endpoint = presence.endpoint;
  const cdpPort = await reservePort();
  const start = await postJson(endpoint, '/v1/start', {
    schemaVersion: 1,
    appId: 'nimi.parentos',
    projectRoot: repoRoot,
    shell: 'electron',
    cdpPort,
  });
  const runId = start?.run?.runId;
  assert.ok(runId, `supervised run must start: ${JSON.stringify(start)}`);

  let browser;
  try {
    let state = '';
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const status = await postJson(endpoint, '/v1/status', { schemaVersion: 1, runId });
      state = status?.run?.state || '';
      if (state === 'running') break;
      if (['denied', 'failed', 'revoked', 'stopped', 'cleanup-failed'].includes(state)) {
        throw new Error(`supervised run terminated early: ${JSON.stringify(status?.run)}`);
      }
      await delay(1_500);
    }
    assert.equal(state, 'running', 'supervised host must be running');

    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const page = browser.contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith('http://127.0.0.1:1426'));
    assert.ok(page, 'CDP must attach only to the ParentOS renderer target');

    await page.waitForFunction(() => Boolean(window.__NIMI_ELECTRON_RUNTIME__?.invoke), null, { timeout: 30_000 });
    await page.getByTestId('parentos-launch-trigger').click();
    await page.waitForSelector('[data-testid="parentos-app-routed-surface"]', { timeout: 30_000 });
    const skip = page.getByTestId('parentos-welcome-intro-skip');
    await skip.waitFor({ state: 'visible', timeout: 8_000 }).then(() => skip.click())
      .then(() => page.waitForSelector('[data-testid="parentos-welcome-intro"]', { state: 'detached', timeout: 8_000 }))
      .catch(() => undefined);

    // In-app SPA navigation (BrowserRouter in dev): pushState + popstate is
    // how react-router picks up programmatic location changes.
    await page.evaluate(() => {
      history.pushState(null, '', '/settings/ai');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await delay(3_500);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const detailsText = await page.evaluate(() => (
      Array.from(document.querySelectorAll('details')).map((node) => node.innerText).join('\n')
    ));
    evidence.observations.aiSettings = {
      showsAccessCard: bodyText.includes('Nimi 访问'),
      showsConnected: bodyText.includes('已连接'),
      showsDeclaredCapability: bodyText.includes('text.generate'),
      showsLocalRoute: bodyText.includes('本地路由'),
      showsFeatureGapInfo: bodyText.includes('暂不可用'),
      machineCodeOutsideDetails: /local-app-|runtime-service-|protected-carrier|session-bound/u
        .test(bodyText.replace(/技术详情[\s\S]*/u, '')),
      detailsText,
    };
    await page.screenshot({ path: path.join(evidenceDir, 'ai-settings.png'), fullPage: true });

    // Account card on the settings home: handle/displayName, no email claim.
    await page.evaluate(() => {
      history.pushState(null, '', '/settings');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await delay(2_500);
    const settingsText = await page.evaluate(() => document.body.innerText);
    evidence.observations.settingsHome = {
      showsHalliday: settingsText.includes('Halliday'),
      showsHandle: settingsText.includes('@halliday'),
      managedByDesktopCopy: settingsText.includes('Nimi Desktop'),
    };
    await page.screenshot({ path: path.join(evidenceDir, 'settings-home.png'), fullPage: true });
  } finally {
    await browser?.close().catch(() => undefined);
    await postJson(endpoint, '/v1/cancel', { schemaVersion: 1, runId }).catch(() => undefined);
  }

  const evidencePath = path.join(evidenceDir, 'journey-evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`UI posture journey evidence: ${evidencePath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
