import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

const PROTOCOL_VERSION = '2026-07-07.parentos-host.v1';
const APP_ID = 'nimi.parentos';
const PROJECTION_REF = 'parentos-sidecar-protocol-test';
const MAX_DROPPED_IMAGE_BYTES = 25 * 1024 * 1024;

function hostBinaryPath() {
  const root = process.cwd();
  const binaryName = process.platform === 'win32' ? 'parentos_host.exe' : 'parentos_host';
  return path.join(root, 'src-tauri', 'target', 'debug', binaryName);
}

function initBody(storageRoot) {
  return {
    kind: 'init',
    projectionRef: PROJECTION_REF,
    durableDataRoot: path.join(storageRoot, 'data'),
    cacheRoot: path.join(storageRoot, 'cache'),
    tempRoot: path.join(storageRoot, 'tmp'),
  };
}

async function startSidecarSession() {
  const hostBin = hostBinaryPath();
  await access(hostBin);

  const storageRoot = await mkdtemp(path.join(tmpdir(), 'parentos-sidecar protocol \u4e2d\u6587-'));
  const child = spawn(hostBin, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stderr = '';
  let requestSeq = 0;
  let closed = false;
  const pending = new Map();

  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8192);
  });

  const rejectPending = (error) => {
    for (const pendingRequest of pending.values()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
    }
    pending.clear();
  };

  child.once('error', (error) => {
    rejectPending(error);
  });
  child.once('exit', (code, signal) => {
    if (closed) return;
    rejectPending(new Error(`sidecar process exited while requests were pending: code=${code ?? 'null'} signal=${signal ?? 'null'}\nstderr:\n${stderr}`));
  });

  createInterface({ input: child.stdout }).on('line', (line) => {
    let response;
    try {
      response = JSON.parse(line);
    } catch (error) {
      rejectPending(error);
      return;
    }
    const pendingRequest = pending.get(response.id);
    if (!pendingRequest) return;
    pending.delete(response.id);
    clearTimeout(pendingRequest.timer);
    pendingRequest.resolve(response);
  });

  const request = (body, options = {}) => {
    requestSeq += 1;
    const id = body.id || `sidecar-protocol-test-${requestSeq}`;
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      appId: APP_ID,
      id,
      ...body,
    };
    const line = options.rawLine ?? `${JSON.stringify(envelope)}\n`;
    const timeoutMs = options.timeoutMs ?? 10_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`sidecar request timed out: ${id}\nstderr:\n${stderr}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(line, 'utf8', (error) => {
        if (!error) return;
        const pendingRequest = pending.get(id);
        if (!pendingRequest) return;
        pending.delete(id);
        clearTimeout(pendingRequest.timer);
        pendingRequest.reject(error);
      });
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
    assert.equal(response.error?.details?.domain, 'parentos-app-domain');
    return response.error;
  };

  const commandBody = (command, payload) => ({
    kind: 'command',
    projectionRef: PROJECTION_REF,
    command,
    payload,
  });

  const requestPartialLine = (id, rawLine, timeoutMs = 250) =>
    request({ id }, { rawLine, timeoutMs });

  const close = async () => {
    closed = true;
    rejectPending(new Error('closing sidecar protocol test session'));
    let exited = child.exitCode !== null || child.signalCode !== null;
    if (!exited) {
      const exitPromise = once(child, 'exit').then(() => {
        exited = true;
      });
      child.stdin.end();
      const killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 2_000);
      try {
        await exitPromise;
      } finally {
        clearTimeout(killTimer);
      }
    }
    await rm(storageRoot, { recursive: true, force: true });
    return { exited, exitCode: child.exitCode, signalCode: child.signalCode };
  };

  return {
    child,
    storageRoot,
    request,
    requestPartialLine,
    expectReady,
    expectResult,
    expectErr,
    commandBody,
    close,
  };
}

async function withSidecarSession(callback) {
  const session = await startSidecarSession();
  try {
    await session.expectReady(initBody(session.storageRoot));
    return await callback(session);
  } finally {
    await session.close();
  }
}

async function assertPathMissing(filePath) {
  try {
    await stat(filePath);
  } catch (error) {
    assert.equal(error.code, 'ENOENT');
    return;
  }
  assert.fail(`path should not exist: ${filePath}`);
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

test('parentos_host missing binary fails closed before false-ready evidence', async () => {
  const missingBinary = path.join(
    tmpdir(),
    `parentos-host-missing-${process.pid}-${Date.now()}${process.platform === 'win32' ? '.exe' : ''}`,
  );
  await assert.rejects(
    new Promise((resolve, reject) => {
      const child = spawn(missingBinary, [], {
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.kill();
        resolve();
      });
    }),
    (error) => error && error.code === 'ENOENT',
  );
});

test('parentos_host sidecar protocol reaches sqlite host core and rejects unsafe file authority', async () => {
  await withSidecarSession(async ({ storageRoot, expectResult, expectErr, commandBody }) => {
    const now = '2026-07-08T12:00:00.000Z';

    await expectResult(commandBody('db_init', {
      appAccountId: null,
      admittedReminderRuleIds: ['PO-REM-VAC-001', 'PO-REM-POS-003', 'PO-REM-POS-004'],
    }));
    await expectResult(commandBody('create_family', {
      familyId: 'fam_sidecar',
      displayName: 'Sidecar Test Family',
      now,
    }));
    await expectResult(commandBody('create_child', {
      childId: 'child_sidecar',
      familyId: 'fam_sidecar',
      displayName: '\u5c0f\u660e',
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
      now,
    }));
    const children = await expectResult(commandBody('get_children', { familyId: 'fam_sidecar' }));
    assert.equal(children.length, 1);
    assert.equal(children[0].childId, 'child_sidecar');
    assert.equal(children[0].displayName, '\u5c0f\u660e');

    // Exercise the Electron command boundary and real migrated SQLite schema.
    const postureCapture = {
      assessmentId: '01K0NQMR000000000000000001',
      childId: 'child_sidecar',
      assessedAt: '2026-07-08',
      ageMonths: 78,
      source: 'parent',
      shoulder: null, scapula: null, hip: null, leg: null, heel: null,
      neck: null, pelvis: null, knee: null, adam: null, cobbAngle: null,
      notes: null, photoPaths: null, now,
      linkedReminderStateId: '01K0NQMR000000000000000002',
      linkedReminderRuleId: 'PO-REM-POS-003',
      linkedReminderRepeatIndex: 3,
    };
    for (const invalid of [
      {},
      { notes: '  ', photoPaths: '[]' },
      { photoPaths: '[" "]' },
      { shoulder: '0', assessedAt: '2026-02-30' },
      { shoulder: '0', photoPaths: '{}' },
    ]) {
      await expectErr(commandBody('insert_posture_assessment', { ...postureCapture, ...invalid }));
    }
    assert.deepEqual(await expectResult(commandBody('get_posture_assessments', { childId: 'child_sidecar' })), []);
    assert.deepEqual(await expectResult(commandBody('get_reminder_states', { childId: 'child_sidecar' })), []);

    await expectResult(commandBody('insert_posture_assessment', { ...postureCapture, shoulder: '0' }));
    let postureRows = await expectResult(commandBody('get_posture_assessments', { childId: 'child_sidecar' }));
    let postureStates = await expectResult(commandBody('get_reminder_states', { childId: 'child_sidecar' }));
    assert.equal(postureRows.length, 1);
    assert.equal(postureRows[0].shoulder, '0');
    assert.equal(postureStates.length, 1);
    assert.equal(postureStates[0].repeatIndex, 3);
    assert.equal(postureStates[0].status, 'completed');
    assert.equal(postureStates[0].completedAt, now);

    // A state primary-key collision must roll back the assessment inserted first.
    await expectErr(commandBody('insert_posture_assessment', {
      ...postureCapture,
      assessmentId: '01K0NQMR000000000000000003',
      shoulder: '0',
      linkedReminderRepeatIndex: 4,
    }));
    postureRows = await expectResult(commandBody('get_posture_assessments', { childId: 'child_sidecar' }));
    postureStates = await expectResult(commandBody('get_reminder_states', { childId: 'child_sidecar' }));
    assert.equal(postureRows.length, 1);
    assert.equal(postureStates.length, 1);
    assert.equal(postureStates[0].repeatIndex, 3);

    await expectResult(commandBody('insert_posture_assessment', {
      ...postureCapture,
      assessmentId: '01K0NQMR000000000000000004',
      notes: 'Follow-up observation',
      linkedReminderStateId: null,
      linkedReminderRuleId: null,
      linkedReminderRepeatIndex: null,
    }));
    assert.equal((await expectResult(commandBody('get_posture_assessments', { childId: 'child_sidecar' }))).length, 2);
    assert.deepEqual(await expectResult(commandBody('get_reminder_states', { childId: 'child_sidecar' })), postureStates);

    const [parallelFamily, parallelChildren] = await Promise.all([
      expectResult(commandBody('get_family', {})),
      expectResult(commandBody('get_children', { familyId: 'fam_sidecar' })),
    ]);
    assert.equal(parallelFamily.familyId, 'fam_sidecar');
    assert.equal(parallelChildren.length, 1);

    const exportRoot = path.join(storageRoot, 'exports with spaces');
    await mkdir(exportRoot, { recursive: true });
    const directTarget = path.join(exportRoot, 'direct-write.pdf');
    const directAbsoluteWrite = await expectErr(commandBody('report_export_write_save_target', {
      saveTargetId: directTarget,
      base64Data: Buffer.from('%PDF-1.7 direct').toString('base64'),
    }));
    assert.equal(directAbsoluteWrite.reasonCode, 'parentos-sidecar-command-failed');
    assert.match(directAbsoluteWrite.details.cause, /missing|consumed/u);
    await assertPathMissing(directTarget);

    const grantedTarget = path.join(exportRoot, 'granted-report.pdf');
    const grant = await expectResult(commandBody('report_export_register_save_target', {
      saveTargetId: 'grant-sidecar-1',
      path: grantedTarget,
      kind: 'pdf',
      displayPath: 'display-only-report.pdf',
    }));
    assert.deepEqual(Object.keys(grant).sort(), ['displayPath', 'saveTargetId']);
    assert.equal(grant.displayPath, 'display-only-report.pdf');

    const written = await expectResult(commandBody('report_export_write_save_target', {
      saveTargetId: grant.saveTargetId,
      base64Data: Buffer.from('%PDF-1.7 granted').toString('base64'),
    }));
    assert.deepEqual(Object.keys(written).sort(), ['displayPath', 'saveTargetId']);
    assert.equal(written.displayPath, 'display-only-report.pdf');
    assert.equal((await readFile(grantedTarget, 'utf8')), '%PDF-1.7 granted');

    const reusedGrant = await expectErr(commandBody('report_export_write_save_target', {
      saveTargetId: grant.saveTargetId,
      base64Data: Buffer.from('%PDF-1.7 reuse').toString('base64'),
    }));
    assert.equal(reusedGrant.reasonCode, 'parentos-sidecar-command-failed');
    assert.match(reusedGrant.details.cause, /missing|consumed/u);

    const displayPathReplay = await expectErr(commandBody('report_export_write_save_target', {
      saveTargetId: grant.displayPath,
      base64Data: Buffer.from('%PDF-1.7 replay').toString('base64'),
    }));
    assert.equal(displayPathReplay.reasonCode, 'parentos-sidecar-command-failed');
    assert.match(displayPathReplay.details.cause, /missing|consumed/u);

    const imageRoot = path.join(storageRoot, 'images with spaces');
    await mkdir(imageRoot, { recursive: true });
    const imagePath = path.join(imageRoot, 'sample.png');
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeFile(imagePath, imageBytes);
    const images = await expectResult(commandBody('dropped_file_read_image_files_as_base64', {
      paths: [imagePath],
    }));
    assert.equal(images.length, 1);
    assert.deepEqual(Object.keys(images[0]).sort(), ['base64', 'fileName', 'mimeType']);
    assert.equal(images[0].fileName, 'sample.png');
    assert.equal(images[0].mimeType, 'image/png');
    assert.equal(images[0].base64, imageBytes.toString('base64'));

    const relativePathRead = await expectErr(commandBody('dropped_file_read_image_files_as_base64', {
      paths: ['relative.png'],
    }));
    assert.equal(relativePathRead.reasonCode, 'parentos-sidecar-command-failed');
    assert.match(relativePathRead.details.cause, /absolute/u);

    const unsupportedImagePath = path.join(imageRoot, 'sample.txt');
    await writeFile(unsupportedImagePath, 'not an image');
    const unsupportedImage = await expectErr(commandBody('dropped_file_read_image_files_as_base64', {
      paths: [unsupportedImagePath],
    }));
    assert.equal(unsupportedImage.reasonCode, 'parentos-sidecar-command-failed');
    assert.match(unsupportedImage.details.cause, /supported image type/u);

    const oversizedImagePath = path.join(imageRoot, 'oversized.png');
    const oversizedFile = await open(oversizedImagePath, 'w');
    try {
      await oversizedFile.truncate(MAX_DROPPED_IMAGE_BYTES + 1);
    } finally {
      await oversizedFile.close();
    }
    const oversizedImage = await expectErr(commandBody('dropped_file_read_image_files_as_base64', {
      paths: [oversizedImagePath],
    }));
    assert.equal(oversizedImage.reasonCode, 'parentos-sidecar-command-failed');
    assert.match(oversizedImage.details.cause, /exceeds/u);

    const invalidPayload = await expectErr(commandBody('create_family', {
      familyId: 'fam_invalid',
      displayName: 'Invalid Family',
      now,
      extra: true,
    }));
    assert.equal(invalidPayload.code, 'invalid-payload');
    assert.equal(invalidPayload.source, 'host');

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

    const wrongAppId = await expectErr({
      appId: 'evil.parentos',
      kind: 'command',
      projectionRef: PROJECTION_REF,
      command: 'get_family',
      payload: {},
    });
    assert.equal(wrongAppId.code, 'forbidden-renderer-access');
    assert.equal(wrongAppId.reasonCode, 'parentos-sidecar-app-id-mismatch');

    const wrongProtocol = await expectErr({
      protocolVersion: '2026-07-07.parentos-host.v0',
      kind: 'command',
      projectionRef: PROJECTION_REF,
      command: 'get_family',
      payload: {},
    });
    assert.equal(wrongProtocol.code, 'invalid-payload');
    assert.equal(wrongProtocol.reasonCode, 'parentos-sidecar-protocol-version-mismatch');

    const unknownCommand = await expectErr(commandBody('unknown_parentos_command', {}));
    assert.equal(unknownCommand.code, 'capability-unavailable');
    assert.equal(unknownCommand.reasonCode, 'parentos-sidecar-command-not-registered');
  });
});

test('parentos_host partial command times out without accepting incomplete JSON', async () => {
  const session = await startSidecarSession();
  try {
    await session.expectReady(initBody(session.storageRoot));
    await assert.rejects(
      session.requestPartialLine(
        'partial-timeout',
        `{"protocolVersion":"${PROTOCOL_VERSION}","appId":"${APP_ID}","id":"partial-timeout","kind":"command"`,
        150,
      ),
      /timed out/u,
    );
  } finally {
    const cleanup = await session.close();
    assert.equal(cleanup.exited, true);
  }
});

test('parentos_host pending command rejects when the sidecar exits mid-command', async () => {
  const session = await startSidecarSession();
  try {
    await session.expectReady(initBody(session.storageRoot));
    const pending = session.requestPartialLine(
      'crash-mid-command',
      `{"protocolVersion":"${PROTOCOL_VERSION}","appId":"${APP_ID}","id":"crash-mid-command","kind":"command"`,
      5_000,
    );
    session.child.kill();
    await assert.rejects(pending, /sidecar process exited/u);
  } finally {
    const cleanup = await session.close();
    assert.equal(cleanup.exited, true);
  }
});

test('parentos_host sidecar session cleanup terminates the process', async () => {
  const session = await startSidecarSession();
  await session.expectReady(initBody(session.storageRoot));
  const cleanup = await session.close();
  assert.equal(cleanup.exited, true);
  assert.notEqual(session.child.exitCode ?? session.child.signalCode, null);
});
