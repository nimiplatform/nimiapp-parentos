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
  bindingToPickerSelection,
  createAudioTranscribeEditorCopy,
  createTextGenerateEditorCopy,
  parseAudioTranscribeParams,
  parseTextGenerateParams,
  pickerSelectionToBinding,
  type AppModelConfigSurface,
  type AudioTranscribeParamsState,
  type ModelConfigProjectionStatus,
  type ModelConfigRouteBinding,
  type TextGenerateParamsState,
} from '@nimiplatform/kit/features/model-config';
import { ModelPickerModal } from '@nimiplatform/kit/features/model-picker/ui';
import type { RouteModelPickerDataProvider, RouteModelPickerSelection } from '@nimiplatform/kit/features/model-picker';
import { buttonVariants, cn } from '@nimiplatform/kit/ui';
import type { AIConfig } from '@nimiplatform/sdk/ai';
import type { ParentosCapabilityId } from './parentos-ai-config.js';

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
  config: AIConfig;
  status: ModelConfigProjectionStatus;
};

function readBinding(config: AIConfig, capabilityId: ParentosCapabilityId): ModelConfigRouteBinding | null {
  const binding = config.capabilities.selectedBindings?.[capabilityId] || null;
  if (!binding) {
    return null;
  }
  return {
    ...binding,
    source: binding.source === 'cloud' ? 'cloud' : 'local',
    connectorId: binding.source === 'cloud' ? binding.connectorId : '',
    model: String(binding.model || binding.modelId || '').trim(),
  };
}

function bindingLabel(binding: ModelConfigRouteBinding | null): string | null {
  if (!binding) {
    return null;
  }
  return String(
    binding.modelLabel
    || binding.model
    || binding.modelId
    || binding.localModelId
    || '',
  ).trim() || null;
}

function bindingSourceLabel(binding: ModelConfigRouteBinding | null): string {
  if (!binding) {
    return '未绑定';
  }
  if (binding.source === 'cloud') {
    return binding.provider || binding.connectorId || 'Cloud';
  }
  return binding.engine || binding.provider || 'Local Runtime';
}

function readParams(config: AIConfig, capabilityId: ParentosCapabilityId): Record<string, unknown> {
  const raw = config.capabilities.selectedParams?.[capabilityId];
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function hasConfiguredParams(params: Record<string, unknown>): boolean {
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
    binding?: ModelConfigRouteBinding | null;
    params?: Record<string, unknown>;
  },
): void {
  const current = surface.aiConfigService.aiConfig.get(surface.scopeRef);
  const nextBindings = { ...current.capabilities.selectedBindings };
  const nextParams = { ...current.capabilities.selectedParams };

  if (Object.prototype.hasOwnProperty.call(patch, 'binding')) {
    nextBindings[capabilityId] = patch.binding ?? null;
  }
  if (patch.params) {
    nextParams[capabilityId] = patch.params;
  }

  surface.aiConfigService.aiConfig.update(surface.scopeRef, {
    ...current,
    capabilities: {
      ...current.capabilities,
      selectedBindings: nextBindings,
      selectedParams: nextParams,
    },
  });
}

function statusClasses(status: ModelConfigProjectionStatus): string {
  return status.supported
    ? 'border-[color-mix(in_srgb,var(--nimi-status-success)_24%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-success)_9%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]'
    : 'border-[color-mix(in_srgb,var(--nimi-status-warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]';
}

