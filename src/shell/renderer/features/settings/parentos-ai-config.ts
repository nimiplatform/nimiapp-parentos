import type {
  NimiAIConfig,
  NimiAIConfigTargetRef,
  NimiAIProfileOriginRef,
  NimiAIScopeRef,
} from '@nimiplatform/sdk/ai';
import { createEmptyNimiAIConfig, encodeNimiAIScopeRef, validateNimiAIConfig } from '@nimiplatform/sdk/ai';
import type { NimiJsonValue } from '@nimiplatform/sdk/contracts';
import {
  createInstalledNimiAppStandardShellSurface,
  type JsonObject,
} from '../../bridge/index.js';
import { i18nText } from '../../i18n/index.js';


export const PARENTOS_AI_SCOPE_REF: NimiAIScopeRef = {
  kind: 'app',
  ownerId: 'nimi.parentos',
  surfaceId: 'parentos.ai',
};

export type ParentosCapabilityId = 'text.generate' | 'text.generate.vision' | 'audio.transcribe';

export const PARENTOS_CAPABILITIES: Array<{
  id: ParentosCapabilityId;
  routeCapability: string;
  label: string;
  detail: string;
}> = [
  {
    id: 'text.generate',
    routeCapability: 'text.generate',
    label: i18nText('AISettings.capability.textGenerateLabel'),
    detail: i18nText('AISettings.capability.textGenerateDetail'),
  },
  {
    id: 'text.generate.vision',
    routeCapability: 'text.generate.vision',
    label: i18nText('AISettings.capability.textGenerateVisionLabel'),
    detail: i18nText('AISettings.capability.textGenerateVisionDetail'),
  },
  {
    id: 'audio.transcribe',
    routeCapability: 'audio.transcribe',
    label: i18nText('AISettings.capability.audioTranscribeLabel'),
    detail: i18nText('AISettings.capability.audioTranscribeDetail'),
  },
];

type UnknownObject = { readonly [key: string]: unknown };

export function createEmptyParentosAIConfig(): NimiAIConfig {
  return createEmptyNimiAIConfig(PARENTOS_AI_SCOPE_REF);
}

export function isParentosAIScopeRef(scopeRef: NimiAIScopeRef | null | undefined): boolean {
  return scopeRef?.kind === PARENTOS_AI_SCOPE_REF.kind
    && scopeRef?.ownerId === PARENTOS_AI_SCOPE_REF.ownerId
    && scopeRef?.surfaceId === PARENTOS_AI_SCOPE_REF.surfaceId;
}

export function targetRefFromConfig(
  config: NimiAIConfig,
  capabilityId: ParentosCapabilityId,
): NimiAIConfigTargetRef | null {
  return config.capabilities.targetRefs?.[capabilityId] ?? null;
}

function asObject(value: unknown): UnknownObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as UnknownObject;
}

function trimString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeScopeRef(value: unknown): NimiAIScopeRef | null {
  const object = asObject(value);
  if (!object) {
    return null;
  }
  const kind = trimString(object.kind);
  const ownerId = trimString(object.ownerId);
  const surfaceId = trimString(object.surfaceId);
  if (
    kind !== PARENTOS_AI_SCOPE_REF.kind
    || ownerId !== PARENTOS_AI_SCOPE_REF.ownerId
    || surfaceId !== PARENTOS_AI_SCOPE_REF.surfaceId
  ) {
    return null;
  }
  return { ...PARENTOS_AI_SCOPE_REF };
}

function normalizeJsonValue(value: unknown): NimiJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const next: NimiJsonValue[] = [];
    for (const item of value) {
      const normalized = normalizeJsonValue(item);
      if (normalized !== undefined) {
        next.push(normalized);
      }
    }
    return next;
  }
  const object = asObject(value);
  if (!object) {
    return undefined;
  }
  const next: { [key: string]: NimiJsonValue } = {};
  for (const [key, item] of Object.entries(object)) {
    const normalizedKey = trimString(key);
    if (!normalizedKey) {
      continue;
    }
    const normalized = normalizeJsonValue(item);
    if (normalized !== undefined) {
      next[normalizedKey] = normalized;
    }
  }
  return next;
}

function normalizeSelectedParams(value: unknown): NimiAIConfig['capabilities']['selectedParams'] {
  const object = asObject(value);
  if (!object) {
    return {};
  }
  const normalized: { [capabilityId: string]: NimiJsonValue } = {};
  for (const [capabilityId, paramsValue] of Object.entries(object)) {
    const key = trimString(capabilityId);
    const params = normalizeJsonValue(paramsValue);
    if (key && params !== undefined) {
      normalized[key] = params;
    }
  }
  return normalized;
}

