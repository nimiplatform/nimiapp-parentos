import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Button, Surface, buttonVariants, cn } from '@nimiplatform/kit/ui';
import { openDesktopIntent } from '@nimiplatform/kit/shell/renderer/bridge';
import {
  readParentosAIConfig,
  type ParentosPortableAIConfig,
} from './parentos-ai-config.js';
import {
  probeParentosNimiAccess,
  type ParentosNimiAccessPosture,
} from '../../infra/runtime-status.js';
import { isParentosAISurfaceExecutable } from './parentos-ai-surface-policy.js';
import { i18nText } from '../../i18n/index.js';

type ParentosAIFeatureRow = {
  readonly labelKey: string;
  readonly supported: boolean;
  readonly capabilityContract: 'text.generate' | 'audio.transcribe' | null;
};

type ParentosAIFeatureStatus =
  | 'checking'
  | 'available'
  | 'needs-access'
  | 'needs-configuration'
  | 'not-supported';

const PARENTOS_APP_ID = 'nimi.parentos';

const CAPABILITY_LABEL_KEYS: Readonly<Record<string, string>> = {
  'text.generate': 'AISettings.declared.capabilities.textGenerate',
  'audio.transcribe': 'AISettings.declared.capabilities.audioTranscribe',
  'audio.synthesize': 'AISettings.declared.capabilities.audioSynthesize',
  'image.generate': 'AISettings.declared.capabilities.imageGenerate',
};

const PARENTOS_AI_FEATURE_ROWS: readonly ParentosAIFeatureRow[] = [
  { labelKey: 'AISettings.features.advisor', supported: isParentosAISurfaceExecutable('parentos.advisor'), capabilityContract: 'text.generate' },
  { labelKey: 'AISettings.features.report', supported: isParentosAISurfaceExecutable('parentos.report'), capabilityContract: 'text.generate' },
  { labelKey: 'AISettings.features.journalTagging', supported: isParentosAISurfaceExecutable('parentos.journal.ai-tagging'), capabilityContract: 'text.generate' },
  { labelKey: 'AISettings.features.profileSummary', supported: isParentosAISurfaceExecutable('parentos.profile.summary.growth'), capabilityContract: 'text.generate' },
  { labelKey: 'AISettings.features.medicalInsights', supported: isParentosAISurfaceExecutable('parentos.medical.smart-insight'), capabilityContract: 'text.generate' },
  { labelKey: 'AISettings.features.ocrIntake', supported: isParentosAISurfaceExecutable('parentos.profile.checkup-ocr'), capabilityContract: null },
  { labelKey: 'AISettings.features.voiceTranscribe', supported: isParentosAISurfaceExecutable('parentos.journal.voice-observation'), capabilityContract: 'audio.transcribe' },
];

function postureLabelKey(posture: ParentosNimiAccessPosture | null): string {
  if (!posture) {
    return 'AISettings.posture.checking';
  }
  switch (posture.state) {
    case 'ready':
      return 'AISettings.posture.ready';
    case 'action-required':
      return 'AISettings.posture.actionRequired';
    case 'bridge-absent':
      return 'AISettings.posture.bridgeAbsent';
    default:
      return 'AISettings.posture.unavailable';
  }
}

function postureRecoveryKey(posture: ParentosNimiAccessPosture): string {
  switch (posture.state) {
    case 'bridge-absent':
      return 'AISettings.access.recovery.bridgeAbsent';
    case 'action-required':
      return 'AISettings.access.recovery.actionRequired';
    default:
      return 'AISettings.access.recovery.unavailable';
  }
}

function featureStatusLabelKey(status: ParentosAIFeatureStatus): string {
  switch (status) {
    case 'available':
      return 'AISettings.features.available';
    case 'needs-access':
      return 'AISettings.features.needsAccess';
    case 'needs-configuration':
      return 'AISettings.features.needsConfiguration';
    case 'not-supported':
      return 'AISettings.features.notSupported';
    default:
      return 'AISettings.features.checking';
  }
}