function CapabilityParamsEditor(props: {
  capabilityId: ParentosCapabilityId;
  config: AIConfig;
  surface: AppModelConfigSurface;
}) {
  const params = readParams(props.config, props.capabilityId);
  const t = props.surface.i18n.t;

  if (props.capabilityId === 'audio.transcribe') {
    const parsed = parseAudioTranscribeParams(params);
    return (
      <AudioTranscribeParamsEditor
        copy={createAudioTranscribeEditorCopy(t)}
        params={parsed}
        onParamsChange={(next: AudioTranscribeParamsState) => commitCapabilityPatch(
          props.surface,
          props.capabilityId,
          { params: { ...DEFAULT_AUDIO_TRANSCRIBE_PARAMS, ...next } },
        )}
      />
    );
  }

  const parsed = parseTextGenerateParams(params);
  return (
    <TextGenerateParamsEditor
      copy={createTextGenerateEditorCopy(t)}
      params={parsed}
      onParamsChange={(next: TextGenerateParamsState) => commitCapabilityPatch(
        props.surface,
        props.capabilityId,
        { params: { ...DEFAULT_TEXT_GENERATE_PARAMS, ...next } },
      )}
    />
  );
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
  const binding = readBinding(config, capability.id);
  const modelLabel = bindingLabel(binding);
  const params = readParams(config, capability.id);
  const paramsConfigured = hasConfiguredParams(params);
  const provider = useMemo(
    () => surface.providerResolver(capability.routeCapability) as RouteModelPickerDataProvider | null,
    [capability.routeCapability, surface],
  );
  const selection = useMemo(() => bindingToPickerSelection(binding), [binding]);
  const SourceIcon = binding?.source === 'cloud' ? Cloud : Monitor;

  const handleSelect = (pickerSelection: RouteModelPickerSelection) => {
    commitCapabilityPatch(surface, capability.id, {
      binding: pickerSelectionToBinding(pickerSelection),
    });
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
                {status.badgeLabel || (status.supported ? '已绑定' : '需要绑定')}
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
            disabled={!provider}
            className={cn(
              'flex min-h-[50px] w-full items-center gap-3 parentos-radius-lg border px-3.5 py-2.5 text-left transition-all',
              modelLabel
                ? 'border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_90%,var(--nimi-surface-panel))]'
                : 'border-dashed border-[color-mix(in_srgb,var(--nimi-border-strong)_55%,transparent)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_66%,transparent)]',
              provider ? 'hover:border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_36%,var(--nimi-border-subtle))]' : 'cursor-not-allowed opacity-60',
            )}
          >
            {modelLabel ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center parentos-radius-10 bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_9%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
                <SourceIcon size={15} aria-hidden="true" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-[13px] font-semibold', modelLabel ? 'text-[var(--nimi-text-primary)]' : 'text-[var(--nimi-text-muted)]')}>
                {modelLabel || (provider ? '选择 Runtime 模型' : surface.runtimeNotReadyLabel || 'Runtime 未就绪')}
              </span>
              {modelLabel ? (
                <span className="mt-0.5 block truncate text-[11px] text-[var(--nimi-text-muted)]">{bindingSourceLabel(binding)}</span>
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
              参数
              {paramsConfigured ? <span className="text-[var(--nimi-action-primary-bg)]">已自定义</span> : null}
              <ChevronDown
                size={13}
                className={cn('transition-transform', paramsOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {binding ? (
              <button
                type="button"
                onClick={() => commitCapabilityPatch(surface, capability.id, { binding: null })}
                className={cn(buttonVariants({ tone: 'ghost', size: 'sm' }), 'h-8 min-h-8 gap-1.5 px-2.5 text-[12px] text-[var(--nimi-text-muted)]')}
              >
                <X size={13} aria-hidden="true" />
                清除绑定
              </button>
            ) : null}
          </div>

          {paramsOpen ? (
            <div className="parentos-ai-params-panel parentos-radius-lg border border-[var(--nimi-border-subtle)] bg-[color-mix(in_srgb,var(--nimi-surface-card)_82%,var(--nimi-surface-panel))] p-4">
              <CapabilityParamsEditor capabilityId={capability.id} config={config} surface={surface} />
            </div>
          ) : status.title || status.detail ? (
            <div className="text-[12px] leading-[1.6] text-[var(--nimi-text-muted)]">
              <span className={status.supported ? 'font-semibold text-[var(--nimi-status-success)]' : 'font-semibold text-[var(--nimi-status-warning)]'}>
                {status.title}
              </span>
              {status.detail ? <span className="ml-2">{status.detail}</span> : null}
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
