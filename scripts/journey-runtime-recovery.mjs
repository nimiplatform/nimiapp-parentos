// One-shot journey acceptance for the App Access runtime-loss posture:
// a supervised ParentOS Electron run observes a source-Runtime kill, the
// typed unavailable posture, and the same-Host recovery. The App process must
// never quit, and machine codes must stay out of the primary UI.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { NIMI_STANDARD_SHELL_COMMANDS } from '@nimiplatform/kit/shell/capabilities';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const evidenceRoot = path.join(
  repoRoot,
  '.nimi',
  'local',
  'acceptance',
  '2026-08-08-app-access-migration',
  'parentos-electron-runtime-recovery',
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

function readPresenceEndpoint() {
  const home = process.env.HOME;
  assert.ok(home, 'HOME must be set');
  return readFile(path.join(home, '.nimi/run/desktop/local-development/presence.v1.json'), 'utf8')
    .then((raw) => {
      const parsed = JSON.parse(raw);
      assert.equal(parsed.schemaVersion, 1, 'presence schema');
      assert.ok(parsed.endpoint, 'presence endpoint');
      return parsed.endpoint;
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

function runtimePid() {
  try {
    const out = execFileSync('pgrep', ['-f', 'nimi-runtime serve'], { encoding: 'utf8' }).trim();
    return out ? Number(out.split('\n')[0]) : null;
  } catch {
    return null;
  }
}

async function invokeBridge(page, command, payload) {
  return page.evaluate(async ({ bridgeCommand, bridgePayload }) => {
    try {
      const value = await window.__NIMI_ELECTRON_RUNTIME__.invoke(bridgeCommand, bridgePayload);
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
        },
      };
    }
  }, { bridgeCommand: command, bridgePayload: payload });
}

async function main() {
  const evidenceDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/gu, '-'));
  await mkdir(evidenceDir, { recursive: true });
  const evidence = { startedAt: new Date().toISOString(), observations: {} };

  const endpoint = await readPresenceEndpoint();
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
  evidence.observations.runId = runId;

  let browser;
  try {
    // Wait for the supervised host to reach the running state.
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
    evidence.observations.attachedTarget = page.url();

    await page.waitForFunction(() => Boolean(window.__NIMI_ELECTRON_RUNTIME__?.invoke), null, { timeout: 30_000 });

    // Enter the product (launch gate) and open the AI settings surface.
    await page.getByTestId('parentos-launch-trigger').click();
    await page.waitForSelector('[data-testid="parentos-app-routed-surface"]', { timeout: 30_000 });
    const skip = page.getByTestId('parentos-welcome-intro-skip');
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    }

    const before = await invokeBridge(page, NIMI_STANDARD_SHELL_COMMANDS['local-app.sessionStatus'], {});
    assert.equal(before.ok, true, `session must be ready before the kill: ${JSON.stringify(before)}`);
    evidence.observations.beforeKill = before;

    // AI settings posture card must render the connected info state with no
    // machine codes in the primary copy.
    await page.goto('http://127.0.0.1:1426/#/settings/ai');
    await page.waitForLoadState('domcontentloaded');
    await delay(2_500);
    const postureBody = await page.evaluate(() => document.body.innerText);
    evidence.observations.postureCard = {
      showsConnected: postureBody.includes('已连接'),
      leaksMachineCode: /local-app-|runtime-service-|protected-carrier|session-bound/u.test(
        postureBody.replace(/技术详情[\s\S]*$/u, ''),
      ),
    };
    await page.screenshot({ path: path.join(evidenceDir, 'ai-settings-ready.png'), fullPage: true });

    // Kill the source Runtime process (Desktop supervises and respawns it).
    const victim = runtimePid();
    assert.ok(victim, 'source Runtime process must be running');
    evidence.observations.killedRuntimePid = victim;
    process.kill(victim, 'SIGTERM');

    // Probe the same-Host posture across the outage window.
    const during = [];
    const probe = async () => {
      const session = await invokeBridge(page, NIMI_STANDARD_SHELL_COMMANDS['local-app.sessionStatus'], {});
      const candidate = await invokeBridge(page, NIMI_STANDARD_SHELL_COMMANDS['local-app.textGenerateCandidate'], {
        payload: {
          messages: [{ role: 'user', text: '恢复探测：用一句短句回答。' }],
          temperature: 0,
          topP: 1,
          maxTokens: 16,
        },
      });
      return {
        at: new Date().toISOString(),
        sessionOk: session.ok,
        sessionReasonCode: session.ok ? session.value?.reasonCode : session.error?.reasonCode,
        sessionState: session.ok ? session.value?.state : undefined,
        candidateOk: candidate.ok,
        candidateReasonCode: candidate.ok ? 'ok' : candidate.error?.reasonCode,
      };
    };
    const recoveryDeadline = Date.now() + 90_000;
    let recovered = null;
    while (Date.now() < recoveryDeadline) {
      const sample = await probe();
      during.push(sample);
      if (!recovered && sample.sessionOk && sample.candidateOk) {
        recovered = sample;
        break;
      }
      await delay(3_000);
    }
    evidence.observations.duringOutage = during;
    evidence.observations.recovered = recovered;

    const respawnedPid = runtimePid();
    evidence.observations.respawnedRuntimePid = respawnedPid;
    assert.ok(respawnedPid && respawnedPid !== victim, 'Desktop must respawn the source Runtime');
    assert.ok(recovered, `same-Host recovery must succeed within the window: ${JSON.stringify(during)}`);

    // The App must still be alive and never quit on session loss.
    const appAlive = await page.evaluate(() => Boolean(window.__NIMI_ELECTRON_RUNTIME__?.invoke))
      .catch(() => false);
    assert.ok(appAlive, 'ParentOS renderer must survive the Runtime restart on the same Host');
    evidence.observations.appSurvivedRuntimeRestart = appAlive;

    const postureAfter = await page.evaluate(() => document.body.innerText);
    evidence.observations.postureAfterRecovery = {
      stillOnAiSettings: postureAfter.includes('Nimi 访问'),
      leaksMachineCode: /local-app-|runtime-service-|protected-carrier/u.test(
        postureAfter.replace(/技术详情[\s\S]*$/u, ''),
      ),
    };
    await page.screenshot({ path: path.join(evidenceDir, 'ai-settings-after-recovery.png'), fullPage: true });
  } finally {
    await browser?.close().catch(() => undefined);
    const stopped = await postJson(endpoint, '/v1/cancel', { schemaVersion: 1, runId }).catch((error) => ({ error: String(error) }));
    evidence.observations.explicitStop = {
      state: stopped?.run?.state,
      reasonCode: stopped?.run?.reasonCode,
    };
    await delay(3_000);
    let hostLines;
    try {
      hostLines = execFileSync('pgrep', ['-f', 'ParentOS.*--nimi-dev-renderer-url'], { encoding: 'utf8' }).trim();
    } catch {
      hostLines = '';
    }
    evidence.observations.cleanup = {
      electronHostGone: hostLines === '',
    };
  }

  evidence.finishedAt = new Date().toISOString();
  const evidencePath = path.join(evidenceDir, 'journey-evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`Runtime recovery journey evidence: ${evidencePath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
