import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  NimiAIConfigOverwriteResult,
  NimiPortableAppAIConfigIntent,
} from '@nimiplatform/kit/core/sdk-contract';
import {
  ModelConfigAIConfigSurface,
  type ModelConfigCopy,
} from '@nimiplatform/kit/features/model-config';
import {
  getParentosAIConfigManager,
  PARENTOS_AI_CAPABILITY_CONTRACTS,
  type ParentosAIConfigSnapshot,
} from './parentos-ai-config.js';

const PARENTOS_APP_ID = 'nimi.parentos';

// The surface also lists intents committed for other capabilities (for example
// from Desktop) so they stay visible and clearable here.
const CAPABILITY_COPY_KEYS: Readonly<Record<string, { readonly label: string; readonly description?: string }>> = {
  'text.generate': {
    label: 'AISettings.declared.capabilities.textGenerate',
    description: 'AISettings.modelConfig.capabilityDescription.textGenerate',
  },
  'audio.transcribe': {
    label: 'AISettings.declared.capabilities.audioTranscribe',
    description: 'AISettings.modelConfig.capabilityDescription.audioTranscribe',
  },
  'audio.synthesize': { label: 'AISettings.declared.capabilities.audioSynthesize' },
  'image.generate': { label: 'AISettings.declared.capabilities.imageGenerate' },
};

function useParentosModelConfigCopy(): ModelConfigCopy {
  const { t } = useTranslation();
  return useMemo(() => ({
    title: t('AISettings.declared.title'),
    description: t('AISettings.declared.description'),
    backLabel: t('AISettings.modelConfig.back'),
    detailTitle: (capability: string) => t('AISettings.modelConfig.detailTitle', { capability }),
    activeModelLabel: t('AISettings.modelConfig.activeModel'),
    activeModelHint: t('AISettings.modelConfig.activeModelHint'),
    activeModelConfiguredLabel: t('AISettings.modelConfig.activeModelConfigured'),
    activeModelSetupPendingLabel: t('AISettings.modelConfig.activeModelSetupPending'),
    modelPickerTitle: t('AISettings.modelConfig.pickerTitle'),
    modelPickerSearchPlaceholder: t('AISettings.modelConfig.pickerSearch'),
    modelPickerLoadingLabel: t('AISettings.modelConfig.pickerLoading'),
    modelPickerEmptyLabel: t('AISettings.modelConfig.pickerEmpty'),
    configuredSummary: t('AISettings.modelConfig.configuredSummary'),
    emptySummary: t('AISettings.modelConfig.emptySummary'),
    routeLabel: t('AISettings.modelConfig.route'),
    localLabel: t('AISettings.modelConfig.local'),
    cloudLabel: t('AISettings.modelConfig.cloud'),
    saveLocalLabel: t('AISettings.modelConfig.save'),
    saveCloudLabel: t('AISettings.modelConfig.save'),
    savingLabel: t('AISettings.modelConfig.saving'),
    clearLabel: t('AISettings.modelConfig.clear'),
    clearingLabel: t('AISettings.modelConfig.clearing'),
    conflictLabel: t('AISettings.modelConfig.conflict'),
    conflictDescription: t('AISettings.modelConfig.conflictDescription'),
    conflictCurrentLabel: (revision: string, summary: string) => (
      t('AISettings.modelConfig.conflictCurrent', { revision, summary })
    ),
    advancedLabel: t('AISettings.modelConfig.advanced'),
    advancedHint: t('AISettings.modelConfig.advancedHint'),
    requiredFeaturesLabel: t('AISettings.modelConfig.requiredFeatures'),
    requiredFeaturesPlaceholder: t('AISettings.modelConfig.requiredFeaturesPlaceholder'),
    defaultsLabel: t('AISettings.modelConfig.defaults'),
    defaultsPlaceholder: t('AISettings.modelConfig.defaultsPlaceholder'),
    defaultsUnsetLabel: t('AISettings.modelConfig.defaultsUnset'),
    defaultsTrueLabel: t('AISettings.modelConfig.defaultsTrue'),
    defaultsFalseLabel: t('AISettings.modelConfig.defaultsFalse'),
    defaultsListPlaceholder: t('AISettings.modelConfig.defaultsListPlaceholder'),
    defaultsLocalEffectivePlaceholder: (value: string) => (
      t('AISettings.modelConfig.defaultsLocalEffective', { value })
    ),
    defaultsCloudEffectivePlaceholder: t('AISettings.modelConfig.defaultsCloudEffective'),
    defaultsRandomValue: t('AISettings.modelConfig.defaultsRandom'),
    localChoiceDescription: t('AISettings.modelConfig.localChoiceDescription'),
    localSelectedLabel: t('AISettings.modelConfig.localSelected'),
    localMissingLabel: t('AISettings.modelConfig.localMissing'),
    localBrokenLabel: t('AISettings.modelConfig.localBroken'),
    localUnavailableLabel: t('AISettings.modelConfig.localUnavailable'),
    localMismatchLabel: (features: string) => t('AISettings.modelConfig.localMismatch', { features }),
    openMachineLabel: t('AISettings.modelConfig.openMachine'),
    cloudConnectorPickerLabel: t('AISettings.modelConfig.cloudConnectorPicker'),
    cloudConnectorPickerPlaceholder: t('AISettings.modelConfig.cloudConnectorPickerPlaceholder'),
    cloudConnectorSelectionRequired: t('AISettings.modelConfig.cloudConnectorSelectionRequired'),
    cloudNoConnectorsLabel: t('AISettings.modelConfig.cloudNoConnectors'),
    openCloudConnectorsLabel: t('AISettings.modelConfig.openCloudConnectors'),
    cloudImplementationLabel: t('AISettings.modelConfig.cloudImplementation'),
    cloudImplementationPlaceholder: t('AISettings.modelConfig.cloudImplementationPlaceholder'),
    cloudTargetLabel: t('AISettings.modelConfig.cloudTarget'),
    cloudTargetPlaceholder: t('AISettings.modelConfig.cloudTargetPlaceholder'),
    cloudTargetDialogTitle: t('AISettings.modelConfig.cloudTargetDialogTitle'),
    cloudTargetDialogDescription: t('AISettings.modelConfig.cloudTargetDialogDescription'),
    cloudNoticeLabel: t('AISettings.modelConfig.cloudNotice'),
    cloudNoticeDescription: t('AISettings.modelConfig.cloudNoticeDescription'),
    cloudConnectorLabel: t('AISettings.modelConfig.cloudConnector'),
    cloudConnectorPlaceholder: t('AISettings.modelConfig.cloudConnectorPlaceholder'),
    cloudLoadFailed: t('AISettings.modelConfig.cloudLoadFailed'),
    cloudBlockedLabel: t('AISettings.modelConfig.cloudBlocked'),
    cloudCatalogStaleLabel: t('AISettings.modelConfig.cloudCatalogStale'),
    retryLabel: t('AISettings.modelConfig.retry'),
    loadFailed: t('AISettings.declared.loadFailed'),
    saveFailed: t('AISettings.modelConfig.saveFailed'),
    technicalDetailsLabel: t('AISettings.access.technicalDetails'),
    unsupportedCapabilityLabel: t('AISettings.modelConfig.unsupportedCapability'),
    notConfiguredLabel: t('AISettings.modelConfig.notConfigured'),
    configuredLabel: t('AISettings.modelConfig.configured'),
    selectionRequiredLabel: t('AISettings.modelConfig.selectionRequired'),
    blockedLabel: t('AISettings.modelConfig.blocked'),
    unavailableLabel: t('AISettings.modelConfig.unavailable'),
    mismatchLabel: t('AISettings.modelConfig.mismatch'),
    cancelLabel: t('AISettings.modelConfig.cancel'),
    confirmSelectionLabel: t('AISettings.modelConfig.confirmSelection'),
    capabilityLabel: (capabilityContract: string, fallback: string) => {
      const key = CAPABILITY_COPY_KEYS[capabilityContract]?.label;
      return key ? t(key) : fallback;
    },
    capabilityDescription: (capabilityContract: string, fallback: string) => {
      const key = CAPABILITY_COPY_KEYS[capabilityContract]?.description;
      return key ? t(key) : fallback;
    },
  }), [t]);
}

