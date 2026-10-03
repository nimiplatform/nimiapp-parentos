import { useTranslation } from 'react-i18next';
import { Baby, Bot, Database, HardDrive, ShieldCheck } from 'lucide-react';
import { Surface } from '@nimiplatform/kit/ui';
import { SettingsInfoCard, SettingsInfoLayout, SettingsInfoLink } from './settings-info-layout.js';

// @nimi-authority: rule.parentos.shell.r006
// @nimi-authority: rule.parentos.shell.r009
export default function PrivacySettingsPage() {
  const { t } = useTranslation();
  return (
    <SettingsInfoLayout title={t('Settings.info.privacy.label')}>
      <Surface tone="card" material="solid" elevation="base" padding="none" className="parentos-radius-xl bg-[color-mix(in_srgb,var(--nimi-status-success)_6%,var(--nimi-surface-card))] p-6 sm:p-8">
        <ShieldCheck size={30} className="mb-4 text-[var(--nimi-status-success)]" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-[var(--nimi-text-primary)]">{t('PrivacySettings.headline')}</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--nimi-text-secondary)]">{t('PrivacySettings.intro')}</p>
      </Surface>
      <SettingsInfoCard icon={HardDrive} title={t('PrivacySettings.storage.title')}>
        <p>{t('PrivacySettings.storage.body')}</p>
        <p>{t('PrivacySettings.storage.access')}</p>
      </SettingsInfoCard>
      <SettingsInfoCard icon={Bot} title={t('PrivacySettings.ai.title')}>
        <p>{t('PrivacySettings.ai.body')}</p>
        <p>{t('PrivacySettings.ai.account')}</p>
        <SettingsInfoLink to="/settings/ai">{t('PrivacySettings.ai.action')}</SettingsInfoLink>
      </SettingsInfoCard>
      <SettingsInfoCard icon={Database} title={t('PrivacySettings.backup.title')}>
        <p>{t('PrivacySettings.backup.body')}</p>
        <p>{t('PrivacySettings.backup.restore')}</p>
        <p>{t('PrivacySettings.backup.care')}</p>
        <SettingsInfoLink to="/settings#data-backup">{t('PrivacySettings.backup.action')}</SettingsInfoLink>
      </SettingsInfoCard>
      <SettingsInfoCard icon={Baby} title={t('PrivacySettings.delete.title')}>
        <p>{t('PrivacySettings.delete.body')}</p>
        <p>{t('PrivacySettings.delete.exports')}</p>
        <SettingsInfoLink to="/settings/children">{t('PrivacySettings.delete.action')}</SettingsInfoLink>
      </SettingsInfoCard>
    </SettingsInfoLayout>
  );
}
