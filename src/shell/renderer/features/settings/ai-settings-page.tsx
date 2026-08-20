import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
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

const PARENTOS_APP_ID = 'nimi.parentos';

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
  const declaredCapabilities = aiConfig?.capabilities ?? [];
  const configuredLocalCapabilities = new Set(declaredCapabilities
    .filter((capability) => capability.route.oneofKind === 'local')
    .map((capability) => capability.capabilityContract));

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
            <details className="mt-4 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--nimi-text-muted)]">
                {t('AISettings.access.technicalDetails')}
              </summary>
              <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">
                {posture.reasonCode} · {posture.actionHint}
              </p>
            </details>
          ) : null}
        </Surface>

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-5 parentos-radius-xl p-5">
          <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('AISettings.declared.title')}</h2>
          <p className="mt-0.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
            {i18nText('AISettings.declared.description')}
          </p>
          <div className="mt-4 space-y-2">
            {declaredCapabilities.map((capability) => (
              <div
                key={capability.capabilityContract}
                className="flex items-center justify-between rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3"
              >
                <span className="text-[13px] font-medium text-[var(--nimi-text-primary)]">
                  {capability.capabilityContract}
                </span>
                <span className="text-[12px] text-[var(--nimi-text-muted)]">
                  {capability.route.oneofKind === 'local'
                    ? t('AISettings.declared.routeLocal')
                    : t('AISettings.declared.routeCloud')}
                </span>
              </div>
            ))}
            {aiConfigLoaded
              && declaredCapabilities.length === 0
              && (!aiConfigReasonCode || aiConfigReasonCode === 'ai-config-not-found') ? (
                <p className="text-[13px] text-[var(--nimi-text-muted)]">{t('AISettings.declared.empty')}</p>
              ) : null}
          </div>
          {postureReady && aiConfigLoaded ? (
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
            <details className="mt-3 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--nimi-text-muted)]">
                {t('AISettings.declared.loadFailed')}
              </summary>
              <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">{aiConfigReasonCode}</p>
            </details>
          ) : null}
          {ownerHandoffFailure ? (
            <details className="mt-3 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--nimi-text-muted)]">
                {t('AISettings.declared.ownerHandoffFailed')}
              </summary>
              <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">{ownerHandoffFailure}</p>
            </details>
          ) : null}
        </Surface>

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl p-5">
          <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{i18nText('AISettings.features.title')}</h2>
          <p className="mt-0.5 text-[13px] leading-[1.6] text-[var(--nimi-text-muted)]">
            {i18nText('AISettings.features.description')}
          </p>
          <div className="mt-4 space-y-2">
            {PARENTOS_AI_FEATURE_ROWS.map((row) => {
              const available = row.supported
                && row.capabilityContract !== null
                && configuredLocalCapabilities.has(row.capabilityContract);
              return (
              <div
                key={row.labelKey}
                className="flex items-center justify-between rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3"
              >
                <span className="text-[13px] font-medium text-[var(--nimi-text-primary)]">{t(row.labelKey)}</span>
                <span
                  className={cn(
                    'text-[12px] font-semibold',
                    available ? 'text-[var(--nimi-status-success)]' : 'text-[var(--nimi-text-muted)]',
                  )}
                >
                  {available ? t('AISettings.features.available') : t('AISettings.features.unavailable')}
                </span>
              </div>
              );
            })}
          </div>
        </Surface>
      </div>
    </div>
  );
}
