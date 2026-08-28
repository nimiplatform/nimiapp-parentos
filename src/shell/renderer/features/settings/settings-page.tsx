import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Baby,
  BellRing,
  Bot,
  ChevronRight,
  Database,
  Download,
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
import { exportAppData, importAppData } from '../../infra/data-transfer.js';
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
  const [transferStatus, setTransferStatus] = useState<'idle' | 'exporting' | 'importing' | 'done' | 'error'>('idle');
  const [transferLabel, setTransferLabel] = useState('');
  const [transferResult, setTransferResult] = useState('');
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

  const transferBusy = transferStatus === 'exporting' || transferStatus === 'importing';

  const handleExportData = async () => {
    setTransferStatus('exporting');
    setTransferLabel('');
    setTransferResult('');
    try {
      const result = await exportAppData((p) => setTransferLabel(`${p.done}/${p.total}`));
      if (result.cancelled) {
        setTransferStatus('idle');
        return;
      }
      setTransferStatus(result.ok ? 'done' : 'error');
      setTransferResult(result.ok
        ? `${t('Settings.dataTransfer.exportDone', { fileName: result.fileName })}\n${t('Settings.dataTransfer.exportSummary', { tables: result.tableCount, rows: result.rowCount })}`
        : result.summary);
    } catch (error) {
      setTransferStatus('error');
      setTransferResult(error instanceof Error ? error.message : String(error));
    }
  };

  const handleImportData = async () => {
    if (!window.confirm(t('Settings.dataTransfer.restoreConfirm'))) {
      return;
    }
    setTransferStatus('importing');
    setTransferLabel('');
    setTransferResult('');
    try {
      const result = await importAppData((p) => setTransferLabel(`${p.done}/${p.total}`));
      if (result.cancelled) {
        setTransferStatus('idle');
        return;
      }
      setTransferStatus(result.ok ? 'done' : 'error');
      setTransferResult(result.ok
        ? t('Settings.dataTransfer.importSummary', { tables: result.tableCount, rows: result.rowCount })
        : result.summary);
      if (result.ok) {
        nimiToast.success(t('Settings.dataTransfer.importDone'));
      } else {
        nimiToast.danger(result.summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTransferStatus('error');
      setTransferResult(message);
      nimiToast.danger(message);
    }
  };

  const dividerClass = 'divide-y divide-[color-mix(in_srgb,var(--nimi-border-subtle)_70%,transparent)]';

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-[72px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">{t('Settings.title')}</h1>

        {currentUser ? (
          <Surface tone="card" material="solid" elevation="base" padding="none" className="mb-6 flex items-center gap-4 parentos-radius-xl p-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_14%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={24} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[17px] font-bold text-[var(--nimi-text-primary)]">
                {currentUser.displayName || currentUser.handle || t('Settings.account.unnamedUser')}
              </h3>
              {currentUser.handle ? (
                <p className="mt-0.5 truncate text-[13px] text-[var(--nimi-text-muted)]">@{currentUser.handle}</p>
              ) : null}
              <p className="mt-1 text-[12px] leading-snug text-[var(--nimi-text-muted)]">
                {t('Settings.account.managedByDesktop')}
              </p>
            </div>
          </Surface>
        ) : null}

        <Surface tone="card" material="solid" elevation="base" padding="none" className={cn('mb-6 overflow-hidden parentos-radius-xl', dividerClass)}>
          {sections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <Link
                key={section.to}
                to={section.to}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--nimi-action-ghost-hover)]"
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14', section.iconClassName)}>
                  <SectionIcon size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-[var(--nimi-text-primary)]">{t(section.labelKey)}</h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{t(section.descKey)}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--nimi-text-muted)]" aria-hidden="true" />
              </Link>
            );
          })}
        </Surface>

        <p className="mb-3 text-[13px] font-semibold text-[var(--nimi-text-muted)]">{t('Settings.general')}</p>
        <Surface tone="card" material="solid" elevation="base" padding="none" className="mb-6 parentos-radius-xl">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-status-info)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-info)]">
              <Languages size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-[var(--nimi-text-primary)]">{t('Settings.language.title')}</h3>
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
          </div>
        </Surface>

        <Surface tone="card" material="solid" elevation="base" padding="none" className="mb-6 parentos-radius-xl">
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-status-success)_12%,var(--nimi-surface-card))] text-[var(--nimi-status-success)]">
                <Database size={18} aria-hidden="true" />
              </div>
              <div className="min-w-[220px] flex-1">
                <h3 className="text-[15px] font-semibold text-[var(--nimi-text-primary)]">
                  {transferBusy
                    ? t('Settings.dataTransfer.workingWithProgress', { progress: transferLabel })
                    : t('Settings.dataTransfer.title')}
                </h3>
                <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-[var(--nimi-text-muted)]">
                  {transferStatus === 'done' || transferStatus === 'error'
                    ? transferResult
                    : t('Settings.dataTransfer.desc')}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={transferBusy}
                  className={cn(buttonVariants({ tone: 'primary', size: 'sm' }), 'gap-1.5 disabled:opacity-50')}
                >
                  <Download size={14} aria-hidden="true" />
                  {transferStatus === 'exporting' ? t('Settings.dataTransfer.exporting') : t('Settings.dataTransfer.export')}
                </button>
                <button
                  type="button"
                  onClick={handleImportData}
                  disabled={transferBusy}
                  className={cn(buttonVariants({ tone: 'ghost', size: 'sm' }), 'gap-1.5 border border-[var(--nimi-border-subtle)] disabled:opacity-50')}
                >
                  <Upload size={14} aria-hidden="true" />
                  {transferStatus === 'importing' ? t('Settings.dataTransfer.importing') : t('Settings.dataTransfer.import')}
                </button>
              </div>
            </div>
          </div>
        </Surface>

        <p className="mb-3 text-[13px] font-semibold text-[var(--nimi-text-muted)]">{t('Settings.other')}</p>
        <Surface tone="card" material="solid" elevation="base" padding="none" className={cn('parentos-radius-xl', dividerClass)}>
          {infoCards.map((card) => {
            const InfoIcon = card.icon;
            return (
              <div key={card.labelKey} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[var(--nimi-action-secondary-bg)] text-[var(--nimi-text-muted)]">
                  <InfoIcon size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-[var(--nimi-text-primary)]">{t(card.labelKey)}</h3>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--nimi-text-muted)]">{t(card.descKey)}</p>
                </div>
              </div>
            );
          })}
        </Surface>

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
