import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Monitor,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  AudioTranscribeParamsEditor,
  DEFAULT_AUDIO_TRANSCRIBE_PARAMS,
  DEFAULT_TEXT_GENERATE_PARAMS,
  TextGenerateParamsEditor,
  createAudioTranscribeEditorCopy,
  createTextGenerateEditorCopy,
  parseAudioTranscribeParams,
  parseTextGenerateParams,
  type AppModelConfigSurface,
  type AudioTranscribeParamsState,
  type ModelConfigProjectionStatus,
  type TextGenerateParamsState,
} from '@nimiplatform/kit/features/model-config';
import {
  applyModelConfigCapabilityPatch,
  readModelConfigTargetRef,
  summarizeTargetRef,
} from '@nimiplatform/kit/core/model-config';
import { ModelPickerModal } from '@nimiplatform/kit/features/model-picker/ui';
import type { RouteModelPickerDataProvider, RouteModelPickerSelection } from '@nimiplatform/kit/features/model-picker';
import { buttonVariants, cn } from '@nimiplatform/kit/ui';
import type { NimiAIConfig, NimiAIConfigTargetRef } from '@nimiplatform/sdk/ai';
import type { NimiJsonValue } from '@nimiplatform/sdk/contracts';
import type { ParentosCapabilityId } from './parentos-ai-config.js';
import { commitParentosAIConfig } from './parentos-ai-config-service.js';
import { i18nText } from '../../i18n/index.js';


export type ParentosAICapabilityDescriptor = {
  id: ParentosCapabilityId;
  routeCapability: string;
  label: string;
  detail: string;
};

export type ParentosAICapabilityCardProps = {
  capability: ParentosAICapabilityDescriptor;
  icon: LucideIcon;
  surface: AppModelConfigSurface;
  config: NimiAIConfig;
  status: ModelConfigProjectionStatus;
};

function readTargetRef(config: NimiAIConfig, capabilityId: ParentosCapabilityId): NimiAIConfigTargetRef | null {
  return readModelConfigTargetRef(config, capabilityId) as NimiAIConfigTargetRef | null;
}

function targetRefLabel(targetRef: NimiAIConfigTargetRef | null): string | null {
  if (!targetRef) {
    return null;
  }
  const summary = summarizeTargetRef(targetRef);
  return [summary.label, summary.detail].filter(Boolean).join(' · ') || null;
}

function targetSourceLabel(targetRef: NimiAIConfigTargetRef | null): string {
  if (!targetRef) {
    return i18nText('AISettings.card.notBound');
  }
  if (targetRef.kind === 'cloud-connector') {
    return targetRef.provider || targetRef.connectorId || 'Cloud';
  }
  if (targetRef.kind === 'local-runtime') {
    return targetRef.profileBindingId || targetRef.readinessRef || 'Local Runtime';
  }
  return 'Profile slice';
}

function isJsonObject(value: NimiJsonValue | undefined): value is { readonly [key: string]: NimiJsonValue } {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readParams(config: NimiAIConfig, capabilityId: ParentosCapabilityId): { readonly [key: string]: NimiJsonValue } {
  const raw = config.capabilities.selectedParams?.[capabilityId];
  return isJsonObject(raw) ? raw : {};
}

function hasConfiguredParams(params: { readonly [key: string]: NimiJsonValue }): boolean {
  return Object.values(params).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== '' && value != null && value !== false;
  });
}

function commitCapabilityPatch(
  surface: AppModelConfigSurface,
  capabilityId: ParentosCapabilityId,
  patch: {
    targetRef?: NimiAIConfigTargetRef | null;
    params?: NimiJsonValue;
  },
): Promise<void> {
  const aiConfigService = surface.aiConfigService;
  if (!aiConfigService) {
    throw new Error('ParentOS AI config service is unavailable on this model-config surface.');
  }
  const current = aiConfigService.aiConfig.get(surface.scopeRef);
  return commitParentosAIConfig(
    applyModelConfigCapabilityPatch(current, capabilityId, patch),
  ).then(() => undefined);
}

function statusClasses(status: ModelConfigProjectionStatus): string {
  return status.supported
    ? 'border-[color-mix(in_srgb,var(--nimi-status-success)_24%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-success)_9%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]'
    : 'border-[color-mix(in_srgb,var(--nimi-status-warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]';
}

