import {
  getParentOSNimiClient,
  getParentOSWebSession,
  hasParentOSNimiClient,
} from './parentos-nimi-client.js';

// Three independent facts stay independent: the App keeps running, Nimi access
// is a typed posture, and official tooling is the host's concern. Losing Nimi
// access never quits the App and never swaps the Host; the same Host rebinds
// (Kit-owned) and the App renders this posture and offers retry.
export type ParentosNimiAccessState =
  | 'ready'
  | 'action-required'
  | 'unavailable'
  | 'bridge-absent';

export type ParentosNimiAccessPosture = {
  readonly state: ParentosNimiAccessState;
  readonly reasonCode: string;
  readonly actionHint: string;
  readonly retryable: boolean;
};

const BRIDGE_ABSENT_POSTURE: ParentosNimiAccessPosture = {
  state: 'bridge-absent',
  reasonCode: 'nimi-shell-runtime-bridge-unavailable',
  actionHint: 'launch_parentos_through_nimi_local_app_host',
  retryable: true,
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function postureFromError(error: unknown): ParentosNimiAccessPosture {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const reasonCode = normalizeText(record.reasonCode)
    || normalizeText(record.code)
    || 'runtime-service-unavailable';
  const actionHint = normalizeText(record.actionHint)
    || normalizeText(record.action_hint)
    || 'retry_or_restart_nimi_runtime';
  return {
    state: 'unavailable',
    reasonCode,
    actionHint,
    retryable: typeof record.retryable === 'boolean' ? record.retryable : false,
  };
}

export async function probeParentosNimiAccess(): Promise<ParentosNimiAccessPosture> {
  const webSession = getParentOSWebSession();
  if (webSession) {
    const snapshot = webSession.getSnapshot();
    if (snapshot.runtime.status === 'connected' && !snapshot.runtime.scope.signal.aborted) {
      return {
        state: 'ready',
        reasonCode: 'ok',
        actionHint: 'none',
        retryable: false,
      };
    }
    if (snapshot.identity.status !== 'signed-in') {
      return {
        state: 'action-required',
        reasonCode: normalizeText(snapshot.issue?.reasonCode) || 'runtime-unauthenticated',
        actionHint: normalizeText(snapshot.issue?.actionHint) || 'sign_in_nimi',
        retryable: true,
      };
    }
    return {
      state: 'unavailable',
      reasonCode: normalizeText(snapshot.issue?.reasonCode) || 'runtime-disconnected',
      actionHint: normalizeText(snapshot.issue?.actionHint) || 'reconnect_primary_runtime',
      retryable: true,
    };
  }
  if (!hasParentOSNimiClient()) {
    return BRIDGE_ABSENT_POSTURE;
  }
  try {
    const client = getParentOSNimiClient();
    if (!('auth' in client)) {
      return {
        state: 'ready',
        reasonCode: 'ok',
        actionHint: 'none',
        retryable: false,
      };
    }
    const session = await client.auth.status();
    if (session.sessionBound) {
      return {
        state: 'ready',
        reasonCode: session.reasonCode,
        actionHint: session.actionHint,
        retryable: session.retryable,
      };
    }
    return {
      state: session.state === 'unavailable' ? 'unavailable' : 'action-required',
      reasonCode: session.reasonCode,
      actionHint: session.actionHint,
      retryable: session.retryable,
    };
  } catch (error) {
    return postureFromError(error);
  }
}
