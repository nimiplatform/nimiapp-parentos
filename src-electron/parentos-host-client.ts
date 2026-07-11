import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { access, appendFile, mkdir } from 'node:fs/promises';
import { app } from 'electron';
import {
  NIMI_STANDARD_SHELL_ERROR_CODES,
  type NimiStandardShellErrorCode,
  type NimiStandardShellErrorSource,
} from '@nimiplatform/kit/shell/capabilities';
import { NimiElectronShellHostError } from '@nimiplatform/kit/shell/electron/main';

const PARENTOS_SIDECAR_PROTOCOL_VERSION = '2026-07-07.parentos-host.v1';
const PARENTOS_APP_ID = 'nimi.parentos';
const STANDARD_ERROR_CODES = new Set<string>(NIMI_STANDARD_SHELL_ERROR_CODES);
const STANDARD_ERROR_SOURCES = new Set<string>(['renderer', 'tauri', 'electron', 'runtime', 'host']);
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

export type ParentOSHostClient = {
  readonly invoke: (command: string, payload: unknown) => Promise<unknown>;
  readonly close: () => void;
};

type ParentOSHostStorageRoots = {
  readonly durableDataRoot: string;
  readonly cacheRoot: string;
  readonly tempRoot: string;
  readonly projectionRef: string;
};

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: NodeJS.Timeout;
};

type SidecarReadyResponse = {
  readonly protocolVersion: string;
  readonly kind: 'ready';
  readonly id: string;
  readonly appId: string;
};

type SidecarResultResponse = {
  readonly protocolVersion: string;
  readonly kind: 'result';
  readonly id: string;
  readonly result: unknown;
};

type SidecarErrorResponse = {
  readonly protocolVersion: string;
  readonly kind: 'error';
  readonly id: string;
  readonly error: {
    readonly code?: unknown;
    readonly reasonCode?: unknown;
    readonly actionHint?: unknown;
    readonly source?: unknown;
    readonly details?: unknown;
  };
};

type SidecarResponse = SidecarReadyResponse | SidecarResultResponse | SidecarErrorResponse;

