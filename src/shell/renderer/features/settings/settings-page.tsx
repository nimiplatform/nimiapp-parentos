import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Baby,
  BellRing,
  Bot,
  ChevronRight,
  Database,
  Info,
  Languages,
  Sprout,
  Upload,
  UserRound,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Surface, SegmentedControl, buttonVariants, cn, nimiToast } from '@nimiplatform/kit/ui';
import type { NimiCurrentUserDisplay } from '@nimiplatform/sdk/app';
import { seedMockData, type SeedProgress } from '../../infra/mock-seed.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import { probeParentosNimiAccess } from '../../infra/runtime-status.js';
import {
  APP_LANGUAGE_LABELS,
  APP_LANGUAGES,
  parseStoredAppLanguage,
  resolveAppLanguage,
} from '../../i18n/language.js';
import { saveAndApplyAppLanguage } from '../../i18n/app-language.js';

type SettingsSection = {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly labelKey: string;
  readonly descKey: string;
  readonly iconClassName: string;
};

const sections: readonly SettingsSection[] = [
  {
    to: '/settings/children',
    icon: Baby,
    labelKey: 'Settings.sections.children.label',
    descKey: 'Settings.sections.children.desc',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]',
  },
  {
    to: '/settings/nurture-mode',
    icon: Sprout,
    labelKey: 'Settings.sections.nurtureMode.label',
    descKey: 'Settings.sections.nurtureMode.desc',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-success)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]',
  },
  {
    to: '/settings/reminders',
    icon: BellRing,
    labelKey: 'Settings.sections.reminders.label',
    descKey: 'Settings.sections.reminders.desc',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-warning)]',
  },
  {
    to: '/settings/ai',
    icon: Bot,
    labelKey: 'Settings.sections.ai.label',
    descKey: 'Settings.sections.ai.desc',
    iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]',
  },
];

const infoCards = [
  {
    icon: ShieldCheck,
    labelKey: 'Settings.info.privacy.label',
    descKey: 'Settings.info.privacy.desc',
  },
  {
    icon: Info,
    labelKey: 'Settings.info.about.label',
    descKey: 'Settings.info.about.desc',
  },
] as const;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<NimiCurrentUserDisplay | null>(null);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedLabel, setSeedLabel] = useState('');
  const [seedResult, setSeedResult] = useState('');
  const currentLanguage = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  const languageItems = APP_LANGUAGES.map((language) => ({
    value: language,
    label: APP_LANGUAGE_LABELS[language],
    disabled: languageSaving,
  }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const posture = await probeParentosNimiAccess();
      if (posture.state !== 'ready') {
        if (!cancelled) setCurrentUser(null);
        return;
      }
      try {
        const user = await getParentOSNimiClient().currentUser.get();
        if (!cancelled) setCurrentUser(user);
      } catch {
        if (!cancelled) setCurrentUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLanguageChange = async (value: string) => {
    const language = parseStoredAppLanguage(value);
    if (!language || language === currentLanguage) {
      return;
    }
    setLanguageSaving(true);
    try {
      await saveAndApplyAppLanguage(language);
    } catch (error) {
      nimiToast.danger(error instanceof Error ? error.message : String(error || t('Settings.language.saveFailed')));
    } finally {
      setLanguageSaving(false);
    }
  };

  const handleSeedMock = async () => {
    setSeedStatus('seeding');
    setSeedLabel('');
    setSeedResult('');
    const result = await seedMockData((p: SeedProgress) => {
      setSeedLabel(`${p.label} ${p.done}/${p.total}`);
    });
    setSeedStatus(result.ok ? 'done' : 'error');
    setSeedResult(result.summary);
  };

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-[72px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">{t('Settings.title')}</h1>

        {currentUser ? (
          <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-6 flex items-center gap-4 parentos-radius-xl p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={19} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[16px] font-semibold text-[var(--nimi-text-primary)]">
                {currentUser.displayName || currentUser.handle || t('Settings.account.unnamedUser')}
              </h3>
              {currentUser.handle ? (
                <p className="mt-0.5 truncate text-[13px] text-[var(--nimi-text-muted)]">@{currentUser.handle}</p>
              ) : null}
              <p className="mt-1 text-[13px] leading-snug text-[var(--nimi-text-muted)]">
                {t('Settings.account.managedByDesktop')}
              </p>
            </div>
          </Surface>
        ) : null}

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-6 flex flex-col gap-4 parentos-radius-xl p-5 sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nimi-status-info)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]">
            <Languages size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">{t('Settings.language.title')}</h3>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{t('Settings.language.desc')}</p>
          </div>
          <SegmentedControl
            ariaLabel={t('Settings.language.ariaLabel')}
            value={currentLanguage}
            onValueChange={handleLanguageChange}
            items={languageItems}
            size="sm"
            className="shrink-0 self-start sm:self-auto"
          />
        </Surface>

        <div className="mb-6 grid gap-3">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <Surface
                key={section.to}
                as={Link}
                to={section.to}
                tone="card"
                material="solid"
                elevation="base"
                padding="lg"
                interactive
                className="flex items-center gap-4 parentos-radius-xl p-5"
              >
                <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center parentos-radius-14', section.iconClassName)}>
                  <SectionIcon size={19} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">{t(section.labelKey)}</h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{t(section.descKey)}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--nimi-text-muted)]" aria-hidden="true" />
              </Surface>
            );
          })}
        </div>

        <p className="mb-3 text-[13px] font-semibold text-[var(--nimi-text-muted)]">{t('Settings.other')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {infoCards.map((card) => {
            const InfoIcon = card.icon;
            return (
              <Surface key={card.labelKey} tone="card" material="solid" elevation="base" padding="md" className="parentos-radius-xl p-4">
                <div className="mb-3 flex h-9 w-9 items-center justify-center parentos-radius-10 bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)]">
                  <InfoIcon size={17} aria-hidden="true" />
                </div>
                <h3 className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{t(card.labelKey)}</h3>
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{t(card.descKey)}</p>
              </Surface>
            );
          })}
        </div>

        {import.meta.env.DEV ? (
          <div className="mt-6">
            <p className="mb-3 text-[13px] font-semibold text-[var(--nimi-text-muted)]">{t('Settings.dev.title')}</p>
            <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-status-info)_10%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]">
                  <Database size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">
                    {seedStatus === 'seeding' ? t('Settings.dev.importingWithProgress', { progress: seedLabel }) : t('Settings.dev.importMockData')}
                  </h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">
                    {seedStatus === 'done' ? seedResult
                      : seedStatus === 'error' ? seedResult
                      : t('Settings.dev.importMockDataDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSeedMock}
                  disabled={seedStatus === 'seeding'}
                  className={cn(
                    buttonVariants({ tone: seedStatus === 'error' ? 'ghost' : 'primary', size: 'sm' }),
                    'shrink-0 gap-1.5 disabled:opacity-50',
                    seedStatus === 'error' && 'border border-[color-mix(in_srgb,var(--nimi-status-danger)_40%,var(--nimi-border-subtle))] text-[var(--nimi-status-danger)]',
                  )}
                >
                  <Upload size={14} aria-hidden="true" />
                  {seedStatus === 'seeding' ? t('Settings.dev.importing')
                    : seedStatus === 'done' ? t('Settings.dev.done')
                    : seedStatus === 'error' ? t('Settings.dev.retry')
                    : t('Settings.dev.import')}
                </button>
              </div>
            </Surface>
          </div>
        ) : null}
      </div>
    </div>
  );
}
