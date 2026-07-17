import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const acceptanceScripts = [
  'scripts/acceptance-electron.mjs',
  'scripts/acceptance-tauri.mjs',
];

test('live acceptance verifies the protected ParentOS failure UX end to end', async () => {
  for (const scriptPath of acceptanceScripts) {
    const source = await readFile(scriptPath, 'utf8');

    assert.match(source, /parentos-protected-session-failure/u, `${scriptPath} must inspect the typed failure surface`);
    assert.match(source, /capability-unavailable/u, `${scriptPath} must require the transitional capability state`);
    assert.match(source, /parentos-local-data-locked/u, `${scriptPath} must inspect the disabled local-data control`);
    assert.match(source, /parentos-protected-session-retry/u, `${scriptPath} must exercise retry`);
    assert.match(source, /ParentOS 受保护访问尚未开放/u, `${scriptPath} must verify readable Chinese copy`);
    assert.match(source, /本地数据已锁定/u, `${scriptPath} must verify the Chinese disabled state`);
    assert.doesNotMatch(source, /createAcceptanceChildThroughUi|create_family|create_child/u, `${scriptPath} must not open local product data`);
  }
});

test('live acceptance verifies Desktop-supervised local-app carriers and direct Runtime denial', async () => {
  const electronSource = await readFile('scripts/acceptance-electron.mjs', 'utf8');
  assert.match(electronSource, /@nimiplatform['"], 'app-tools'|@nimiplatform.*app-tools/su, 'Electron acceptance must launch through the official app-tools entry');
  assert.match(electronSource, /'dev', '--shell', 'electron'/u, 'Electron acceptance must request the Electron supervisor plan');
  assert.match(electronSource, /NIMI_LOCAL_AGENT_PRODUCT_ZHIYU_CDP_PORT/u, 'Electron acceptance must bind to the existing Desktop checkpoint observation port');
  assert.match(electronSource, /requires the checkpoint CDP port/u, 'Electron acceptance must fail closed without an observable supervised host');
  assert.match(electronSource, /local-app\.sessionStatus/u, 'Electron acceptance must prove a bound local-app session');
  assert.match(electronSource, /local-app\.permissionRequest/u, 'Electron acceptance must exercise a real permission request');
  assert.match(electronSource, /zero-grant/u, 'Electron acceptance must begin at zero grant');
  assert.match(electronSource, /deniedBeforeGrant/u, 'Electron acceptance must prove the pre-grant denial');
  assert.match(electronSource, /grantedWrite/u, 'Electron acceptance must prove the approved operation succeeds');
  assert.match(electronSource, /deniedAfterRevoke/u, 'Electron acceptance must prove revoke denies the operation again');

  const tauriSource = await readFile('scripts/acceptance-tauri.mjs', 'utf8');
  assert.match(tauriSource, /local-app\.sessionStatus/u, 'official Tauri dev must probe the supervised local-app carrier');
  assert.match(tauriSource, /artifactResult\.ok, false/u, 'official Tauri dev must preserve exact-grant fail-close');

  for (const scriptPath of acceptanceScripts) {
    const source = scriptPath.endsWith('tauri.mjs') ? tauriSource : electronSource;
    assert.match(source, /runtime\.unary/u, `${scriptPath} must attempt direct Runtime access`);
    assert.match(source, /directRuntimeResult\.ok, false/u, `${scriptPath} must require direct Runtime denial`);
    assert.match(source, /appDomainResult\.ok, false/u, `${scriptPath} must require app-domain data denial`);
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
    assert.match(source, /alertRole/u, `${scriptPath} must inspect the alert role`);
    assert.match(source, /assertNoVisibleOverflow/u, `${scriptPath} must fail on horizontal overflow`);
    assert.match(source, /pageErrors/u, `${scriptPath} must record page errors`);
    assert.match(source, /event\.type === 'error'/u, `${scriptPath} must fail on console errors`);
  }
  const electronSource = await readFile('scripts/acceptance-electron.mjs', 'utf8');
  assert.match(electronSource, /verifyRendererHmr/u, 'Electron acceptance must exercise renderer HMR');
  assert.match(electronSource, /hot updated\|hmr update/u, 'Electron acceptance must require an observed Vite HMR event');
});