function CapabilityParamsEditor(props: {
  capabilityId: ParentosCapabilityId;
  config: NimiAIConfig;
  surface: AppModelConfigSurface;
  onCommit: (patch: { params?: NimiJsonValue }) => void;
}) {
  const params = readParams(props.config, props.capabilityId);
  const t = props.surface.i18n.t;

  if (props.capabilityId === 'audio.transcribe') {
    const parsed = parseAudioTranscribeParams(params);
    return (
      <AudioTranscribeParamsEditor
        copy={createAudioTranscribeEditorCopy(t)}
        params={parsed}
        onParamsChange={(next: AudioTranscribeParamsState) => props.onCommit({ params: { ...DEFAULT_AUDIO_TRANSCRIBE_PARAMS, ...next } })}
      />
    );
  }

  const parsed = parseTextGenerateParams(params);
  return (
    <TextGenerateParamsEditor
      copy={createTextGenerateEditorCopy(t)}
      params={parsed}
      onParamsChange={(next: TextGenerateParamsState) => props.onCommit({ params: { ...DEFAULT_TEXT_GENERATE_PARAMS, ...next } })}
    />
  );
}

function targetRefToPickerSelection(targetRef: NimiAIConfigTargetRef | null): Partial<RouteModelPickerSelection> | undefined {
  if (!targetRef) {
    return undefined;
  }
  if (targetRef.kind === 'cloud-connector') {
    return {
      source: 'cloud',
      connectorId: targetRef.connectorId,
      model: targetRef.providerModelId,
      provider: targetRef.provider,
      modelId: targetRef.providerModelId,
      remoteModelCatalogId: targetRef.remoteModelCatalogId,
      providerModelId: targetRef.providerModelId,
    };
  }
  if (targetRef.kind === 'local-runtime') {
    const model = targetRef.profileBindingId || targetRef.readinessRef || '';
    return {
      source: 'local',
      connectorId: '',
      model,
      profileBindingId: targetRef.profileBindingId,
      readinessRef: targetRef.readinessRef,
    };
  }
  return undefined;
}

function pickerSelectionToTargetRef(selection: RouteModelPickerSelection): NimiAIConfigTargetRef {
  if (selection.source === 'cloud') {
    const connectorId = selection.connectorId.trim();
    const remoteModelCatalogId = String(selection.remoteModelCatalogId || '').trim();
    const providerModelId = String(selection.providerModelId || selection.modelId || selection.model).trim();
    if (!connectorId || !remoteModelCatalogId || !providerModelId) {
      throw new Error('ParentOS cloud model selection is incomplete.');
    }
    return {
      kind: 'cloud-connector',
      connectorId,
      remoteModelCatalogId,
      providerModelId,
      ...(selection.provider ? { provider: selection.provider } : {}),
    };
  }
  const profileBindingId = String(selection.profileBindingId || '').trim();
  const readinessRef = String(selection.readinessRef || '').trim();
  if (Boolean(profileBindingId) === Boolean(readinessRef)) {
    throw new Error('ParentOS local model selection is incomplete.');
  }
  return profileBindingId
    ? { kind: 'local-runtime', version: 'v2', profileBindingId }
    : { kind: 'local-runtime', version: 'v2', readinessRef };
}

