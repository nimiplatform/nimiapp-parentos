import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const acceptanceScripts = [
  'scripts/acceptance-electron.mjs',
  'scripts/acceptance-tauri.mjs',
];

test('live acceptance verifies ParentOS app-owned product bootstrap end to end', async () => {
  for (const scriptPath of acceptanceScripts) {
    const source = await readFile(scriptPath, 'utf8');

    assert.match(source, /parentos-launch-page/u, `${scriptPath} must inspect the launch surface`);
    assert.match(source, /parentos-launch-trigger/u, `${scriptPath} must exercise the launch interaction`);
    assert.match(source, /parentos-app-routed-surface/u, `${scriptPath} must require product routes`);
    assert.match(source, /app-owned SQLite command must remain available independently/u, `${scriptPath} must prove app-owned data access`);
    assert.match(source, /invokeBridge\(page, ['"]get_family['"]/u, `${scriptPath} must invoke an exact app-owned command`);
    assert.doesNotMatch(source, /parentos-protected-operation-set-not-admitted|local data disabled/u, `${scriptPath} must not retain the obsolete product-wide lock`);
  }
});

test('live acceptance verifies Desktop-supervised local-app carriers and direct Runtime denial', async () => {
  const electronSource = await readFile('scripts/acceptance-electron.mjs', 'utf8');
  assert.match(electronSource, /@nimiplatform['"], 'app-tools'|@nimiplatform.*app-tools/su, 'Electron acceptance must launch through the official app-tools entry');
  assert.match(electronSource, /'dev', '--shell', 'electron'/u, 'Electron acceptance must request the Electron supervisor plan');
  assert.match(electronSource, /NIMI_LOCAL_AGENT_PRODUCT_ZHIYU_CDP_PORT/u, 'Electron acceptance must bind to the existing Desktop checkpoint observation port');
  assert.match(electronSource, /requires the checkpoint CDP port/u, 'Electron acceptance must fail closed without an observable supervised host');
  assert.match(electronSource, /local-app\.sessionStatus/u, 'Electron acceptance must prove a bound local-app session');
  assert.match(electronSource, /local-app\.permissionStatus/u, 'Electron acceptance must inspect canonical public permission posture');
  assert.match(electronSource, /reservedPermissionId = ['"]agents\.interact/u, 'Electron acceptance must use a canonical permission id');
  assert.match(electronSource, /baseEntitlementWriteResult\.ok, true/u, 'Electron acceptance must prove app-private JSON needs no prompt');
  assert.doesNotMatch(electronSource, /permission approval required|deniedBeforeGrant|grantedWrite|deniedAfterRevoke/iu, 'Electron acceptance must not recreate the retired storage grant flow');

  const tauriSource = await readFile('scripts/acceptance-tauri.mjs', 'utf8');
  assert.match(tauriSource, /local-app\.sessionStatus/u, 'official Tauri dev must probe the supervised local-app carrier');
  assert.match(tauriSource, /local-app\.permissionStatus/u, 'official Tauri dev must inspect canonical public permission posture');
  assert.match(tauriSource, /baseEntitlementWriteResult\.ok, true/u, 'official Tauri dev must prove app-private JSON needs no prompt');

  for (const scriptPath of acceptanceScripts) {
    const source = scriptPath.endsWith('tauri.mjs') ? tauriSource : electronSource;
    assert.match(source, /runtime\.unary/u, `${scriptPath} must attempt direct Runtime access`);
    assert.match(source, /directRuntimeResult\.ok, false/u, `${scriptPath} must require direct Runtime denial`);
    assert.match(source, /appDomainResult\.ok, true/u, `${scriptPath} must require app-owned data success`);
    assert.match(source, /invokeBridge\(page, ['"]get_family['"]/u, `${scriptPath} must probe local data admission`);
    assert.match(source, /auth(?:\.session\.load|_session_load)/u, `${scriptPath} must test a concrete account-session command`);
    assert.match(source, /probe command must be concrete/u, `${scriptPath} must reject undefined acceptance probes`);
  }
});

test('live acceptance records desktop, narrow, accessibility, overflow, and console evidence', async () => {
  for (const scriptPath of acceptanceScripts) {
    const source = await readFile(scriptPath, 'utf8');

    assert.match(source, /width: 1365, height: 900/u, `${scriptPath} must capture desktop layout`);
    assert.match(source, /width: 390, height: 844/u, `${scriptPath} must capture narrow layout`);
    assert.match(source, /launchLabel/u, `${scriptPath} must inspect the launch control accessible name`);
    assert.match(source, /assertNoVisibleOverflow/u, `${scriptPath} must fail on horizontal overflow`);
    assert.match(source, /pageErrors/u, `${scriptPath} must record page errors`);
    assert.match(source, /event\.type === 'error'/u, `${scriptPath} must fail on console errors`);
  }
  const electronSource = await readFile('scripts/acceptance-electron.mjs', 'utf8');
  assert.match(electronSource, /verifyRendererHmr/u, 'Electron acceptance must exercise renderer HMR');
  assert.match(electronSource, /hot updated\|hmr update/u, 'Electron acceptance must require an observed Vite HMR event');
});
