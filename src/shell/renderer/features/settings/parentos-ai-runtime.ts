import {
  resolveRuntimeRouteBindingFromSnapshot,
  runtimeRouteCallTargetFromResolvedBinding,
  type RuntimeCanonicalCapability,
  type RuntimeRouteBinding,
  type RuntimeRouteExecutionCallTarget,
} from '@nimiplatform/sdk/runtime';
import { getPlatformClient } from '@nimiplatform/sdk';
import { useAppStore } from '../../app-shell/app-store.js';
import type { ParentosCapabilityId } from './parentos-ai-config.js';
import {
  getParentosAISurfacePolicy,
  type ParentosAISurfaceId,
} from './parentos-ai-surface-policy.js';
import {
  loadParentosRuntimeRouteOptions,
} from '../../infra/parentos-runtime-route-options.js';

export type ParentosCallParams = {
  model?: string;
  route?: 'local' | 'cloud';
  connectorId?: string;
  localModelId?: string;
};

export function resolveParentosBinding(capabilityId: ParentosCapabilityId): ParentosCallParams | null {
  const binding = readSelectedParentosRuntimeBinding(capabilityId);
  if (!binding) {
    return null;
  }
  return parentosCallParamsFromBinding(binding);
}

export function buildParentosRuntimeMetadata(surfaceId: ParentosAISurfaceId) {
  return {
    callerKind: 'third-party-app' as const,
    callerId: 'ai.nimi.apps.parentos',
    surfaceId,
  };
}