export function ParentosAICapabilityCard({
  capability,
  icon: CapabilityIcon,
  surface,
  config,
  status,
}: ParentosAICapabilityCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const targetRef = readTargetRef(config, capability.id);
  const modelLabel = targetRefLabel(targetRef);
  const params = readParams(config, capability.id);
  const paramsConfigured = hasConfiguredParams(params);
  const provider = useMemo(
    () => surface.providerResolver(capability.routeCapability) as RouteModelPickerDataProvider | null,
    [capability.routeCapability, surface],
  );
  const selection = useMemo(() => targetRefToPickerSelection(targetRef), [targetRef]);
  const SourceIcon = targetRef?.kind === 'cloud-connector' ? Cloud : Monitor;

  const handleCommit = async (patch: {
    targetRef?: NimiAIConfigTargetRef | null;
    params?: NimiJsonValue;
  }) => {
    setCommitting(true);
    setCommitError(null);
    try {
      await commitCapabilityPatch(surface, capability.id, patch);
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : String(error || i18nText('AISettings.card.saveFailed')));
    } finally {
      setCommitting(false);
    }
  };

  const handleSelect = (pickerSelection: RouteModelPickerSelection) => {
    try {
      void handleCommit({
        targetRef: pickerSelectionToTargetRef(pickerSelection),
      });
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : String(error || i18nText('AISettings.card.saveFailed')));
    }
  };

  return (
    <section className="parentos-ai-capability-card parentos-radius-xl bg-[var(--nimi-surface-card)] p-5 shadow-[var(--nimi-elevation-base)]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]">
            <CapabilityIcon size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-bold text-[var(--nimi-text-primary)]">{capability.label}</h2>
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', statusClasses(status))}>
                {status.supported ? <CheckCircle2 size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
                {status.badgeLabel || (status.supported ? i18nText('AISettings.capability.bound') : i18nText('AISettings.capability.needsBinding'))}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">{capability.detail}</p>
            {modelLabel ? (
              <p className="mt-2 truncate text-[12px] font-medium text-[var(--nimi-status-success)]">{modelLabel}</p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <button
            type="button"
            onClick={() => provider && setPickerOpen(true)}
            disabled={!provider || committing}
            className={cn(
              'flex min-h-[50px] w-full items-center gap-3 parentos-radius-lg border px-3.5 py-2.5 text-left transition-all',
              modelLabel
                ? 'border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_90%,var(--nimi-surface-panel))]'
                : 'border-dashed border-[color-mix(in_srgb,var(--nimi-border-strong)_55%,transparent)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_66%,transparent)]',
              provider && !committing ? 'hover:border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_36%,var(--nimi-border-subtle))]' : 'cursor-not-allowed opacity-60',
            )}
          >
            {modelLabel ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center parentos-radius-10 bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_9%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
                <SourceIcon size={15} aria-hidden="true" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-[13px] font-semibold', modelLabel ? 'text-[var(--nimi-text-primary)]' : 'text-[var(--nimi-text-muted)]')}>
                {committing
                  ? i18nText('AISettings.card.saving')
                  : modelLabel || (provider ? i18nText('AISettings.card.chooseModel') : surface.runtimeNotReadyLabel || i18nText('AISettings.card.runtimeNotReady'))}
              </span>
              {modelLabel ? (
                <span className="mt-0.5 block truncate text-[11px] text-[var(--nimi-text-muted)]">{targetSourceLabel(targetRef)}</span>
              ) : null}
            </span>
            <ChevronRight size={15} className="shrink-0 text-[var(--nimi-text-muted)]" aria-hidden="true" />
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setParamsOpen((value) => !value)}
              className={cn(
                buttonVariants({ tone: 'ghost', size: 'sm' }),
                'h-8 min-h-8 gap-1.5 px-2.5 text-[12px]',
              )}
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
              {i18nText('AISettings.card.params')}
              {paramsConfigured ? <span className="text-[var(--nimi-action-primary-bg)]">{i18nText('AISettings.card.customized')}</span> : null}
              <ChevronDown
                size={13}
                className={cn('transition-transform', paramsOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {targetRef ? (
              <button
                type="button"
                onClick={() => void handleCommit({ targetRef: null })}
                disabled={committing}
                className={cn(buttonVariants({ tone: 'ghost', size: 'sm' }), 'h-8 min-h-8 gap-1.5 px-2.5 text-[12px] text-[var(--nimi-text-muted)] disabled:opacity-50')}
              >
                <X size={13} aria-hidden="true" />
                {i18nText('AISettings.card.clearBinding')}
              </button>
            ) : null}
          </div>

          {paramsOpen ? (
            <div className="parentos-ai-params-panel parentos-radius-lg border border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_82%,var(--nimi-surface-panel))] p-4">
              <CapabilityParamsEditor
                capabilityId={capability.id}
                config={config}
                surface={surface}
                onCommit={(patch) => void handleCommit(patch)}
              />
            </div>
          ) : status.title || status.detail ? (
            <div className="text-[12px] leading-[1.6] text-[var(--nimi-text-muted)]">
              <span className={status.supported ? 'font-semibold text-[var(--nimi-status-success)]' : 'font-semibold text-[var(--nimi-status-warning)]'}>
                {status.title}
              </span>
              {status.detail ? <span className="ml-2">{status.detail}</span> : null}
            </div>
          ) : null}
          {commitError ? (
            <div className="parentos-radius-lg border border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-3 py-2 text-[12px] leading-[1.5] text-[var(--nimi-status-danger)]">
              {commitError}
            </div>
          ) : null}
        </div>
      </div>

      {pickerOpen && provider ? (
        <ModelPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          capability={capability.routeCapability}
          capabilityLabel={capability.label}
          provider={provider}
          initialSelection={selection}
          onSelect={handleSelect}
        />
      ) : null}
    </section>
  );
}
