import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, type LucideIcon } from 'lucide-react';
import { Surface } from '@nimiplatform/kit/ui';

export function SettingsInfoLayout({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-3xl px-6 pb-10 pt-[72px]">
        <Link to="/settings" className="mb-5 inline-flex items-center gap-1.5 rounded-lg text-sm text-[var(--nimi-text-secondary)] hover:text-[var(--nimi-action-primary-bg)] focus-visible:outline-2 focus-visible:outline-offset-4">
          <ChevronLeft size={16} aria-hidden="true" />{t('SettingsDetails.back')}
        </Link>
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--nimi-text-primary)]">{title}</h1>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

export function SettingsInfoCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Surface tone="card" material="solid" elevation="base" padding="none" className="parentos-radius-xl p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center parentos-radius-14 bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_10%,var(--nimi-surface-card))] text-[var(--nimi-action-primary-bg)]"><Icon size={19} aria-hidden="true" /></span>
        <h2 className="text-base font-semibold text-[var(--nimi-text-primary)]">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-7 text-[var(--nimi-text-secondary)]">{children}</div>
    </Surface>
  );
}

export function SettingsInfoLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="inline-flex items-center gap-1.5 rounded-lg font-medium text-[var(--nimi-action-primary-bg)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{children}<ArrowUpRight size={15} aria-hidden="true" /></Link>;
}
