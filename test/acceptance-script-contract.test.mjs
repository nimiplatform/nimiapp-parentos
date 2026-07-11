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

test('live acceptance verifies native-carrier and direct Runtime negative paths', async () => {
  for (const scriptPath of acceptanceScripts) {
    const source = await readFile(scriptPath, 'utf8');

    assert.match(source, /artifacts\.readRuntimeBytes/u, `${scriptPath} must exercise the installed artifact carrier`);
    assert.match(source, /artifactResult\.ok, false/u, `${scriptPath} must require artifact fail-close before admission`);
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
});