export function createParentOSHostClient(input: {
  readonly appRoot: string;
  readonly storageRoots: ParentOSHostStorageRoots;
}): ParentOSHostClient {
  let child: ChildProcessWithoutNullStreams | undefined;
  let startup: Promise<void> | undefined;
  let sequence = 0;
  let stderrTail = '';
  const pending = new Map<string, PendingRequest>();

  async function ensureStarted(): Promise<void> {
    if (child && !child.killed) {
      return;
    }
    if (!startup) {
      startup = startSidecar().catch((error) => {
        startup = undefined;
        throw error;
      });
    }
    await startup;
  }

  async function startSidecar(): Promise<void> {
    const hostBin = await resolveParentOSHostBinaryPath(input.appRoot);
    const nextChild = spawn(hostBin, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
    });
    child = nextChild;
    stderrTail = '';
    await recordSidecarAcceptanceEvent({
      event: 'sidecar-start',
      hostBin,
      pid: nextChild.pid ?? null,
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    });

    nextChild.stdout.setEncoding('utf8');
    nextChild.stderr.setEncoding('utf8');
    nextChild.stderr.on('data', (chunk: string) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-8192);
    });
    createInterface({ input: nextChild.stdout }).on('line', onSidecarLine);
    nextChild.once('error', (error) => {
      rejectAllPending(sidecarUnavailableError('parentos-electron-sidecar-process-error', error.message));
      if (child === nextChild) {
        child = undefined;
        startup = undefined;
      }
    });
    nextChild.once('exit', (code, signal) => {
      rejectAllPending(sidecarUnavailableError(
        'parentos-electron-sidecar-process-exited',
        `exitCode=${code ?? 'null'} signal=${signal ?? 'null'}`,
      ));
      if (child === nextChild) {
        child = undefined;
        startup = undefined;
      }
    });

    const ready = await sendRawRequest({
      protocolVersion: PARENTOS_SIDECAR_PROTOCOL_VERSION,
      appId: PARENTOS_APP_ID,
      id: nextRequestId('init'),
      kind: 'init',
      projectionRef: input.storageRoots.projectionRef,
      durableDataRoot: input.storageRoots.durableDataRoot,
      cacheRoot: input.storageRoots.cacheRoot,
      tempRoot: input.storageRoots.tempRoot,
    });
    await recordSidecarAcceptanceEvent({
      event: 'sidecar-ready',
      hostBin,
      pid: nextChild.pid ?? null,
      ready,
      protocolVersion: PARENTOS_SIDECAR_PROTOCOL_VERSION,
    });
  }

  async function invoke(command: string, payload: unknown): Promise<unknown> {
    await ensureStarted();
    return sendRawRequest({
      protocolVersion: PARENTOS_SIDECAR_PROTOCOL_VERSION,
      appId: PARENTOS_APP_ID,
      id: nextRequestId(command),
      kind: 'command',
      projectionRef: input.storageRoots.projectionRef,
      command,
      payload: normalizePayload(command, payload),
    });
  }

  function sendRawRequest(request: Record<string, unknown>): Promise<unknown> {
    const currentChild = child;
    if (!currentChild || currentChild.killed) {
      return Promise.reject(sidecarUnavailableError(
        'parentos-electron-sidecar-process-unavailable',
        'sidecar process is not running',
      ));
    }
    const requestId = normalizeText(request.id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(sidecarUnavailableError(
          'parentos-electron-sidecar-request-timeout',
          `request ${requestId} timed out`,
        ));
      }, DEFAULT_COMMAND_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer });
      currentChild.stdin.write(`${JSON.stringify(request)}\n`, 'utf8', (error) => {
        if (!error) return;
        const pendingRequest = pending.get(requestId);
        if (pendingRequest) {
          pending.delete(requestId);
          clearTimeout(pendingRequest.timer);
          pendingRequest.reject(sidecarUnavailableError(
            'parentos-electron-sidecar-stdin-write-failed',
            error.message,
          ));
        }
      });
    });
  }

  function onSidecarLine(line: string): void {
    let response: SidecarResponse;
    try {
      response = parseSidecarResponse(line);
    } catch (error) {
      rejectAllPending(sidecarProtocolError(
        'parentos-electron-sidecar-response-invalid',
        error instanceof Error ? error.message : String(error || 'invalid response'),
      ));
      return;
    }
    if (response.protocolVersion !== PARENTOS_SIDECAR_PROTOCOL_VERSION) {
      rejectResponse(response.id, sidecarProtocolError(
        'parentos-electron-sidecar-response-protocol-mismatch',
        `expected ${PARENTOS_SIDECAR_PROTOCOL_VERSION}, got ${response.protocolVersion}`,
      ));
      return;
    }
    const pendingRequest = pending.get(response.id);
    if (!pendingRequest) {
      return;
    }
    pending.delete(response.id);
    clearTimeout(pendingRequest.timer);
    if (response.kind === 'ready') {
      if (response.appId !== PARENTOS_APP_ID) {
        pendingRequest.reject(sidecarProtocolError(
          'parentos-electron-sidecar-response-app-id-mismatch',
          `expected ${PARENTOS_APP_ID}, got ${response.appId}`,
        ));
        return;
      }
      pendingRequest.resolve({ ready: true, appId: response.appId });
      return;
    }
    if (response.kind === 'result') {
      pendingRequest.resolve(response.result);
      return;
    }
    if (response.kind === 'error') {
      pendingRequest.reject(sidecarEnvelopeError(response.error));
      return;
    }
    pendingRequest.reject(sidecarProtocolError(
      'parentos-electron-sidecar-response-kind-invalid',
      `unexpected sidecar response kind: ${(response as { kind?: unknown }).kind}`,
    ));
  }

  function rejectResponse(requestId: string, error: unknown): void {
    const pendingRequest = pending.get(requestId);
    if (!pendingRequest) {
      return;
    }
    pending.delete(requestId);
    clearTimeout(pendingRequest.timer);
    pendingRequest.reject(error);
  }

  function rejectAllPending(error: unknown): void {
    for (const [requestId, pendingRequest] of pending.entries()) {
      pending.delete(requestId);
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
    }
  }

  function close(): void {
    const currentChild = child;
    child = undefined;
    startup = undefined;
    rejectAllPending(sidecarUnavailableError(
      'parentos-electron-sidecar-client-closed',
      'ParentOS sidecar client closed',
    ));
    if (currentChild && !currentChild.killed) {
      currentChild.kill();
    }
  }

  function nextRequestId(command: string): string {
    sequence += 1;
    const token = command.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64) || 'request';
    return `parentos-electron-${process.pid}-${Date.now()}-${sequence}-${token}`;
  }

  function sidecarEnvelopeError(error: SidecarErrorResponse['error']): NimiElectronShellHostError {
    const details = normalizeDetails(error.details);
    return new NimiElectronShellHostError({
      code: normalizeStandardErrorCode(error.code),
      message: details.cause
        ? `ParentOS Electron sidecar command failed: ${String(details.cause)}`
        : `ParentOS Electron sidecar command failed: ${normalizeText(error.reasonCode) || 'unknown error'}`,
      reasonCode: normalizeText(error.reasonCode) || 'parentos-electron-sidecar-command-failed',
      actionHint: normalizeText(error.actionHint) || 'inspect_parentos_electron_sidecar',
      source: normalizeStandardErrorSource(error.source),
      details: {
        ...details,
        stderrTail,
      },
    });
  }

  function sidecarUnavailableError(reasonCode: string, cause: string): NimiElectronShellHostError {
    return new NimiElectronShellHostError({
      code: 'external-daemon-required',
      message: `ParentOS Electron sidecar is unavailable: ${cause}`,
      reasonCode,
      actionHint: 'build_and_launch_parentos_host_sidecar',
      source: 'host',
      details: {
        domain: 'parentos-app-domain',
        cause,
        stderrTail,
      },
    });
  }

  function sidecarProtocolError(reasonCode: string, cause: string): NimiElectronShellHostError {
    return new NimiElectronShellHostError({
      code: 'invalid-payload',
      message: `ParentOS Electron sidecar protocol error: ${cause}`,
      reasonCode,
      actionHint: 'fix_parentos_sidecar_json_line_protocol',
      source: 'host',
      details: {
        domain: 'parentos-app-domain',
        cause,
        stderrTail,
      },
    });
  }

  return { invoke, close };
}