function normalizeTargetRef(value: unknown): NimiAIConfigTargetRef | null {
  const object = asObject(value);
  if (!object) {
    return null;
  }
  const kind = trimString(object.kind);
  if (kind === 'cloud-connector') {
    const connectorId = trimString(object.connectorId);
    const remoteModelCatalogId = trimString(object.remoteModelCatalogId);
    const providerModelId = trimString(object.providerModelId);
    const provider = trimString(object.provider);
    if (!connectorId || !remoteModelCatalogId || !providerModelId) {
      return null;
    }
    return {
      kind,
      connectorId,
      remoteModelCatalogId,
      providerModelId,
      ...(provider ? { provider } : {}),
    };
  }
  if (kind === 'local-runtime') {
    const version = trimString(object.version);
    const profileBindingId = trimString(object.profileBindingId);
    const readinessRef = trimString(object.readinessRef);
    if (version !== 'v2') {
      return null;
    }
    if (Boolean(profileBindingId) === Boolean(readinessRef)) {
      return null;
    }
    return profileBindingId
      ? { kind, version: 'v2', profileBindingId }
      : { kind, version: 'v2', readinessRef };
  }
  if (kind === 'profile-slice') {
    const sourceProfileId = trimString(object.sourceProfileId);
    const sliceId = trimString(object.sliceId);
    if (!sourceProfileId || !sliceId) {
      return null;
    }
    return { kind, sourceProfileId, sliceId };
  }
  return null;
}

function normalizeTargetRefs(value: unknown): NimiAIConfig['capabilities']['targetRefs'] | null {
  const object = asObject(value);
  if (!object) {
    return {};
  }
  const normalized: { [capabilityId: string]: NimiAIConfigTargetRef } = {};
  for (const [capabilityId, targetRefValue] of Object.entries(object)) {
    const key = trimString(capabilityId);
    if (!key || targetRefValue == null) {
      continue;
    }
    const targetRef = normalizeTargetRef(targetRefValue);
    if (!targetRef) {
      return null;
    }
    normalized[key] = targetRef;
  }
  return normalized;
}

function normalizeProfileOrigin(value: unknown): NimiAIProfileOriginRef | null {
  if (value == null) {
    return null;
  }
  const object = asObject(value);
  if (!object) {
    return null;
  }
  const profileId = trimString(object.profileId);
  const title = trimString(object.title);
  const appliedAt = trimString(object.appliedAt);
  if (!profileId || !title || !appliedAt) {
    return null;
  }
  return { profileId, title, appliedAt };
}

export function parsePersistedParentosAIConfig(value: unknown): NimiAIConfig | null {
  let parsedValue = value;
  if (typeof parsedValue === 'string') {
    const raw = trimString(parsedValue);
    if (!raw) {
      return null;
    }
    try {
      parsedValue = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  const object = asObject(parsedValue);
  if (!object) {
    return null;
  }

  const scopeRef = normalizeScopeRef(object.scopeRef);
  const capabilities = asObject(object.capabilities);
  if (!scopeRef || !capabilities) {
    return null;
  }
  const targetRefs = normalizeTargetRefs(capabilities.targetRefs);
  if (!targetRefs) {
    return null;
  }

  const normalized = {
    scopeRef,
    capabilities: {
      targetRefs,
      selectedParams: normalizeSelectedParams(capabilities.selectedParams),
    },
    profileOrigin: normalizeProfileOrigin(object.profileOrigin),
  };
  const validation = validateNimiAIConfig(normalized);
  return validation.valid ? normalized : null;
}

export async function loadPersistedParentosAIConfig(): Promise<NimiAIConfig | null> {
  try {
    const standardShell = createInstalledNimiAppStandardShellSurface();
    const raw = await standardShell.aiConfig.get(encodeNimiAIScopeRef(PARENTOS_AI_SCOPE_REF));
    if (raw == null) {
      return null;
    }
    const parsed = parsePersistedParentosAIConfig(raw);
    if (parsed) {
      return parsed;
    }
    throw new Error('Persisted ParentOS AI config is invalid');
  } catch (error) {
    if (isStandardShellAIConfigNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function savePersistedParentosAIConfig(config: NimiAIConfig): Promise<NimiAIConfig> {
  const normalized = parsePersistedParentosAIConfig(config);
  if (!normalized) {
    throw new Error('ParentOS AI config is invalid');
  }
  const standardShell = createInstalledNimiAppStandardShellSurface();
  const saved = await standardShell.aiConfig.set(encodeNimiAIScopeRef(PARENTOS_AI_SCOPE_REF), toJsonObject(normalized));
  const parsed = parsePersistedParentosAIConfig(saved);
  if (!parsed) {
    throw new Error('ParentOS AI config persisted by standard shell is invalid');
  }
  return parsed;
}

function toJsonObject(value: NimiAIConfig): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ParentOS AI config must be a JSON object');
  }
  return value as unknown as JsonObject;
}

function isStandardShellAIConfigNotFound(error: unknown): boolean {
  const record = error as {
    readonly code?: unknown;
    readonly reasonCode?: unknown;
    readonly message?: unknown;
  };
  const text = [
    record.code,
    record.reasonCode,
    record.message,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return text.includes('ai-config-scope-not-found')
    || text.includes('scope-not-found')
    || text.includes('not-found');
}
