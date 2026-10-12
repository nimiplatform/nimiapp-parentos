import type { NimiLocalAppTextMessage } from '@nimiplatform/sdk/app';
import type { NimiMessage } from '@nimiplatform/sdk/contracts';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import {
  getParentosAISurfacePolicy,
  isParentosAISurfaceExecutable,
  type ParentosAISurfaceId,
} from './parentos-ai-surface-policy.js';
import { i18nText } from '../../i18n/index.js';
import {
  requireParentosAIConfigCapability,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
} from './parentos-ai-config.js';

// ParentOS keeps its product text budget on the cancellable synchronous
// text.generate operation. This path admits at most 8 messages (system first and at
// least one user), 32 KiB per message, 64 KiB aggregate, and 4096 output
// tokens. Tools and attachments remain outside this text helper.
const MAX_CANDIDATE_MESSAGES = 8;
const MAX_CANDIDATE_MESSAGE_BYTES = 32 * 1024;
const MAX_CANDIDATE_PROMPT_BYTES = 64 * 1024;
const MAX_CANDIDATE_TOKENS = 4096;
type ParentosTextMessage = Pick<NimiLocalAppTextMessage, 'text'> & { readonly role: 'system' | 'user' };

export type ParentosTextGenerateDefaults = {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
};

export interface ParentosTextGenerationInput {
  readonly surfaceId: ParentosAISurfaceId;
  readonly messages: readonly NimiMessage[];
  readonly defaults?: ParentosTextGenerateDefaults;
  readonly signal?: AbortSignal;
}

export type ParentosTextGenerateError = {
  readonly message: string;
  readonly reasonCode: string;
  readonly cause?: unknown;
};

export type ParentosTextGenerateResult =
  | {
    readonly ok: true;
    readonly text: string;
    readonly finishReason: 'stop' | 'length' | 'content-filter';
    readonly traceId: string;
  }
  | { readonly ok: false; readonly error: ParentosTextGenerateError };

type ParentosAIError = Error & { reasonCode: string };

function createParentosAIError(message: string, reasonCode: string): ParentosAIError {
  return Object.assign(new Error(message), { reasonCode });
}

export function createParentosAISurfaceUnavailableError(surfaceId: ParentosAISurfaceId): ParentosAIError {
  return createParentosAIError(
    `ParentOS surface ${surfaceId} has no admitted Nimi App Access operation.`,
    'parentos-ai-surface-not-admitted',
  );
}

function reasonCodeFromUnknownError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const reasonCode = typeof record.reasonCode === 'string' ? record.reasonCode.trim() : '';
  if (reasonCode) {
    return reasonCode;
  }
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  return code || 'runtime-service-unavailable';
}

function textFromMessageContent(message: NimiMessage): string {
  const segments: string[] = [];
  for (const part of message.content) {
    if (part.type === 'text') {
      segments.push(part.text);
      continue;
    }
    throw createParentosAIError(
      i18nText('AISettings.runtime.imageInputUnsupported'),
      'parentos-ai-message-part-unsupported',
    );
  }
  return segments.join('');
}

function toParentosTextMessages(
  messages: readonly NimiMessage[],
): readonly ParentosTextMessage[] {
  const systemTexts: string[] = [];
  const userMessages: ParentosTextMessage[] = [];
  for (const message of messages) {
    const text = textFromMessageContent(message);
    if (message.role === 'system' || message.role === 'developer') {
      if (text.trim()) {
        systemTexts.push(text);
      }
      continue;
    }
    if (message.role === 'user') {
      userMessages.push({ role: 'user', text });
      continue;
    }
    // These foreground workflows admit system/user source inputs. A separate
    // conversation workflow would have to carry its canonical history explicitly.
    throw createParentosAIError(
      `ParentOS foreground text generation does not accept role "${String(message.role)}".`,
      'parentos-ai-message-role-unsupported',
    );
  }
  const candidate: ParentosTextMessage[] = [];
  if (systemTexts.length > 0) {
    candidate.push({ role: 'system', text: systemTexts.join('\n\n') });
  }
  candidate.push(...userMessages);
  if (candidate.length === 0 || userMessages.length === 0) {
    throw createParentosAIError(
      'ParentOS text generation requires at least one user message.',
      'parentos-ai-input-invalid',
    );
  }
  if (candidate.length > MAX_CANDIDATE_MESSAGES) {
    throw createParentosAIError(
      `ParentOS text generation exceeds the ${MAX_CANDIDATE_MESSAGES}-message unary bound.`,
      'parentos-ai-input-over-budget',
    );
  }
  return candidate;
}

