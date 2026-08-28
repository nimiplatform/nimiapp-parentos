import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createNimiLocalAIConfigCapabilityIntent,
  runtimeAIConfigStructToJson,
  type NimiAIConfigOverwriteInput,
  type NimiAIConfigOverwriteResult,
  type NimiPortableAppAIConfigIntent,
} from '@nimiplatform/kit/core/sdk-contract';
import { Button, InlineAlert } from '@nimiplatform/kit/ui';
import {
  getParentosAIConfigManager,
  type ParentosAIConfigCapabilityContract,
  type ParentosAIConfigSnapshot,
} from './parentos-ai-config.js';

type ParentosLocalAIConfigEditorProps = {
  readonly capabilityContracts: readonly ParentosAIConfigCapabilityContract[];
  readonly snapshot: ParentosAIConfigSnapshot | null;
  readonly configurationObserved: boolean;
  readonly disabled?: boolean;
  readonly onOverwriteResult: (result: NimiAIConfigOverwriteResult) => void;
};

const CAPABILITY_LABEL_KEYS: Readonly<Record<ParentosAIConfigCapabilityContract, string>> = {
  'text.generate': 'AISettings.declared.capabilities.textGenerate',
  'audio.transcribe': 'AISettings.declared.capabilities.audioTranscribe',
};

function localIntentFrom(
  current: NimiPortableAppAIConfigIntent | null,
  capabilityContract: ParentosAIConfigCapabilityContract,
): NimiPortableAppAIConfigIntent {
  const defaults = runtimeAIConfigStructToJson(current?.defaults);
  return createNimiLocalAIConfigCapabilityIntent({
    capabilityContract,
    requiredFeatures: [...(current?.requiredFeatures ?? [])],
    ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
  });
}

// @nimi-authority: rule.parentos.shell.r006
export function ParentosLocalAIConfigEditor({
  capabilityContracts,
  snapshot,
  configurationObserved,
  disabled = false,
  onOverwriteResult,
}: ParentosLocalAIConfigEditorProps) {
  const { t } = useTranslation();
  const [activeContract, setActiveContract] = useState<ParentosAIConfigCapabilityContract | null>(null);
  const [saving, setSaving] = useState<'save' | 'clear' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const capabilities = snapshot?.config?.capabilities ?? [];
  const currentIntent = capabilities.find(
    (entry) => entry.capabilityContract === activeContract,
  ) ?? null;

  const overwrite = async (input: NimiAIConfigOverwriteInput, kind: 'save' | 'clear') => {
    if (saving || !snapshot) return;
    setFailure(null);
    setSaving(kind);
    try {
      const result = await getParentosAIConfigManager().overwrite(input);
      onOverwriteResult(result);
      if (result.outcome === 'conflict') setFailure(t('AISettings.localEditor.conflict'));
    } catch {
      setFailure(t('AISettings.localEditor.saveFailed'));
    } finally {
      setSaving(null);
    }
  };

  if (!configurationObserved) return null;

  if (!activeContract) {
    return (
      <div className="mt-4 space-y-2" data-parentos-ai-config-editor="local-only">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 text-sm font-semibold text-[var(--nimi-text-primary)]">
            {t('AISettings.localEditor.title')}
          </h3>
          <span className="text-xs text-[var(--nimi-text-muted)]">
            {t('AISettings.localEditor.localOnly')}
          </span>
        </div>
        {capabilityContracts.map((capabilityContract) => {
          const intent = capabilities.find((entry) => entry.capabilityContract === capabilityContract);
          return (
            <button
              key={capabilityContract}
              type="button"
              data-parentos-ai-config-capability={capabilityContract}
              onClick={() => setActiveContract(capabilityContract)}
              disabled={disabled}
              className="flex w-full items-center justify-between gap-3 rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] p-3 text-left transition-colors hover:border-[var(--nimi-border-strong)] disabled:cursor-not-allowed disabled:opacity-[var(--nimi-opacity-disabled)]"
            >
              <span>
                <span className="block text-sm font-semibold text-[var(--nimi-text-primary)]">
                  {t(CAPABILITY_LABEL_KEYS[capabilityContract])}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-[var(--nimi-text-muted)]">
                  {capabilityContract}
                </span>
              </span>
              <span className="text-xs text-[var(--nimi-text-muted)]">
                {intent?.route.oneofKind === 'local'
                  ? t('AISettings.declared.routeLocal')
                  : intent?.route.oneofKind === 'cloud'
                    ? t('AISettings.declared.routeCloud')
                    : t('AISettings.features.needsConfiguration')}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const nextCapabilities = capabilities.filter(
    (entry) => entry.capabilityContract !== activeContract,
  );
  const effectiveSelection = snapshot?.effectiveSelections.find(
    (entry) => entry.capabilityContract === activeContract,
  );

  return (
    <div className="mt-4 space-y-4" data-parentos-ai-config-editor="local-only">
      <div className="flex items-center justify-between gap-3">
        <Button tone="ghost" size="sm" onClick={() => setActiveContract(null)}>
          {t('AISettings.localEditor.back')}
        </Button>
        <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-[var(--nimi-text-primary)]">
          {t(CAPABILITY_LABEL_KEYS[activeContract])}
        </h3>
      </div>
      {currentIntent?.route.oneofKind === 'cloud' ? (
        <InlineAlert tone="warning">{t('AISettings.localEditor.existingCloud')}</InlineAlert>
      ) : null}
      <div className="rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] p-3 text-xs text-[var(--nimi-text-secondary)]">
        <p className="m-0 font-semibold text-[var(--nimi-text-primary)]">
          {currentIntent?.route.oneofKind === 'local'
            ? t('AISettings.localEditor.localConfigured')
            : t('AISettings.localEditor.notConfigured')}
        </p>
        <p className="m-0 mt-1">
          {effectiveSelection?.state === 'ready'
            ? t('AISettings.localEditor.effectiveReady')
            : t('AISettings.localEditor.effectivePending')}
        </p>
      </div>
      {failure ? <InlineAlert tone="warning">{failure}</InlineAlert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          tone="secondary"
          size="sm"
          disabled={disabled || saving !== null || !currentIntent}
          onClick={() => void overwrite({
            expectedRevision: snapshot?.revision ?? '',
            capabilities: nextCapabilities,
          }, 'clear')}
          data-testid={`parentos-ai-config-clear:${activeContract}`}
        >
          {saving === 'clear' ? t('AISettings.localEditor.clearing') : t('AISettings.localEditor.clear')}
        </Button>
        <Button
          tone="primary"
          size="sm"
          disabled={disabled || saving !== null || currentIntent?.route.oneofKind === 'local'}
          onClick={() => void overwrite({
            expectedRevision: snapshot?.revision ?? '',
            capabilities: [...nextCapabilities, localIntentFrom(currentIntent, activeContract)],
          }, 'save')}
          data-testid={`parentos-ai-config-save:${activeContract}`}
        >
          {saving === 'save' ? t('AISettings.localEditor.saving') : t('AISettings.localEditor.save')}
        </Button>
      </div>
    </div>
  );
}
