import type { NimiLocalAppSubscription, NimiLocalAppTextTurnEvent } from '@nimiplatform/sdk/app';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import {
  getParentosAISurfacePolicy,
  isParentosAISurfaceExecutable,
  type ParentosAISurfaceId,
} from './parentos-ai-surface-policy.js';
import {
  requireParentosAIConfigCapability,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
} from './parentos-ai-config.js';

// Conversation surfaces use the protected Local App text turn so prior
// user/assistant turns keep their real roles and every call stays cancelable.
// No tools are declared; reasoning continuity is neither shown nor stored.
const MAX_TURN_TOKENS = 4096;

export type ParentosTextTurnRole = 'system' | 'user' | 'assistant';

export interface ParentosTextTurnMessage {
  readonly role: ParentosTextTurnRole;
  readonly text: string;
}

export interface ParentosTextTurnBudget {
  readonly maxMessageBytes: number;
  readonly maxPromptBytes: number;
}

export interface ParentosTextTurnInput {
  readonly surfaceId: ParentosAISurfaceId;
  readonly messages: readonly ParentosTextTurnMessage[];
  readonly budget: ParentosTextTurnBudget;
  readonly defaults?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
  };
  readonly signal: AbortSignal;
}

export type ParentosTextTurnFailureKind =
  | 'ai-unavailable'
  | 'input-over-budget'
  | 'length'
  | 'content-filter'
  | 'failed'
  | 'incomplete'
  | 'empty'
  | 'unexpected-output';

export interface ParentosTextTurnFailure {
  readonly kind: ParentosTextTurnFailureKind;
  readonly reasonCode: string;
  readonly traceId: string | null;
}

export type ParentosTextTurnResult =
  | { readonly ok: true; readonly text: string; readonly traceId: string }
  | { readonly ok: false; readonly failure: ParentosTextTurnFailure };

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function failure(kind: ParentosTextTurnFailureKind, reasonCode: string, traceId: string | null = null): ParentosTextTurnResult {
  return { ok: false, failure: { kind, reasonCode, traceId } };
}

function reasonCodeOf(error: unknown, fallback: string): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  for (const key of ['reasonCode', 'code']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  const resolved = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(resolved, min), max);
}

function withinBudget(messages: readonly ParentosTextTurnMessage[], budget: ParentosTextTurnBudget): boolean {
  const encoder = new TextEncoder();
  let total = 0;
  for (const message of messages) {
    const bytes = encoder.encode(message.text).length;
    if (bytes > budget.maxMessageBytes) return false;
    total += bytes;
  }
  return total <= budget.maxPromptBytes;
}

function joinTextItems(parts: ReadonlyMap<number, string>): string {
  return [...parts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text)
    .join('');
}

// @nimi-authority: rule.parentos.advs.r004
export async function runParentosTextTurn(input: ParentosTextTurnInput): Promise<ParentosTextTurnResult> {
  const { signal } = input;
  if (signal.aborted) throw abortError();
  if (!isParentosAISurfaceExecutable(input.surfaceId)) {
    return failure('ai-unavailable', 'parentos-ai-surface-not-admitted');
  }
  const policy = getParentosAISurfacePolicy(input.surfaceId);
  if (policy.inputKind !== 'structured-local' || !policy.conversation) {
    return failure('ai-unavailable', 'parentos-ai-surface-not-admitted');
  }
  try {
    await requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT);
  } catch (error) {
    if (signal.aborted) throw abortError();
    return failure('ai-unavailable', reasonCodeOf(error, 'parentos-ai-capability-not-configured'));
  }
  if (signal.aborted) throw abortError();

  const messages = input.messages.filter((message) => message.text.trim().length > 0);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user'
    || messages.some((message, index) => message.role === 'system' && index !== 0)) {
    return failure('failed', 'parentos-ai-input-invalid');
  }
  if (!withinBudget(messages, input.budget)) {
    return failure('input-over-budget', 'parentos-ai-input-over-budget');
  }

  let subscription: NimiLocalAppSubscription<NimiLocalAppTextTurnEvent>;
  try {
    subscription = await getParentOSNimiClient().ai.text.streamTurn({
      messages: messages.map((message) => ({ role: message.role, text: message.text })),
      temperature: clampNumber(input.defaults?.temperature, 0.5, 0, 2),
      topP: clampNumber(input.defaults?.topP, 1, 0, 1),
      maxTokens: Math.trunc(clampNumber(input.defaults?.maxTokens, 1024, 1, MAX_TURN_TOKENS)),
    });
  } catch (error) {
    if (signal.aborted) throw abortError();
    return failure('failed', reasonCodeOf(error, 'runtime-service-unavailable'));
  }

  const cancel = () => { void subscription.cancel().catch(() => undefined); };
  // An abort that landed while streamTurn was opening cancels right away.
  if (signal.aborted) {
    cancel();
    throw abortError();
  }
  signal.addEventListener('abort', cancel, { once: true });

  // Deltas only accumulate in memory: nothing is visible until a completed
  // event arrives and the caller's checks pass.
  const textItems = new Map<number, string>();
  let traceId: string | null = null;
  try {
    for await (const event of subscription) {
      if (signal.aborted) break;
      traceId = event.traceId;
      if (event.type === 'delta') {
        textItems.set(event.itemIndex, (textItems.get(event.itemIndex) ?? '') + event.text);
        continue;
      }
      if (event.type === 'reasoning-continuity') {
        continue;
      }
      if (event.type === 'tool-call') {
        cancel();
        return failure('unexpected-output', 'parentos-ai-unexpected-tool-call', traceId);
      }
      if (event.type === 'failed') {
        return failure('failed', event.reasonCode || 'runtime-text-turn-failed', traceId);
      }
      if (event.finishReason === 'length') return failure('length', 'parentos-ai-output-length', traceId);
      if (event.finishReason === 'content-filter') return failure('content-filter', 'parentos-ai-content-filter', traceId);
      if (event.finishReason !== 'stop') return failure('unexpected-output', 'parentos-ai-unexpected-tool-call', traceId);
      const text = joinTextItems(textItems);
      if (!text.trim()) return failure('empty', 'parentos-ai-empty-output', traceId);
      return { ok: true, text, traceId: event.traceId };
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    return failure('failed', reasonCodeOf(error, 'runtime-text-turn-failed'), traceId);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  if (signal.aborted) throw abortError();
  return failure('incomplete', 'parentos-ai-stream-incomplete', traceId);
}
