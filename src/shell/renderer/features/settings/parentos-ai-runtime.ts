import {
  createNimiRuntimeAIModel,
  runNimiTextGenerate,
  streamNimiTextResponse,
} from '@nimiplatform/sdk/ai';
import type { NimiAIConfigTargetRef, NimiTextGenerateResult, NimiTextStreamResponseResult } from '@nimiplatform/sdk/ai';
import type { NimiJsonObject, NimiJsonValue, NimiMessage, NimiModelRef } from '@nimiplatform/sdk/contracts';
import type { CoreMetadata } from '@nimiplatform/sdk/types';
import {
  ChatContentPartType,
  ExecutionMode,
  FallbackPolicy,
  FinishReason,
  RoutePolicy,
  ScenarioType,
  type ChatContentPart,
  type ChatMessage,
  type ExecuteScenarioRequest,
  type ExecuteScenarioResponse,
  type ScenarioArtifact,
} from '@nimiplatform/sdk/runtime/generated';
import { useAppStore } from '../../app-shell/app-store.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import type { ParentosCapabilityId } from './parentos-ai-config.js';
import { PARENTOS_AI_SCOPE_REF, targetRefFromConfig } from './parentos-ai-config.js';
import {
  getParentosAISurfacePolicy,
  type ParentosAISurfaceId,
} from './parentos-ai-surface-policy.js';

export type ParentosCallParams = {
  model?: string;
  route?: 'local' | 'cloud';
  connectorId?: string;
  localModelId?: string;
};

export function resolveParentosBinding(capabilityId: ParentosCapabilityId): ParentosCallParams | null {
  const targetRef = readParentosTargetRef(capabilityId);
  return targetRef ? parentosCallParamsFromTargetRef(targetRef) : null;
}

export function buildParentosRuntimeMetadata(surfaceId: ParentosAISurfaceId): CoreMetadata {
  return {
    callerKind: 'third-party-app',
    callerId: 'ai.nimi.apps.parentos',
    surfaceId,
  };
}

function toParentosCoreMetadata(
  surfaceId: ParentosAISurfaceId,
  metadata: NimiJsonObject | undefined,
): CoreMetadata {
  const projected: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === 'string') {
      projected[key] = value;
    }
  }
  return {
    ...buildParentosRuntimeMetadata(surfaceId),
    ...projected,
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

export interface ParentosTextGenerationInput {
  readonly surfaceId: ParentosAISurfaceId;
  readonly capabilityId?: Extract<ParentosCapabilityId, 'text.generate' | 'text.generate.vision'>;
  readonly messages: readonly NimiMessage[];
  readonly defaults?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
    readonly timeoutMs?: number;
  };
  readonly metadata?: NimiJsonObject;
  readonly signal?: AbortSignal;
}

export interface ParentosSpeechTranscribeInput {
  readonly surfaceId: ParentosAISurfaceId;
  readonly audioBytes: Uint8Array;
  readonly mimeType: string;
  readonly defaults?: {
    readonly language?: string;
    readonly responseFormat?: string;
    readonly timestamps?: boolean;
    readonly diarization?: boolean;
    readonly speakerCount?: number;
    readonly prompt?: string;
    readonly timeoutMs?: number;
  };
}

export interface ParentosSpeechTranscribeOutput {
  readonly text: string;
  readonly artifacts: readonly ScenarioArtifact[];
  readonly trace: {
    readonly traceId?: string;
    readonly modelResolved?: string;
    readonly routeDecision?: string;
  };
}

export const PARENTOS_LOCAL_RUNTIME_WARM_TIMEOUT_MS = 180_000;
const TEXT_IMAGE_INPUT_CAPABILITY = 'text.generate.vision' satisfies ParentosCapabilityId;
const IMAGE_INPUT_UNSUPPORTED_ERROR_MESSAGE = '当前 AI 智能识别模型未配置，请在 AI 设置中为“智能识别”选择支持视觉输入的模型后重试。';

