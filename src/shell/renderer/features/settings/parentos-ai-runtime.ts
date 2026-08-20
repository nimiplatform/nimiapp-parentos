import type { NimiLocalAppTextCandidateMessage } from '@nimiplatform/sdk/app';
import type { NimiMessage } from '@nimiplatform/sdk/contracts';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import {
  getParentosAISurfacePolicy,
  isParentosAISurfaceExecutable,
  type ParentosAISurfaceId,
} from './parentos-ai-surface-policy.js';
import { i18nText } from '../../i18n/index.js';
import {
  hasParentosAIConfigCapability,
  PARENTOS_TEXT_CAPABILITY_CONTRACT,
} from './parentos-ai-config.js';

// ParentOS text surfaces deliberately use the bounded foreground candidate
// operation even though current App Access also exposes text-turn streaming
// and Scenario Jobs. This path admits at most 8 messages (system first and at
// least one user), 32 KiB per message, 64 KiB aggregate, and 4096 output
// tokens. Tools and attachments remain outside this text helper.
const MAX_CANDIDATE_MESSAGES = 8;
const MAX_CANDIDATE_MESSAGE_BYTES = 32 * 1024;
const MAX_CANDIDATE_PROMPT_BYTES = 64 * 1024;
const MAX_CANDIDATE_TOKENS = 4096;

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

function toCandidateMessages(
  messages: readonly NimiMessage[],
): readonly NimiLocalAppTextCandidateMessage[] {
  const systemTexts: string[] = [];
  const userMessages: NimiLocalAppTextCandidateMessage[] = [];
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
    // The unary surface admits system/user roles only; history compaction is a
    // product decision and must never fabricate roles silently.
    throw createParentosAIError(
      `ParentOS text generation cannot map role "${String(message.role)}" onto the unary candidate contract.`,
      'parentos-ai-message-role-unsupported',
    );
  }
  const candidate: NimiLocalAppTextCandidateMessage[] = [];
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

function assertPromptBudget(messages: readonly NimiLocalAppTextCandidateMessage[]): void {
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
    if (!await hasParentosAIConfigCapability(PARENTOS_TEXT_CAPABILITY_CONTRACT)) {
      throw createParentosAIError(
        'ParentOS text generation requires a Nimi-owned text.generate AIConfig intent.',
        'parentos-ai-capability-not-configured',
      );
    }
    const messages = toCandidateMessages(input.messages);
    assertPromptBudget(messages);
    const result = await getParentOSNimiClient().ai.text.generateCandidate({
      messages,
      temperature: clampNumber(input.defaults?.temperature, 0.7, 0, 2),
      topP: clampNumber(input.defaults?.topP, 1, 0, 1),
      maxTokens: resolveMaxTokens(input.defaults?.maxTokens),
    });
    return {
      ok: true,
      text: result.text,
      finishReason: result.finishReason,
      traceId: result.traceId,
    };
  } catch (error) {
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
