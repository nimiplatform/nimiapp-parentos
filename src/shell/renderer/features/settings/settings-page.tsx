import { useState } from 'react';
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
import { Surface, SegmentedControl, buttonVariants, cn } from '@nimiplatform/kit/ui';
import { useAppStore } from '../../app-shell/app-store.js';
import { logoutParentOSRuntimeAccount } from '../auth/parentos-auth-adapter.js';
import { seedMockData, type SeedProgress } from '../../infra/mock-seed.js';
import { syncParentOSLocalDataScope } from '../../infra/parentos-bootstrap.js';
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
  const authUser = useAppStore((s) => s.auth.user);
  const authStatus = useAppStore((s) => s.auth.status);
  const clearAuth = useAppStore((s) => s.clearAuthSession);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [seedLabel, setSeedLabel] = useState('');
  const [seedResult, setSeedResult] = useState('');
  const currentLanguage = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  const languageItems = APP_LANGUAGES.map((language) => ({
    value: language,
    label: APP_LANGUAGE_LABELS[language],
    disabled: languageSaving,
  }));

  const handleLanguageChange = async (value: string) => {
    const language = parseStoredAppLanguage(value);
    if (!language || language === currentLanguage) {
      return;
    }
    setLanguageSaving(true);
    setLanguageError(null);
    try {
      await saveAndApplyAppLanguage(language);
    } catch (error) {
      setLanguageError(error instanceof Error ? error.message : String(error || t('Settings.language.saveFailed')));
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

  const handleLogout = async () => {
    setLoggingOut(true);
    // PO-SHELL-008: revoke through Runtime account custody (single source of
    // truth). Local auth projection is cleared only after Runtime accepts logout.
    setLogoutError(null);
    try {
      await logoutParentOSRuntimeAccount();
      clearAuth();
      void syncParentOSLocalDataScope(null);
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : String(error || t('Settings.account.logoutFailed')));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-[72px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">{t('Settings.title')}</h1>

        {authStatus === 'authenticated' && authUser ? (
          <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-6 flex items-center gap-4 parentos-radius-xl p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
              <UserRound size={19} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[16px] font-semibold text-[var(--nimi-text-primary)]">
                {authUser.displayName || t('Settings.account.unnamedUser')}
              </h3>
              {authUser.email ? (
                <p className="mt-0.5 truncate text-[13px] text-[var(--nimi-text-muted)]">{authUser.email}</p>
              ) : null}
              {logoutError ? (
                <p className="mt-2 text-[13px] leading-snug text-[var(--nimi-status-danger)]">{logoutError}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={cn(
                buttonVariants({ tone: 'ghost', size: 'sm' }),
                'shrink-0 border border-[color-mix(in_srgb,var(--nimi-status-danger)_40%,var(--nimi-border-subtle))] text-[var(--nimi-status-danger)] disabled:opacity-50',
              )}
            >
              {loggingOut ? t('Settings.account.loggingOut') : t('Settings.account.logout')}
            </button>
          </Surface>
        ) : null}

        <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-6 flex flex-col gap-4 parentos-radius-xl p-5 sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nimi-status-info)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]">
            <Languages size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-[var(--nimi-text-primary)]">{t('Settings.language.title')}</h3>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{t('Settings.language.desc')}</p>
            {languageError ? (
              <p className="mt-2 text-[13px] leading-snug text-[var(--nimi-status-danger)]">{languageError}</p>
            ) : null}
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