export type ParentosTextGenerateParams = ParentosCallParams & {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type ParentosSpeechTranscribeParams = ParentosCallParams & {
  language?: string;
  responseFormat?: string;
  timestamps?: boolean;
  diarization?: boolean;
  speakerCount?: number;
  prompt?: string;
  timeoutMs?: number;
};

export type ParentosResolvedTextRuntimeParams = ParentosTextGenerateParams & {
  model: string;
  route: 'local' | 'cloud';
  localModelId?: string;
};

export type ParentosResolvedSpeechTranscribeParams = ParentosSpeechTranscribeParams & {
  model: string;
  route: 'local' | 'cloud';
  localModelId?: string;
};

export const PARENTOS_LOCAL_RUNTIME_WARM_TIMEOUT_MS = 180_000;
const TEXT_IMAGE_INPUT_CAPABILITY = 'text.generate.vision' satisfies ParentosCapabilityId;
const IMAGE_INPUT_UNSUPPORTED_ERROR_MESSAGE = '当前 AI 智能识别模型未配置，请在 AI 设置中为“智能识别”选择支持视觉输入的模型后重试。';

function getCapabilityParams(capabilityId: ParentosCapabilityId): Record<string, unknown> {
  return (useAppStore.getState().aiConfig?.capabilities.selectedParams?.[capabilityId] || {}) as Record<string, unknown>;
}

function readFiniteNumber(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readPositiveInteger(value: unknown, fallback: number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return fallback;
}

function readTrimmedString(value: unknown, fallback: string | undefined): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

function readBoolean(value: unknown, fallback: boolean | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : fallback;
}

function readSelectedParentosRuntimeBinding(capabilityId: ParentosCapabilityId): RuntimeRouteBinding | null {
  return (useAppStore.getState().aiConfig?.capabilities.selectedBindings?.[capabilityId] || null) as RuntimeRouteBinding | null;
}

function parentosCallParamsFromBinding(binding: RuntimeRouteBinding): ParentosCallParams {
  const model = String(binding.modelId || binding.model || '').trim();
  if (binding.source === 'cloud') {
    return {
      model: model || undefined,
      route: 'cloud',
      connectorId: String(binding.connectorId || '').trim() || undefined,
    };
  }
  return {
    model: model || undefined,
    route: 'local',
    localModelId: String(binding.localModelId || binding.goRuntimeLocalModelId || '').trim() || undefined,
  };
}

function parentosCallParamsFromTarget(target: RuntimeRouteExecutionCallTarget): ParentosCallParams & {
  model: string;
  route: 'local' | 'cloud';
} {
  return {
    model: target.modelId,
    route: target.source,
    connectorId: target.source === 'cloud' ? target.connectorId : undefined,
    localModelId: target.source === 'local'
      ? String(target.goRuntimeLocalModelId || target.localModelId || '').trim() || undefined
      : undefined,
  };
}

function createMissingBindingError(capabilityId: ParentosCapabilityId, surfaceId: ParentosAISurfaceId): Error {
  const capabilityLabel = capabilityId === TEXT_IMAGE_INPUT_CAPABILITY
    ? '智能识别'
    : capabilityId === 'audio.transcribe'
      ? '语音转写'
      : 'AI 对话';
  return new Error(`ParentOS ${capabilityLabel}模型未配置，请先在 AI 设置中为 ${surfaceId} 选择模型。`);
}

function createLocalOnlyBindingError(capabilityId: ParentosCapabilityId, surfaceId: ParentosAISurfaceId): Error {
  return new Error(`ParentOS ${surfaceId} requires a local ${capabilityId} binding.`);
}

async function resolveParentosRuntimeTarget(input: {
  capabilityId: ParentosCapabilityId;
  routeCapability: RuntimeCanonicalCapability;
  surfaceId: ParentosAISurfaceId;
}): Promise<RuntimeRouteExecutionCallTarget> {
  const selectedBinding = readSelectedParentosRuntimeBinding(input.capabilityId);
  if (!selectedBinding) {
    throw input.capabilityId === TEXT_IMAGE_INPUT_CAPABILITY
      ? new Error(IMAGE_INPUT_UNSUPPORTED_ERROR_MESSAGE)
      : createMissingBindingError(input.capabilityId, input.surfaceId);
  }

  const policy = getParentosAISurfacePolicy(input.surfaceId);
  if (policy.localOnly && selectedBinding.source === 'cloud') {
    throw createLocalOnlyBindingError(input.capabilityId, input.surfaceId);
  }

  const snapshot = await loadParentosRuntimeRouteOptions(input.capabilityId);
  const resolved = resolveRuntimeRouteBindingFromSnapshot({
    capability: input.routeCapability,
    binding: selectedBinding,
    snapshot,
  });
  return runtimeRouteCallTargetFromResolvedBinding(resolved);
}

function resolveParentosTextConfigForCapability(
  capabilityId: ParentosCapabilityId,
  defaults: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): ParentosTextGenerateParams {
  const params = getCapabilityParams(capabilityId);
  return {
    ...(resolveParentosBinding(capabilityId) || {}),
    temperature: readFiniteNumber(params.temperature, defaults.temperature),
    topP: readFiniteNumber(params.topP, defaults.topP),
    maxTokens: readPositiveInteger(params.maxTokens, defaults.maxTokens),
    timeoutMs: readPositiveInteger(params.timeoutMs, defaults.timeoutMs),
  };
}

export function resolveParentosTextGenerateConfig(defaults: {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
} = {}): ParentosTextGenerateParams {
  return resolveParentosTextConfigForCapability('text.generate', defaults);
}

export function resolveParentosTextSurfaceConfig(
  surfaceId: ParentosAISurfaceId,
  defaults: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): ParentosTextGenerateParams {
  const resolved = resolveParentosTextGenerateConfig(defaults);
  const policy = getParentosAISurfacePolicy(surfaceId);
  if (!policy.localOnly || resolved.route !== 'cloud') {
    return resolved;
  }
  return {
    temperature: resolved.temperature,
    topP: resolved.topP,
    maxTokens: resolved.maxTokens,
    timeoutMs: resolved.timeoutMs,
  };
}

export async function resolveParentosTextRuntimeConfig(
  surfaceId: ParentosAISurfaceId,
  defaults: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): Promise<ParentosResolvedTextRuntimeParams> {
  const resolved = resolveParentosTextSurfaceConfig(surfaceId, defaults);
  const target = await resolveParentosRuntimeTarget({
    capabilityId: 'text.generate',
    routeCapability: 'text.generate',
    surfaceId,
  });
  return {
    ...resolved,
    ...parentosCallParamsFromTarget(target),
  };
}

export async function resolveParentosImageTextRuntimeConfig(
  surfaceId: ParentosAISurfaceId,
  defaults: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): Promise<ParentosResolvedTextRuntimeParams> {
  const resolved = resolveParentosTextConfigForCapability(TEXT_IMAGE_INPUT_CAPABILITY, defaults);
  const target = await resolveParentosRuntimeTarget({
    capabilityId: TEXT_IMAGE_INPUT_CAPABILITY,
    routeCapability: TEXT_IMAGE_INPUT_CAPABILITY,
    surfaceId,
  });
  return {
    ...resolved,
    ...parentosCallParamsFromTarget(target),
  };
}

export function resolveParentosSpeechTranscribeConfig(defaults: {
  language?: string;
  responseFormat?: string;
  timestamps?: boolean;
  diarization?: boolean;
  speakerCount?: number;
  prompt?: string;
  timeoutMs?: number;
} = {}): ParentosSpeechTranscribeParams {
  const params = getCapabilityParams('audio.transcribe');
  return {
    ...(resolveParentosBinding('audio.transcribe') || {}),
    language: readTrimmedString(params.language, defaults.language),
    responseFormat: readTrimmedString(params.responseFormat, defaults.responseFormat),
    timestamps: readBoolean(params.timestamps, defaults.timestamps),
    diarization: readBoolean(params.diarization, defaults.diarization),
    speakerCount: readPositiveInteger(params.speakerCount, defaults.speakerCount),
    prompt: readTrimmedString(params.prompt, defaults.prompt),
    timeoutMs: readPositiveInteger(params.timeoutMs, defaults.timeoutMs),
  };
}

export function resolveParentosSpeechTranscribeSurfaceConfig(
  surfaceId: ParentosAISurfaceId,
  defaults: {
    language?: string;
    responseFormat?: string;
    timestamps?: boolean;
    diarization?: boolean;
    speakerCount?: number;
    prompt?: string;
    timeoutMs?: number;
  } = {},
): ParentosSpeechTranscribeParams {
  const resolved = resolveParentosSpeechTranscribeConfig(defaults);
  const policy = getParentosAISurfacePolicy(surfaceId);
  if (!policy.localOnly || resolved.route !== 'cloud') {
    return resolved;
  }
  return {
    language: resolved.language,
    responseFormat: resolved.responseFormat,
    timestamps: resolved.timestamps,
    diarization: resolved.diarization,
    speakerCount: resolved.speakerCount,
    prompt: resolved.prompt,
    timeoutMs: resolved.timeoutMs,
  };
}

export async function resolveParentosSpeechTranscribeRuntimeConfig(
  surfaceId: ParentosAISurfaceId,
  defaults: {
    language?: string;
    responseFormat?: string;
    timestamps?: boolean;
    diarization?: boolean;
    speakerCount?: number;
    prompt?: string;
    timeoutMs?: number;
  } = {},
): Promise<ParentosResolvedSpeechTranscribeParams> {
  const resolved = resolveParentosSpeechTranscribeSurfaceConfig(surfaceId, defaults);
  const target = await resolveParentosRuntimeTarget({
    capabilityId: 'audio.transcribe',
    routeCapability: 'audio.transcribe',
    surfaceId,
  });
  return {
    ...resolved,
    ...parentosCallParamsFromTarget(target),
  };
}

export async function ensureParentosLocalRuntimeReady(input: {
  route?: 'local' | 'cloud';
  localModelId?: string;
  timeoutMs?: number;
}): Promise<void> {
  if (input.route !== 'local') {
    return;
  }
  const localModelId = String(input.localModelId || '').trim();
  if (!localModelId) {
    return;
  }
  const timeoutMs = typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
    ? Math.trunc(input.timeoutMs)
    : PARENTOS_LOCAL_RUNTIME_WARM_TIMEOUT_MS;
  await getPlatformClient().runtime.local.warmLocalAsset({
    localAssetId: localModelId,
    timeoutMs,
  });
}
