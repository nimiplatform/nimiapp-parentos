import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

const PROTOCOL_VERSION = '2026-07-07.parentos-host.v1';
const APP_ID = 'nimi.parentos';
const PROJECTION_REF = 'parentos-sidecar-protocol-test';

function hostBinaryPath() {
  const root = process.cwd();
  const binaryName = process.platform === 'win32' ? 'parentos_host.exe' : 'parentos_host';
  return path.join(root, 'src-tauri', 'target', 'debug', binaryName);
}

test('parentos_host sidecar self-test emits strict ready envelope', async () => {
  const hostBin = hostBinaryPath();
  await access(hostBin);
  const child = spawn(hostBin, ['--self-test'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);
  const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
  assert.equal(lines.length, 1, `self-test must emit one JSON line, got ${stdout}`);
  assert.deepEqual(JSON.parse(lines[0]), {
    kind: 'ready',
    protocolVersion: PROTOCOL_VERSION,
    id: 'parentos-host-self-test',
    appId: APP_ID,
  });
});

test('parentos_host sidecar protocol reaches sqlite family/child host core', async () => {
  const hostBin = hostBinaryPath();
  await access(hostBin);

  const storageRoot = await mkdtemp(path.join(tmpdir(), 'parentos-sidecar-protocol-'));
  const child = spawn(hostBin, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8192);
  });

  const pending = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    let response;
    try {
      response = JSON.parse(line);
    } catch (error) {
      for (const pendingRequest of pending.values()) {
        clearTimeout(pendingRequest.timer);
        pendingRequest.reject(error);
      }
      pending.clear();
      return;
    }
    const pendingRequest = pending.get(response.id);
    if (!pendingRequest) return;
    pending.delete(response.id);
    clearTimeout(pendingRequest.timer);
    pendingRequest.resolve(response);
  });

  let requestSeq = 0;
  const request = (body) => {
    requestSeq += 1;
    const id = `sidecar-protocol-test-${requestSeq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`sidecar request timed out: ${id}\nstderr:\n${stderr}`));
      }, 10_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        appId: APP_ID,
        id,
        ...body,
      })}\n`);
    });
  };

  const expectReady = async (body) => {
    const response = await request(body);
    assert.equal(response.protocolVersion, PROTOCOL_VERSION);
    assert.equal(response.kind, 'ready', JSON.stringify(response));
    assert.equal(response.appId, APP_ID);
    return response;
  };
  const expectResult = async (body) => {
    const response = await request(body);
    assert.equal(response.protocolVersion, PROTOCOL_VERSION);
    assert.equal(response.kind, 'result', JSON.stringify(response));
    return response.result;
  };
  const expectErr = async (body) => {
    const response = await request(body);
    assert.equal(response.protocolVersion, PROTOCOL_VERSION);
    assert.equal(response.kind, 'error', JSON.stringify(response));
    return response.error;
  };

  const commandBody = (command, payload) => ({
    kind: 'command',
    projectionRef: PROJECTION_REF,
    command,
    payload,
  });

  try {
    await expectReady({
      kind: 'init',
      projectionRef: PROJECTION_REF,
      durableDataRoot: path.join(storageRoot, 'data'),
      cacheRoot: path.join(storageRoot, 'cache'),
      tempRoot: path.join(storageRoot, 'tmp'),
    });
    await expectResult(commandBody('db_init', { subjectUserId: null }));
    await expectResult(commandBody('create_family', {
      familyId: 'fam_sidecar',
      displayName: 'Sidecar Test Family',
      now: '2026-07-08T12:00:00.000Z',
    }));
    await expectResult(commandBody('create_child', {
      childId: 'child_sidecar',
      familyId: 'fam_sidecar',
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
      now: '2026-07-08T12:00:00.000Z',
    }));
    const children = await expectResult(commandBody('get_children', { familyId: 'fam_sidecar' }));
    assert.equal(children.length, 1);
    assert.equal(children[0].childId, 'child_sidecar');
    assert.equal(children[0].displayName, '小明');

    const invalidPayload = await expectErr(commandBody('create_family', {
      familyId: 'fam_invalid',
      displayName: 'Invalid Family',
      now: '2026-07-08T12:00:00.000Z',
      extra: true,
    }));
    assert.equal(invalidPayload.code, 'invalid-payload');
    assert.equal(invalidPayload.source, 'host');
    assert.equal(invalidPayload.details.domain, 'parentos-app-domain');

    const invalidEnvelope = await expectErr({
      kind: 'command',
      projectionRef: PROJECTION_REF,
      command: 'get_family',
      payload: {},
      extra: true,
    });
    assert.equal(invalidEnvelope.code, 'invalid-payload');
    assert.equal(invalidEnvelope.reasonCode, 'parentos-sidecar-request-invalid');
    assert.equal(invalidEnvelope.source, 'host');

    const missingProjectionRef = await expectErr({
      kind: 'command',
      command: 'get_family',
      payload: {},
    });
    assert.equal(missingProjectionRef.code, 'invalid-payload');
    assert.equal(missingProjectionRef.reasonCode, 'parentos-sidecar-request-invalid');
  } finally {
    for (const pendingRequest of pending.values()) {
      clearTimeout(pendingRequest.timer);
    }
    pending.clear();
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.stdin.end();
      const killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 2_000);
      try {
        await exited;
      } finally {
        clearTimeout(killTimer);
      }
    }
    await rm(storageRoot, { recursive: true, force: true });
  }
});
