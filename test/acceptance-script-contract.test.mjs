import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const acceptanceScripts = [
  'scripts/acceptance-electron.mjs',
];

test('live acceptance verifies ParentOS app-owned product bootstrap end to end', async () => {
  for (const scriptPath of acceptanceScripts) {
    const source = await readFile(scriptPath, 'utf8');

    assert.doesNotMatch(source, /parentos-launch-page|parentos-launch-trigger/u, `${scriptPath} must not retain a manual launch gate`);
    assert.match(source, /parentos-app-routed-surface/u, `${scriptPath} must require product routes`);
    assert.match(source, /parentos-onboarding-page/u, `${scriptPath} must inspect the zero-profile onboarding surface`);
    assert.match(source, /parentos-onboarding-create-child/u, `${scriptPath} must validate the create-child action when onboarding is active`);
    assert.match(source, /an existing family may render its active product route/u, `${scriptPath} must admit an existing device-local family state`);
    assert.match(source, /app-owned SQLite command must remain available independently/u, `${scriptPath} must prove app-owned data access`);
    assert.match(source, /invokeBridge\(page, ['"]get_family['"]/u, `${scriptPath} must invoke an exact app-owned command`);
    assert.doesNotMatch(source, /parentos-protected-operation-set-not-admitted|local data disabled/u, `${scriptPath} must not retain the obsolete product-wide lock`);
  }
});

test('live acceptance verifies the supervised App Access contract and denial boundaries', async () => {
  const electronSource = await readFile('scripts/acceptance-electron.mjs', 'utf8');
  assert.match(electronSource, /@nimiplatform['"], 'app-tools'|@nimiplatform.*app-tools/su, 'Electron acceptance must launch through the official app-tools entry');
  assert.match(electronSource, /'dev', '--shell', 'electron'/u, 'Electron acceptance must request the Electron supervisor plan');
  assert.match(electronSource, /NIMI_PARENTOS_ELECTRON_ACCEPTANCE_CDP_PORT/u, 'Electron acceptance must allow pinning the supervised observation port');
  assert.match(electronSource, /--cdp-port/u, 'Electron acceptance must request an explicit CDP port from the supervisor');
  assert.match(electronSource, /local-app\.sessionStatus/u, 'Electron acceptance must prove a bound local-app session');
  assert.match(electronSource, /local-app\.aiConfigGet/u, 'Electron acceptance must read the platform-owned AIConfig projection');
  assert.match(electronSource, /local-app\.textGenerateCandidate/u, 'Electron acceptance must exercise the declared runtime.consume domain');
  assert.match(electronSource, /local-app\.realmWorldCoreList/u, 'Electron acceptance must probe an undeclared App Access domain');
  assert.match(electronSource, /local-app-access-denied/u, 'Electron acceptance must assert the typed denial for undeclared domains');
  assert.match(electronSource, /appStorageWriteResult\.ok, true/u, 'Electron acceptance must prove app-private JSON storage works without App Access domains');
  assert.match(electronSource, /runtime\.unary/u, 'Electron acceptance must attempt direct Runtime access');
  assert.match(electronSource, /directRuntimeResult\.ok, false/u, 'Electron acceptance must require direct Runtime denial');
  assert.match(electronSource, /appDomainResult\.ok, true/u, 'Electron acceptance must require app-owned data success');
  assert.match(electronSource, /invokeBridge\(page, ['"]get_family['"]/u, 'Electron acceptance must probe local data admission');
  assert.match(electronSource, /auth\.session\.load/u, 'Electron acceptance must test a concrete account-session command');
  assert.match(electronSource, /probe command must be concrete/u, 'Electron acceptance must reject undefined acceptance probes');
  assert.doesNotMatch(
    electronSource,
    /permissionStatus|reservedPermissionId|permission approval required|deniedBeforeGrant|grantedWrite|deniedAfterRevoke|base_entitlement|baseEntitlement|agents\.interact/iu,
    'Electron acceptance must not retain the retired permission platform vocabulary',
  );
});

test('live acceptance records desktop, narrow, accessibility, overflow, and console evidence', async () => {
  for (const scriptPath of acceptanceScripts) {
    const source = await readFile(scriptPath, 'utf8');

    assert.match(source, /width: 1365, height: 900/u, `${scriptPath} must capture desktop layout`);
    assert.match(source, /width: 390, height: 844/u, `${scriptPath} must capture narrow layout`);
    assert.doesNotMatch(source, /launchLabel/u, `${scriptPath} must not inspect a removed launch control`);
    assert.match(source, /assertNoVisibleOverflow/u, `${scriptPath} must fail on horizontal overflow`);
    assert.match(source, /pageErrors/u, `${scriptPath} must record page errors`);
    assert.match(source, /event\.type === 'error'/u, `${scriptPath} must fail on console errors`);
  }
  const electronSource = await readFile('scripts/acceptance-electron.mjs', 'utf8');
  assert.match(electronSource, /verifyRendererHmr/u, 'Electron acceptance must exercise renderer HMR');
  assert.match(electronSource, /hot updated\|hmr update/u, 'Electron acceptance must require an observed Vite HMR event');
});
