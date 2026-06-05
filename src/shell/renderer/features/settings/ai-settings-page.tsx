import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  Eye,
  MessageCircle,
  Mic,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  type AppModelConfigSurface,
  type ModelConfigI18nFormatter,
  type ModelConfigProjectionStatus,
} from '@nimiplatform/kit/features/model-config';
import { summarizeTargetRef } from '@nimiplatform/kit/core/model-config';
import { Surface, buttonVariants, cn } from '@nimiplatform/kit/ui';
import type { NimiAIConfig, NimiAICapabilityRequirementDeclaration } from '@nimiplatform/sdk/ai';
import { useAppStore } from '../../app-shell/app-store.js';
import {
  PARENTOS_AI_SCOPE_REF,
  PARENTOS_CAPABILITIES,
  type ParentosCapabilityId,
} from './parentos-ai-config.js';
import { getParentosAIConfigService } from './parentos-ai-config-service.js';
import { createParentosRuntimeModelPickerProviderCache } from './parentos-route-model-picker-provider.js';
import { ParentosAICapabilityCard } from './parentos-ai-capability-card.js';
import {
  parentosAISettingsAvailabilityBannerCopy,
  parentosAISettingsAvailabilityLabel,
  probeParentosAISettingsAvailability,
  type ParentosAISettingsAvailability,
} from './parentos-ai-settings-availability.js';

const PARENTOS_ENABLED_CAPABILITIES = PARENTOS_CAPABILITIES.map((capability) => capability.id);

const CAPABILITY_ICONS: Record<ParentosCapabilityId, LucideIcon> = {
  'text.generate': MessageCircle,
  'text.generate.vision': Eye,
  'audio.transcribe': Mic,
};

const CAPABILITY_TITLE_KEYS: Record<string, ParentosCapabilityId> = {
  'ModelConfig.capability.textGenerate.title': 'text.generate',
  'ModelConfig.capability.textGenerate.detail': 'text.generate',
  'ModelConfig.capability.textGenerateVision.title': 'text.generate.vision',
  'ModelConfig.capability.textGenerateVision.detail': 'text.generate.vision',
  'ModelConfig.capability.audioTranscribe.title': 'audio.transcribe',
  'ModelConfig.capability.audioTranscribe.detail': 'audio.transcribe',
};

function targetDisplayLabel(config: NimiAIConfig, capabilityId: ParentosCapabilityId): string | null {
  const targetRef = config.capabilities.targetRefs?.[capabilityId] || null;
  if (!targetRef) {
    return null;
  }
  const summary = summarizeTargetRef(targetRef);
  return [summary.label, summary.detail].filter(Boolean).join(' · ') || null;
}

function createParentosAIRequirementDeclaration(): NimiAICapabilityRequirementDeclaration {
  return {
    requirementId: 'parentos.ai.capabilities',
    scopeRef: PARENTOS_AI_SCOPE_REF,
    requiredSlices: PARENTOS_CAPABILITIES.map((capability) => ({
      requirementSliceId: `parentos.${capability.id}`,
      capability: capability.routeCapability,
      profileSliceRef: `parentos.${capability.id}`,
      readinessPolicy: 'required',
      runtimeDescriptor: {
        sliceId: `parentos.${capability.id}`,
        providerCapability: capability.routeCapability,
      },
    })),
    setupProjectionPolicy: 'sdk-ai-config-setup-projection',
  };
}

function parentosCapabilityProjection(input: {
  config: NimiAIConfig;
  capabilityId: ParentosCapabilityId;
  runtimeReady: boolean;
  runtimeDetail: string | null;
}): ModelConfigProjectionStatus {
  const capability = PARENTOS_CAPABILITIES.find((item) => item.id === input.capabilityId);
  if (!input.runtimeReady) {
    return {
      supported: false,
      tone: 'attention',
      badgeLabel: 'Runtime 未就绪',
      title: 'Runtime 不可用',
      detail: input.runtimeDetail || 'ParentOS bootstrap 尚未完成。',
    };
  }

  const targetLabel = targetDisplayLabel(input.config, input.capabilityId);
  if (!targetLabel) {
    return {
      supported: false,
      tone: 'attention',
      badgeLabel: '需要绑定',
      title: '缺少模型绑定',
      detail: `${capability?.label || input.capabilityId} 未配置`,
    };
  }

  return {
    supported: true,
    tone: 'ready',
    badgeLabel: '已绑定',
    title: '模型已配置',
    detail: targetLabel,
  };
}

function statusPillClassName(ready: boolean): string {
  return ready
    ? 'border-[color-mix(in_srgb,var(--nimi-status-success)_26%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-success)_9%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]'
    : 'border-[color-mix(in_srgb,var(--nimi-status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]';
}