export default function AiSettingsPage() {
  const { t } = useTranslation();
  const [posture, setPosture] = useState<ParentosNimiAccessPosture | null>(null);
  const [aiConfig, setAiConfig] = useState<ParentosPortableAIConfig | null>(null);
  const [aiConfigLoaded, setAiConfigLoaded] = useState(false);
  const [aiConfigReasonCode, setAiConfigReasonCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ownerHandoffPending, setOwnerHandoffPending] = useState(false);
  const [ownerHandoffFailure, setOwnerHandoffFailure] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextPosture, nextConfig] = await Promise.all([
        probeParentosNimiAccess(),
        readParentosAIConfig(),
      ]);
      setPosture(nextPosture);
      setAiConfig(nextConfig.state === 'ready' ? nextConfig.config : null);
      setAiConfigReasonCode(nextConfig.state === 'ready' ? null : nextConfig.reasonCode);
      setAiConfigLoaded(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshOnFocus = () => { void refresh(); };
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [refresh]);

  // @nimi-authority: rule.parentos.shell.r001
  const openOwnerConfiguration = useCallback(async () => {
    if (ownerHandoffPending) return;
    setOwnerHandoffPending(true);
    setOwnerHandoffFailure(null);
    try {
      const result = await openDesktopIntent({
        intent: { kind: 'open-apps', appId: PARENTOS_APP_ID, section: 'ai-models' },
      });
      if (result.status === 'rejected') {
        setOwnerHandoffFailure(result.reasonCode);
      }
    } catch (error) {
      const reasonCode = error && typeof error === 'object'
        && 'reasonCode' in error && typeof error.reasonCode === 'string'
        ? error.reasonCode
        : 'desktop-open-host-unavailable';
      setOwnerHandoffFailure(reasonCode);
    } finally {
      setOwnerHandoffPending(false);
    }
  }, [ownerHandoffPending]);

  const postureReady = posture?.state === 'ready';
  const declaredCapabilities = aiConfig?.config?.capabilities ?? [];
  const configuredLocalCapabilities = new Set((aiConfig?.effectiveSelections ?? [])
    .filter((selection) => selection.state === 'ready' && selection.resource?.oneofKind === 'local')
    .map((selection) => selection.capabilityContract));

  const featureStatus = (row: ParentosAIFeatureRow): ParentosAIFeatureStatus => {
    if (!row.supported || row.capabilityContract === null) return 'not-supported';
    if (!posture || !aiConfigLoaded) return 'checking';
    if (!postureReady) return 'needs-access';
    return configuredLocalCapabilities.has(row.capabilityContract)
      ? 'available'
      : 'needs-configuration';
  };

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-4xl px-6 pb-8 pt-[72px]">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/settings"
            className={cn(buttonVariants({ tone: 'ghost', size: 'sm' }), 'h-8 min-h-8 w-8 px-0')}
            aria-label={i18nText('AISettings.page.backToSettings')}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">{i18nText('AISettings.page.title')}</h1>
            <p className="mt-1 text-[13px] text-[var(--nimi-text-muted)]">
              {i18nText('AISettings.page.subtitle')}
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
                <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('AISettings.access.title')}</h2>
                <p className="mt-0.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
                  {i18nText('AISettings.access.description')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold',
                  postureReady
                    ? 'border-[color-mix(in_srgb,var(--nimi-status-success)_26%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-success)_9%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]'
                    : 'border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] text-[var(--nimi-text-muted)]',
                )}
              >
                {postureReady
                  ? <CheckCircle2 size={13} aria-hidden="true" />
                  : <CircleDashed size={13} aria-hidden="true" />}
                {t(postureLabelKey(posture))}
              </span>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void refresh()}
                className={cn(buttonVariants({ tone: 'secondary', size: 'sm' }), 'h-8 min-h-8 w-8 px-0')}
                aria-label={i18nText('AISettings.page.refreshRuntime')}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
          {posture && !postureReady ? (
            <div className="mt-4 rounded-[var(--nimi-radius-md)] border border-[color-mix(in_srgb,var(--nimi-status-warning)_28%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_7%,var(--nimi-surface-panel))] p-4" role="status">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 shrink-0 text-[var(--nimi-status-warning)]" size={18} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">
                    {t('AISettings.access.recovery.title')}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--nimi-text-secondary)]">
                    {t(postureRecoveryKey(posture))}
                  </p>
                  <Button
                    type="button"
                    tone="secondary"
                    size="sm"
                    className="mt-3"
                    disabled={ownerHandoffPending}
                    onClick={() => void openOwnerConfiguration()}
                  >
                    {t(ownerHandoffPending
                      ? 'AISettings.declared.openingOwnerConfiguration'
                      : 'AISettings.declared.openOwnerConfiguration')}
                    <ExternalLink size={13} aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <details className="mt-3 border-t border-[var(--nimi-border-subtle)] pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--nimi-text-muted)]">
                  {t('AISettings.access.technicalDetails')}
                </summary>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">
                  {posture.reasonCode} · {posture.actionHint}
                </p>
              </details>
            </div>
          ) : null}
        </Surface>

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-5 parentos-radius-xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('AISettings.declared.title')}</h2>
            {aiConfigLoaded && declaredCapabilities.length > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--nimi-status-success)_26%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-success)_9%,var(--nimi-surface-card))] px-3 py-1 text-[12px] font-semibold text-[var(--nimi-status-success)]">
                <CheckCircle2 size={13} aria-hidden="true" />
                {t('AISettings.declared.configuredCount', { count: declaredCapabilities.length })}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
            {i18nText('AISettings.declared.description')}
          </p>
          <div className="mt-4 space-y-2">
            {declaredCapabilities.map((capability) => {
              const labelKey = CAPABILITY_LABEL_KEYS[capability.capabilityContract];
              return (
                <div
                  key={capability.capabilityContract}
                  className="flex items-center justify-between gap-3 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--nimi-text-primary)]">
                      {labelKey ? t(labelKey) : capability.capabilityContract}
                    </p>
                    {labelKey ? (
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--nimi-text-muted)]">
                        {capability.capabilityContract}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-[12px] text-[var(--nimi-text-muted)]">
                      {capability.route.oneofKind === 'local'
                        ? t('AISettings.declared.routeLocal')
                        : t('AISettings.declared.routeCloud')}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--nimi-status-success)_26%,transparent)] bg-[color-mix(in_srgb,var(--nimi-status-success)_9%,var(--nimi-surface-card))] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--nimi-status-success)]">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      {t('AISettings.declared.statusConfigured')}
                    </span>
                  </div>
                </div>
              );
            })}
            {aiConfigLoaded
              && declaredCapabilities.length === 0
              && (!aiConfigReasonCode || aiConfigReasonCode === 'ai-config-not-found') ? (
                <p className="text-[13px] text-[var(--nimi-text-muted)]">{t('AISettings.declared.empty')}</p>
              ) : null}
          </div>
          {aiConfigLoaded ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-[var(--nimi-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] leading-5 text-[var(--nimi-text-muted)]">
                {t('AISettings.declared.platformManaged')}
              </p>
              <Button
                type="button"
                tone="secondary"
                size="sm"
                disabled={ownerHandoffPending}
                onClick={() => void openOwnerConfiguration()}
              >
                {t(ownerHandoffPending
                  ? 'AISettings.declared.openingOwnerConfiguration'
                  : 'AISettings.declared.openOwnerConfiguration')}
              </Button>
            </div>
          ) : null}
          {aiConfigLoaded && aiConfigReasonCode && aiConfigReasonCode !== 'ai-config-not-found' ? (
            <div className="mt-3 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3" role="status">
              <p className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">
                {t('AISettings.declared.loadFailed')}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--nimi-text-muted)]">
                {t('AISettings.declared.loadFailedGuidance')}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--nimi-text-muted)]">
                  {t('AISettings.access.technicalDetails')}
                </summary>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">{aiConfigReasonCode}</p>
              </details>
            </div>
          ) : null}
          {ownerHandoffFailure ? (
            <div className="mt-3 rounded-[var(--nimi-radius-md)] border border-[color-mix(in_srgb,var(--nimi-status-warning)_28%,var(--nimi-border-subtle))] bg-[color-mix(in_srgb,var(--nimi-status-warning)_7%,var(--nimi-surface-panel))] px-4 py-3" role="alert">
              <p className="text-[13px] font-semibold text-[var(--nimi-text-primary)]">
                {t('AISettings.declared.ownerHandoffFailed')}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--nimi-text-secondary)]">
                {t('AISettings.declared.ownerHandoffFallback')}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--nimi-text-muted)]">
                  {t('AISettings.access.technicalDetails')}
                </summary>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">{ownerHandoffFailure}</p>
              </details>
            </div>
          ) : null}
        </Surface>

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl p-5">
          <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('AISettings.features.title')}</h2>
          <p className="mt-0.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
            {i18nText('AISettings.features.description')}
          </p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--nimi-text-muted)]">
            {t('AISettings.features.configurationHint')}
          </p>
          <div className="mt-4 space-y-2">
            {PARENTOS_AI_FEATURE_ROWS.map((row) => {
              const status = featureStatus(row);
              const available = status === 'available';
              return (
              <div
                key={row.labelKey}
                className="flex items-start justify-between gap-4 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3"
              >
                <span className="text-[13px] font-medium text-[var(--nimi-text-primary)]">{t(row.labelKey)}</span>
                <div className="max-w-[52%] shrink-0 text-right">
                  <span
                    className={cn(
                      'text-[12px] font-semibold',
                      available ? 'text-[var(--nimi-status-success)]' : 'text-[var(--nimi-text-muted)]',
                    )}
                  >
                    {t(featureStatusLabelKey(status))}
                  </span>
                  {status === 'not-supported' ? (
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--nimi-text-muted)]">
                      {t('AISettings.features.notSupportedHint')}
                    </p>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        </Surface>
      </div>
    </div>
  );
}
