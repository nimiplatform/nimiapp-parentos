import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NIMI_STANDARD_SHELL_COMMANDS } from '@nimiplatform/kit/shell/capabilities';

const root = process.cwd();

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function loadPolicy() {
  return import(pathToFileURL(path.join(root, 'src-electron/parentos-command-policy.ts')).href);
}

test('ParentOS Electron command policy is constant-backed and contains no hand-written standard command literals', async () => {
  const policySource = await readProjectFile('src-electron/parentos-command-policy.ts');
  assert.match(policySource, /\bNIMI_STANDARD_SHELL_COMMANDS\b/u);
  assert.doesNotMatch(policySource, /['"`]nimi\.shell\./u);
});

test('ParentOS Electron command policy denies token custody and disallowed host surfaces', async () => {
  const { parentosElectronHostCommandPolicy } = await loadPolicy();
  for (const command of [
    NIMI_STANDARD_SHELL_COMMANDS['oauth.tokenExchange'],
    NIMI_STANDARD_SHELL_COMMANDS['auth.sessionLoad'],
    NIMI_STANDARD_SHELL_COMMANDS['auth.sessionSave'],
    NIMI_STANDARD_SHELL_COMMANDS['auth.sessionClear'],
    NIMI_STANDARD_SHELL_COMMANDS['runtime-lifecycle.start'],
    NIMI_STANDARD_SHELL_COMMANDS['runtime-lifecycle.stop'],
    NIMI_STANDARD_SHELL_COMMANDS['runtime-lifecycle.restart'],
    NIMI_STANDARD_SHELL_COMMANDS['config.set'],
    NIMI_STANDARD_SHELL_COMMANDS['local-agent.runtimeTrustedCaller'],
    NIMI_STANDARD_SHELL_COMMANDS['file-dialog.open'],
    NIMI_STANDARD_SHELL_COMMANDS['file-reveal.reveal'],
    NIMI_STANDARD_SHELL_COMMANDS['export.saveFile'],
  ]) {
    assert.deepEqual(parentosElectronHostCommandPolicy({
      command,
      commandKind: 'standard',
      appId: 'nimi.parentos',
    }), {
      allow: false,
      code: 'forbidden-renderer-access',
      reasonCode: 'parentos-electron-command-forbidden',
      actionHint: 'use_parentos_runtime_broker_or_host_owned_surface',
      details: { command },
    });
  }
});

test('ParentOS Electron command policy allows broker, Runtime bridge, and app-domain commands', async () => {
  const { parentosElectronHostCommandPolicy } = await loadPolicy();
  for (const command of [
    NIMI_STANDARD_SHELL_COMMANDS['oauth.openExternalUrl'],
    NIMI_STANDARD_SHELL_COMMANDS['oauth.listenForCode'],
    NIMI_STANDARD_SHELL_COMMANDS['runtime.unary'],
    NIMI_STANDARD_SHELL_COMMANDS['runtime.streamOpen'],
    NIMI_STANDARD_SHELL_COMMANDS['runtime.streamClose'],
  ]) {
    assert.deepEqual(parentosElectronHostCommandPolicy({
      command,
      commandKind: 'standard',
      appId: 'nimi.parentos',
    }), { allow: true });
  }
  for (const command of ['db_init', 'create_child']) {
    assert.deepEqual(parentosElectronHostCommandPolicy({
      command,
      commandKind: 'app-domain',
      appId: 'nimi.parentos',
    }), { allow: true });
  }
});

test('ParentOS Electron command policy denies unadmitted standard and unknown commands by default', async () => {
  const { parentosElectronHostCommandPolicy } = await loadPolicy();

  for (const input of [
    {
      command: 'nimi.shell.future.unadmitted',
      commandKind: 'standard',
      appId: 'nimi.parentos',
    },
    {
      command: 'missing_parentos_command',
      commandKind: 'unknown',
      appId: 'nimi.parentos',
    },
  ]) {
    const decision = parentosElectronHostCommandPolicy(input);
    assert.equal(decision.allow, false);
    assert.equal(decision.code, 'forbidden-renderer-access');
    assert.equal(decision.reasonCode, 'parentos-electron-command-forbidden');
  }
});