export default function AiSettingsPage() {
  const { t } = useTranslation();
  const bootstrapReady = useAppStore((s) => s.bootstrapReady);
  const bootstrapError = useAppStore((s) => s.bootstrapError);
  const aiConfigService = useMemo(() => getParentosAIConfigService(), []);
  const providerCache = useMemo(() => createParentosRuntimeModelPickerProviderCache(), []);
  const [availability, setAvailability] = useState<ParentosAISettingsAvailability | null>(null);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [aiConfig, setAIConfig] = useState<NimiAIConfig>(() => (
    aiConfigService.aiConfig.get(PARENTOS_AI_SCOPE_REF)
  ));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextAvailability = await probeParentosAISettingsAvailability();
      if (!cancelled) {
        setAvailability(nextAvailability);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [availabilityRefreshKey]);

  useEffect(() => {
    setAIConfig(aiConfigService.aiConfig.get(PARENTOS_AI_SCOPE_REF));
    return aiConfigService.aiConfig.subscribe(PARENTOS_AI_SCOPE_REF, setAIConfig);
  }, [aiConfigService]);

  const runtimeReady = bootstrapReady;
  const runtimeStatusLabel = runtimeReady
    ? parentosAISettingsAvailabilityLabel(availability)
    : (bootstrapError || 'Runtime 未就绪');
  const runtimeStatusReady = runtimeReady && availability?.kind === 'ready';
  const bannerCopy = parentosAISettingsAvailabilityBannerCopy(availability);
  const configuredCount = PARENTOS_ENABLED_CAPABILITIES.filter((capabilityId) => (
    Boolean(targetDisplayLabel(aiConfig, capabilityId))
  )).length;

  const translateModelConfig = useMemo<ModelConfigI18nFormatter>(() => (
    (key, vars) => {
      const capabilityId = CAPABILITY_TITLE_KEYS[key];
      if (capabilityId) {
        const capability = PARENTOS_CAPABILITIES.find((item) => item.id === capabilityId);
        if (key.endsWith('.detail')) {
          return capability?.detail || t(key, vars);
        }
        return capability?.label || t(key, vars);
      }
      return t(key, vars);
    }
  ), [t]);

  const surface: AppModelConfigSurface = useMemo(() => ({
    scopeRef: PARENTOS_AI_SCOPE_REF,
    aiConfigService,
    requirementDeclaration: createParentosAIRequirementDeclaration(),
    providerResolver: (routeCapability: string) => (
      runtimeReady ? providerCache(routeCapability) : null
    ),
    projectionResolver: (capabilityId: string) => (
      parentosCapabilityProjection({
        config: aiConfig,
        capabilityId: capabilityId as ParentosCapabilityId,
        runtimeReady,
        runtimeDetail: runtimeStatusLabel,
      })
    ),
    runtimeNotReadyLabel: runtimeStatusLabel,
    i18n: { t: translateModelConfig },
  }), [
    aiConfig,
    aiConfigService,
    providerCache,
    runtimeReady,
    runtimeStatusLabel,
    translateModelConfig,
  ]);

  const footer = bannerCopy ? (
    <div
      className={bannerCopy.kind === 'warning'
        ? 'parentos-radius-lg border border-[color-mix(in_srgb,var(--nimi-status-warning)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))] px-4 py-3 text-sm text-[var(--nimi-status-warning)]'
        : 'parentos-radius-lg border border-[color-mix(in_srgb,var(--nimi-status-danger)_30%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))] px-4 py-3 text-sm text-[var(--nimi-status-danger)]'}
    >
      {bannerCopy.message}
    </div>
  ) : null;

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-4xl px-6 pb-8 pt-[72px]">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/settings"
            className={cn(buttonVariants({ tone: 'ghost', size: 'sm' }), 'h-8 min-h-8 w-8 px-0')}
            aria-label="返回设置"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">AI 模型设置</h1>
            <p className="mt-1 text-[13px] text-[var(--nimi-text-muted)]">
              {configuredCount} / {PARENTOS_ENABLED_CAPABILITIES.length} 已绑定
            </p>
          </div>
        </div>

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-5 parentos-radius-xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
                <Bot size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">ParentOS AI 能力</h2>
                <p className="mt-0.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
                  Runtime route catalog 负责模型来源，ParentOS 只保存能力绑定。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold',
                  statusPillClassName(runtimeStatusReady),
                )}
              >
                {runtimeStatusReady
                  ? <CheckCircle2 size={13} aria-hidden="true" />
                  : <TriangleAlert size={13} aria-hidden="true" />}
                {runtimeStatusLabel}
              </span>
              <button
                type="button"
                onClick={() => setAvailabilityRefreshKey((value) => value + 1)}
                className={cn(buttonVariants({ tone: 'secondary', size: 'sm' }), 'h-8 min-h-8 w-8 px-0')}
                aria-label="刷新 Runtime 状态"
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </Surface>

        <div className="space-y-4">
          {PARENTOS_CAPABILITIES.map((capability) => {
            const CapabilityIcon = CAPABILITY_ICONS[capability.id];
            const status = parentosCapabilityProjection({
              config: aiConfig,
              capabilityId: capability.id,
              runtimeReady,
              runtimeDetail: runtimeStatusLabel,
            });
            return (
              <ParentosAICapabilityCard
                key={capability.id}
                capability={capability}
                icon={CapabilityIcon}
                surface={surface}
                config={aiConfig}
                status={status}
              />
            );
          })}
          {footer}
        </div>
      </div>
    </div>
  );
}