type ParentosAIConfigEditorProps = {
  readonly snapshot: ParentosAIConfigSnapshot | null;
  /** Null is canonical absence; undefined is an unavailable read. */
  readonly capabilities: readonly NimiPortableAppAIConfigIntent[] | null | undefined;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly onOverwriteResult: (result: NimiAIConfigOverwriteResult) => void;
};

// The shared Kit surface offers the same Local and Cloud route choices as the
// Desktop centralized editor and writes the covered self-owner AIConfig; the
// user's committed route is never narrowed or rewritten here.
// @nimi-authority: rule.parentos.shell.r006
export function ParentosAIConfigEditor({
  snapshot,
  capabilities,
  loading,
  disabled,
  onOverwriteResult,
}: ParentosAIConfigEditorProps) {
  const { i18n } = useTranslation();
  const copy = useParentosModelConfigCopy();
  return (
    <ModelConfigAIConfigSurface
      context={{ owner: 'app-ai-config', appId: PARENTOS_APP_ID }}
      capabilityContracts={PARENTOS_AI_CAPABILITY_CONTRACTS}
      capabilities={capabilities}
      revision={snapshot?.revision}
      effectiveSelections={snapshot?.effectiveSelections}
      listOptions={(query) => getParentosAIConfigManager().listOptions(query)}
      onOverwrite={async (input) => {
        const result = await getParentosAIConfigManager().overwrite(input);
        onOverwriteResult(result);
        return result;
      }}
      loading={loading}
      disabled={disabled}
      copy={copy}
      language={i18n.resolvedLanguage || i18n.language}
      showTitle={false}
      className="mt-4"
    />
  );
}