function assertPromptBudget(messages: readonly ParentosTextMessage[]): void {
  const encoder = new TextEncoder();
  let totalBytes = 0;
  for (const message of messages) {
    const bytes = encoder.encode(message.text).length;
    if (bytes > MAX_CANDIDATE_MESSAGE_BYTES) {
      throw createParentosAIError(
        `ParentOS text generation message exceeds the ${MAX_CANDIDATE_MESSAGE_BYTES}-byte unary bound.`,
        'parentos-ai-input-over-budget',
      );
    }
    totalBytes += bytes;
  }
  if (totalBytes > MAX_CANDIDATE_PROMPT_BYTES) {
    throw createParentosAIError(
      `ParentOS text generation prompt exceeds the ${MAX_CANDIDATE_PROMPT_BYTES}-byte unary bound.`,
      'parentos-ai-input-over-budget',
    );
  }
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  const resolved = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(resolved, min), max);
}

function resolveMaxTokens(value: number | undefined): number {
  const resolved = typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1024;
  return Math.min(Math.max(resolved, 1), MAX_CANDIDATE_TOKENS);
}

async function awaitPreparation<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  let onAbort!: () => void;
  const cancellation = new Promise<T>((_resolve, reject) => {
    onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([pending, cancellation]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

// @nimi-authority: rule.parentos.advs.r011
export async function runParentosTextGenerate(
  input: ParentosTextGenerationInput,
): Promise<ParentosTextGenerateResult> {
  if (input.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  try {
    if (!isParentosAISurfaceExecutable(input.surfaceId)) {
      throw createParentosAISurfaceUnavailableError(input.surfaceId);
    }
    const policy = getParentosAISurfacePolicy(input.surfaceId);
    if (policy.inputKind !== 'structured-local' && policy.inputKind !== 'closed-set') {
      throw createParentosAISurfaceUnavailableError(input.surfaceId);
    }
    await awaitPreparation(requireParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT), input.signal);
    input.signal?.throwIfAborted();
    const messages = toParentosTextMessages(input.messages);
    assertPromptBudget(messages);
    const result = await getParentOSNimiClient().ai.scenario.execute({
      type: 'text-generate',
      messages,
      temperature: clampNumber(input.defaults?.temperature, 0.7, 0, 2),
      topP: clampNumber(input.defaults?.topP, 1, 0, 1),
      maxTokens: resolveMaxTokens(input.defaults?.maxTokens),
    }, input.signal ? { signal: input.signal } : undefined);
    input.signal?.throwIfAborted();
    if (!('type' in result.output) || result.output.type !== 'text-generate'
      || result.output.finishReason === 'tool-calls'
      || result.output.items.some((item) => item.type === 'tool-call')) {
      throw createParentosAIError('ParentOS text generation returned an unexpected output.', 'parentos-ai-output-invalid');
    }
    const text = result.output.items.filter((item) => item.type === 'text').map((item) => item.text).join('');
    if (!text.trim()) throw createParentosAIError('ParentOS text generation returned no text.', 'parentos-ai-output-invalid');
    return {
      ok: true,
      text,
      finishReason: result.output.finishReason,
      traceId: result.traceId,
    };
  } catch (error) {
    if (input.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error || 'ParentOS text generation failed'),
        reasonCode: reasonCodeFromUnknownError(error),
        cause: error,
      },
    };
  }
}