function getCapabilityParams(capabilityId: ParentosCapabilityId): { readonly [key: string]: NimiJsonValue } {
  const value = useAppStore.getState().aiConfig?.capabilities.selectedParams?.[capabilityId];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as { readonly [key: string]: NimiJsonValue }
    : {};
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

function readParentosTargetRef(capabilityId: ParentosCapabilityId): NimiAIConfigTargetRef | null {
  const config = useAppStore.getState().aiConfig;
  return config ? targetRefFromConfig(config, capabilityId) : null;
}

function parentosCallParamsFromTargetRef(targetRef: NimiAIConfigTargetRef): ParentosCallParams {
  if (targetRef.kind === 'cloud-connector') {
    return {
      model: targetRef.providerModelId,
      route: 'cloud',
      connectorId: targetRef.connectorId,
    };
  }
  if (targetRef.kind === 'local-runtime') {
    const model = String(targetRef.targetId || targetRef.profileId || targetRef.readinessRef || '').trim();
    return {
      model: model || undefined,
      route: 'local',
      localModelId: String(targetRef.targetId || '').trim() || undefined,
    };
  }
  return {};
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
  return new Error(`ParentOS ${surfaceId} requires a local ${capabilityId} target.`);
}

function resolveParentosTargetRef(input: {
  capabilityId: ParentosCapabilityId;
  surfaceId: ParentosAISurfaceId;
}): NimiAIConfigTargetRef {
  const targetRef = readParentosTargetRef(input.capabilityId);
  if (!targetRef) {
    throw input.capabilityId === TEXT_IMAGE_INPUT_CAPABILITY
      ? new Error(IMAGE_INPUT_UNSUPPORTED_ERROR_MESSAGE)
      : createMissingBindingError(input.capabilityId, input.surfaceId);
  }
  if (targetRef.kind === 'profile-slice') {
    throw new Error(`ParentOS ${input.surfaceId} cannot execute unresolved profile-slice target ${targetRef.sourceProfileId}/${targetRef.sliceId}.`);
  }
  const policy = getParentosAISurfacePolicy(input.surfaceId);
  if (policy.localOnly && targetRef.kind === 'cloud-connector') {
    throw createLocalOnlyBindingError(input.capabilityId, input.surfaceId);
  }
  return targetRef;
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

function requireResolvedModel(input: ParentosCallParams, capabilityId: ParentosCapabilityId, surfaceId: ParentosAISurfaceId): {
  readonly model: string;
  readonly route: 'local' | 'cloud';
  readonly connectorId?: string;
  readonly localModelId?: string;
} {
  const model = String(input.model || '').trim();
  const route = input.route === 'cloud' ? 'cloud' : input.route === 'local' ? 'local' : null;
  if (!model || !route) {
    throw createMissingBindingError(capabilityId, surfaceId);
  }
  return {
    model,
    route,
    connectorId: input.connectorId,
    localModelId: input.localModelId,
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
  const targetRef = resolveParentosTargetRef({
    capabilityId: 'text.generate',
    surfaceId,
  });
  return {
    ...resolved,
    ...requireResolvedModel(parentosCallParamsFromTargetRef(targetRef), 'text.generate', surfaceId),
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
  const targetRef = resolveParentosTargetRef({
    capabilityId: TEXT_IMAGE_INPUT_CAPABILITY,
    surfaceId,
  });
  return {
    ...resolved,
    ...requireResolvedModel(parentosCallParamsFromTargetRef(targetRef), TEXT_IMAGE_INPUT_CAPABILITY, surfaceId),
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
  const targetRef = resolveParentosTargetRef({
    capabilityId: 'audio.transcribe',
    surfaceId,
  });
  return {
    ...resolved,
    ...requireResolvedModel(parentosCallParamsFromTargetRef(targetRef), 'audio.transcribe', surfaceId),
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
  await getParentOSNimiClient().runtime.local.warmLocalAsset({
    localAssetId: localModelId,
    timeoutMs,
  });
}

function toModelRef(params: ParentosResolvedTextRuntimeParams | ParentosResolvedSpeechTranscribeParams): NimiModelRef {
  return {
    modelId: params.model,
    ...(params.connectorId ? { providerId: params.connectorId } : {}),
  };
}

function toRuntimeRoutePolicy(route: 'local' | 'cloud'): RoutePolicy {
  return route === 'local' ? RoutePolicy.LOCAL : RoutePolicy.CLOUD;
}

function routePolicyName(routePolicy: unknown): string | undefined {
  if (routePolicy === RoutePolicy.LOCAL) return 'local';
  if (routePolicy === RoutePolicy.CLOUD) return 'cloud';
  return undefined;
}

function buildTextRequest(input: ParentosTextGenerationInput, params: ParentosResolvedTextRuntimeParams) {
  const model = toModelRef(params);
  return {
    model,
    messages: input.messages,
    parameters: {
      temperature: params.temperature,
      topP: params.topP,
      maxTokens: params.maxTokens,
      metadata: input.metadata ?? buildParentosRuntimeMetadata(input.surfaceId),
    },
    signal: input.signal,
  };
}

export async function runParentosTextGenerate(
  input: ParentosTextGenerationInput,
): Promise<NimiTextGenerateResult> {
  const params = input.capabilityId === TEXT_IMAGE_INPUT_CAPABILITY
    ? await resolveParentosImageTextRuntimeConfig(input.surfaceId, input.defaults)
    : await resolveParentosTextRuntimeConfig(input.surfaceId, input.defaults);
  await ensureParentosLocalRuntimeReady({
    route: params.route,
    localModelId: params.localModelId,
    timeoutMs: params.timeoutMs,
  });
  const model = createNimiRuntimeAIModel({
    runtime: getParentOSNimiClient().runtime,
    appId: PARENTOS_AI_SCOPE_REF.ownerId,
    model: toModelRef(params),
    routePolicy: params.route,
    connectorId: params.connectorId,
    timeoutMs: params.timeoutMs,
    metadata: toParentosCoreMetadata(input.surfaceId, input.metadata),
  });
  return runNimiTextGenerate({
    runtime: { model },
    request: buildTextRequest(input, params),
  });
}

export async function streamParentosTextGenerate(
  input: ParentosTextGenerationInput,
  handlers: Parameters<typeof streamNimiTextResponse>[1] = {},
): Promise<NimiTextStreamResponseResult> {
  const params = await resolveParentosTextRuntimeConfig(input.surfaceId, input.defaults);
  await ensureParentosLocalRuntimeReady({
    route: params.route,
    localModelId: params.localModelId,
    timeoutMs: params.timeoutMs,
  });
  const model = createNimiRuntimeAIModel({
    runtime: getParentOSNimiClient().runtime,
    appId: PARENTOS_AI_SCOPE_REF.ownerId,
    model: toModelRef(params),
    routePolicy: params.route,
    connectorId: params.connectorId,
    timeoutMs: params.timeoutMs,
    metadata: toParentosCoreMetadata(input.surfaceId, input.metadata),
  });
  return streamNimiTextResponse({
    runtime: { model },
    request: buildTextRequest(input, params),
    signal: input.signal,
  }, handlers);
}

function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function imagePartFromData(data: NimiJsonValue): ChatContentPart | null {
  if (!isObject(data)) {
    return null;
  }
  const type = String(data.type || '').trim();
  const imageUrlValue = data.imageUrl ?? data.image_url;
  const url = typeof imageUrlValue === 'string'
    ? imageUrlValue.trim()
    : isObject(imageUrlValue)
      ? String(imageUrlValue.url || '').trim()
      : String(data.url || '').trim();
  const detail = isObject(imageUrlValue)
    ? String(imageUrlValue.detail || data.detail || '').trim()
    : String(data.detail || '').trim();
  if (!url || !['image-url', 'image_url', 'imageUrl'].includes(type)) {
    return null;
  }
  return {
    type: ChatContentPartType.IMAGE_URL,
    content: {
      oneofKind: 'imageUrl',
      imageUrl: { url, detail },
    },
  };
}

function toRuntimeChatMessages(messages: readonly NimiMessage[]): {
  readonly systemPrompt: string;
  readonly conversation: ChatMessage[];
} {
  const systemPrompts: string[] = [];
  const conversation: ChatMessage[] = [];
  for (const message of messages) {
    const parts: ChatContentPart[] = [];
    const textSegments: string[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        const text = part.text;
        textSegments.push(text);
        if (text.trim()) {
          parts.push({
            type: ChatContentPartType.TEXT,
            content: { oneofKind: 'text', text },
          });
        }
        continue;
      }
      const imagePart = imagePartFromData(part.data);
      if (imagePart) {
        parts.push(imagePart);
        continue;
      }
      throw Object.assign(new Error('ParentOS text scenario data part is unsupported by Runtime text.generate.'), {
        code: 'AI_MODALITY_NOT_SUPPORTED',
        reasonCode: 'AI_MODALITY_NOT_SUPPORTED',
      });
    }
    const text = textSegments.join('');
    if (message.role === 'system' || message.role === 'developer') {
      if (text.trim()) {
        systemPrompts.push(text);
      }
      continue;
    }
    conversation.push({
      role: message.role,
      content: text,
      name: String(message.name || ''),
      parts,
    });
  }
  if (conversation.length === 0) {
    throw new Error('ParentOS text generation requires at least one user or assistant message.');
  }
  return {
    systemPrompt: systemPrompts.join('\n\n'),
    conversation,
  };
}

function buildTextScenarioRequest(input: ParentosTextGenerationInput, params: ParentosResolvedTextRuntimeParams): ExecuteScenarioRequest {
  const messages = toRuntimeChatMessages(input.messages);
  return {
    head: {
      appId: PARENTOS_AI_SCOPE_REF.ownerId,
      subjectUserId: '',
      modelId: params.model,
      routePolicy: toRuntimeRoutePolicy(params.route),
      fallback: FallbackPolicy.DENY,
      timeoutMs: Number(params.timeoutMs ?? 0),
      connectorId: String(params.connectorId || ''),
    },
    scenarioType: ScenarioType.TEXT_GENERATE,
    executionMode: ExecutionMode.SYNC,
    spec: {
      spec: {
        oneofKind: 'textGenerate',
        textGenerate: {
          input: [...messages.conversation],
          systemPrompt: messages.systemPrompt,
          tools: [],
          temperature: Number(params.temperature ?? 0),
          topP: Number(params.topP ?? 0),
          maxTokens: Number(params.maxTokens ?? 0),
        },
      },
    },
    extensions: [],
  };
}

function textFromScenarioResponse(response: ExecuteScenarioResponse): string {
  const output = response.output?.output;
  if (output?.oneofKind !== 'textGenerate') {
    throw new Error('Runtime textGenerate response is missing text output.');
  }
  return output.textGenerate.text;
}

export async function runParentosMultimodalTextGenerate(input: ParentosTextGenerationInput): Promise<{
  readonly text: string;
  readonly response: ExecuteScenarioResponse;
}> {
  const params = input.capabilityId === TEXT_IMAGE_INPUT_CAPABILITY
    ? await resolveParentosImageTextRuntimeConfig(input.surfaceId, input.defaults)
    : await resolveParentosTextRuntimeConfig(input.surfaceId, input.defaults);
  await ensureParentosLocalRuntimeReady({
    route: params.route,
    localModelId: params.localModelId,
    timeoutMs: params.timeoutMs,
  });
  const response = await getParentOSNimiClient().runtime.ai.executeScenario(
    buildTextScenarioRequest(input, params),
    {
      timeoutMs: params.timeoutMs,
      metadata: toParentosCoreMetadata(input.surfaceId, input.metadata),
      signal: input.signal,
    },
  );
  return {
    text: textFromScenarioResponse(response),
    response,
  };
}

export async function runParentosSpeechTranscribe(
  input: ParentosSpeechTranscribeInput,
): Promise<ParentosSpeechTranscribeOutput> {
  const mimeType = input.mimeType.trim();
  if (!mimeType) {
    throw new Error('voice observation transcription requires a mimeType');
  }
  if (input.audioBytes.length === 0) {
    throw new Error('voice observation transcription requires audio bytes');
  }
  const params = await resolveParentosSpeechTranscribeRuntimeConfig(input.surfaceId, input.defaults);
  await ensureParentosLocalRuntimeReady({
    route: params.route,
    localModelId: params.localModelId,
    timeoutMs: params.timeoutMs,
  });
  const response = await getParentOSNimiClient().runtime.ai.executeScenario({
    head: {
      appId: PARENTOS_AI_SCOPE_REF.ownerId,
      subjectUserId: '',
      modelId: params.model,
      routePolicy: toRuntimeRoutePolicy(params.route),
      fallback: FallbackPolicy.DENY,
      timeoutMs: Number(params.timeoutMs ?? 0),
      connectorId: String(params.connectorId || ''),
    },
    scenarioType: ScenarioType.SPEECH_TRANSCRIBE,
    executionMode: ExecutionMode.SYNC,
    spec: {
      spec: {
        oneofKind: 'speechTranscribe',
        speechTranscribe: {
          mimeType,
          language: params.language || '',
          timestamps: Boolean(params.timestamps),
          diarization: Boolean(params.diarization),
          speakerCount: Number(params.speakerCount ?? 0),
          prompt: params.prompt || '',
          responseFormat: params.responseFormat || 'text',
          audioSource: {
            source: {
              oneofKind: 'audioBytes',
              audioBytes: input.audioBytes,
            },
          },
        },
      },
    },
    extensions: [],
  }, {
    timeoutMs: params.timeoutMs,
    metadata: buildParentosRuntimeMetadata(input.surfaceId),
  });
  const output = response.output?.output;
  if (output?.oneofKind !== 'speechTranscribe') {
    throw new Error('runtime speechTranscribe output is missing transcript text');
  }
  if (response.finishReason !== FinishReason.STOP && response.finishReason !== FinishReason.UNSPECIFIED) {
    throw new Error(`runtime speechTranscribe did not finish cleanly: ${FinishReason[response.finishReason] || response.finishReason}`);
  }
  return {
    text: output.speechTranscribe.text,
    artifacts: output.speechTranscribe.artifacts,
    trace: {
      traceId: response.traceId || undefined,
      modelResolved: response.modelResolved || undefined,
      routeDecision: routePolicyName(response.routeDecision),
    },
  };
}
