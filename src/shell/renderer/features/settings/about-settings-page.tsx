import { useTranslation } from 'react-i18next';
import { BookOpen, HeartHandshake, Sparkles } from 'lucide-react';
import { Surface } from '@nimiplatform/kit/ui';
import { version } from '../../../../../package.json';
import parentosLogoUrl from '../../../../../src-tauri/icons/icon.png';
import { SettingsInfoCard, SettingsInfoLayout, SettingsInfoLink } from './settings-info-layout.js';

// @nimi-authority: rule.parentos.shell.r006
export default function AboutSettingsPage() {
  const { t } = useTranslation();
  return (
    <SettingsInfoLayout title={t('Settings.info.about.label')}>
      <Surface tone="card" material="solid" elevation="base" padding="none" className="parentos-radius-xl px-6 py-8 text-center">
        <img src={parentosLogoUrl} alt="" className="mx-auto mb-4 h-16 w-16 object-contain" />
        <h2 className="text-2xl font-bold text-[var(--nimi-text-primary)]">{t('AboutSettings.name')}</h2>
        <p className="mt-2 text-sm text-[var(--nimi-text-muted)]">{t('AboutSettings.tagline')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-medium text-[var(--nimi-text-secondary)]">
          <span className="rounded-full bg-[var(--nimi-action-secondary-bg)] px-3 py-1.5">{t('AboutSettings.version', { version })}</span>
          <span className="rounded-full bg-[var(--nimi-action-secondary-bg)] px-3 py-1.5">{t('AboutSettings.stage')}</span>
        </div>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-[var(--nimi-text-secondary)]">{t('AboutSettings.intro')}</p>
      </Surface>
      <SettingsInfoCard icon={BookOpen} title={t('AboutSettings.features.title')}>
        <ul className="space-y-3">
          {(['reminders', 'records', 'insights'] as const).map((key) => <li key={key}><h3 className="font-medium text-[var(--nimi-text-primary)]">{t(`AboutSettings.features.${key}.title`)}</h3><p>{t(`AboutSettings.features.${key}.body`)}</p></li>)}
        </ul>
      </SettingsInfoCard>
      <SettingsInfoCard icon={HeartHandshake} title={t('AboutSettings.boundary.title')}>
        <p>{t('AboutSettings.boundary.body')}</p>
        <p>{t('AboutSettings.boundary.professional')}</p>
      </SettingsInfoCard>
      <SettingsInfoCard icon={Sparkles} title={t('AboutSettings.nimi.title')}>
        <p>{t('AboutSettings.nimi.body')}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <SettingsInfoLink to="/settings/ai">{t('PrivacySettings.ai.action')}</SettingsInfoLink>
          <SettingsInfoLink to="/settings/privacy">{t('Settings.info.privacy.label')}</SettingsInfoLink>
        </div>
      </SettingsInfoCard>
    </SettingsInfoLayout>
  );
}