function parseSidecarResponse(line: string): SidecarResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error || 'invalid json'), {
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('sidecar response must be an object');
  }
  const record = parsed as Record<string, unknown>;
  const kind = normalizeText(record.kind);
  const allowedKeysByKind: Record<string, ReadonlySet<string>> = {
    ready: new Set(['protocolVersion', 'kind', 'id', 'appId']),
    result: new Set(['protocolVersion', 'kind', 'id', 'result']),
    error: new Set(['protocolVersion', 'kind', 'id', 'error']),
  };
  const allowedKeys = allowedKeysByKind[kind];
  if (!allowedKeys) {
    throw new Error(`unsupported sidecar response kind: ${kind || '<missing>'}`);
  }
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`sidecar response has unknown field: ${key}`);
    }
  }
  const protocolVersion = normalizeText(record.protocolVersion);
  const id = normalizeText(record.id);
  if (!protocolVersion || !id) {
    throw new Error('sidecar response requires protocolVersion and id');
  }
  if (kind === 'ready') {
    const appId = normalizeText(record.appId);
    if (!appId) {
      throw new Error('sidecar ready response requires appId');
    }
    return { protocolVersion, kind, id, appId };
  }
  if (kind === 'result') {
    return { protocolVersion, kind, id, result: record.result };
  }
  const error = record.error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    throw new Error('sidecar error response requires error object');
  }
  const errorRecord = error as Record<string, unknown>;
  const allowedErrorKeys = new Set(['code', 'reasonCode', 'actionHint', 'source', 'message', 'details']);
  for (const key of Object.keys(errorRecord)) {
    if (!allowedErrorKeys.has(key)) {
      throw new Error(`sidecar error response has unknown field: ${key}`);
    }
  }
  return { protocolVersion, kind: 'error', id, error: errorRecord as SidecarErrorResponse['error'] };
}

export async function resolveParentOSHostBinaryPath(appRoot: string): Promise<string> {
  const override = normalizeText(process.env.NIMI_PARENTOS_HOST_BIN);
  if (!app.isPackaged && override) {
    return requireExecutablePath(path.resolve(override), 'NIMI_PARENTOS_HOST_BIN');
  }
  const binaryName = process.platform === 'win32' ? 'parentos_host.exe' : 'parentos_host';
  if (app.isPackaged) {
    return requireExecutablePath(
      path.join(process.resourcesPath, 'bin', binaryName),
      'packaged ParentOS Electron resources',
    );
  }
  return requireExecutablePath(
    path.join(appRoot, 'src-tauri', 'target', 'debug', binaryName),
    'ParentOS Electron dev sidecar build',
  );
}

async function requireExecutablePath(candidate: string, source: string): Promise<string> {
  try {
    await access(candidate);
  } catch (error) {
    throw new NimiElectronShellHostError({
      code: 'external-daemon-required',
      message: `ParentOS Electron sidecar binary is unavailable from ${source}: ${candidate}`,
      reasonCode: 'parentos-electron-sidecar-binary-unavailable',
      actionHint: 'build_parentos_host_sidecar_before_launching_electron',
      source: 'host',
      details: {
        domain: 'parentos-app-domain',
        source,
        path: candidate,
        cause: error instanceof Error ? error.message : String(error || 'unknown error'),
      },
    });
  }
  return candidate;
}

function normalizePayload(command: string, payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined) {
    return {};
  }
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  throw new NimiElectronShellHostError({
    code: 'invalid-payload',
    message: `ParentOS Electron command payload must be an object for ${command}`,
    reasonCode: 'parentos-electron-sidecar-command-payload-not-object',
    actionHint: 'send_object_payload_to_parentos_app_domain_command',
    source: 'host',
    details: {
      domain: 'parentos-app-domain',
      command,
      payloadType: Array.isArray(payload) ? 'array' : typeof payload,
    },
  });
}

function normalizeDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { domain: 'parentos-app-domain' };
}

function normalizeStandardErrorCode(value: unknown): NimiStandardShellErrorCode {
  const normalized = normalizeText(value);
  return STANDARD_ERROR_CODES.has(normalized)
    ? normalized as NimiStandardShellErrorCode
    : 'host-internal-error';
}

function normalizeStandardErrorSource(value: unknown): NimiStandardShellErrorSource {
  const normalized = normalizeText(value);
  return STANDARD_ERROR_SOURCES.has(normalized)
    ? normalized as NimiStandardShellErrorSource
    : 'host';
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function recordSidecarAcceptanceEvent(event: Record<string, unknown>): Promise<void> {
  const logPath = normalizeText(process.env.NIMI_PARENTOS_ELECTRON_SIDECAR_LOG);
  if (!logPath) {
    return;
  }
  try {
    const resolved = path.resolve(logPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await appendFile(
      resolved,
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
      'utf8',
    );
  } catch {
    // Acceptance diagnostics must not change sidecar command behavior.
  }
}
