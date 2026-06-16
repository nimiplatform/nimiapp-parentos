import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SelectField, Surface, cn } from '@nimiplatform/kit/ui';
import { useAppStore, type NurtureMode } from '../../app-shell/app-store.js';
import { NURTURE_MODES, REMINDER_DOMAINS } from '../../knowledge-base/index.js';
import { updateChild } from '../../bridge/sqlite-bridge.js';
import { isoNow } from '../../bridge/ulid.js';

/* ── labels ─────────────────────────────────────────────────── */

const MODE_META: Record<string, {
  emoji: string;
  cardClassName: string;
  iconClassName: string;
  textClassName: string;
  dotClassName: string;
  domainRowClassName: string;
}> = {
  relaxed: {
    emoji: '🌿',
    cardClassName: 'parentos-mode-card-relaxed-active',
    iconClassName: 'parentos-mode-icon-relaxed-active',
    textClassName: 'parentos-mode-text-relaxed-active',
    dotClassName: 'parentos-mode-dot-relaxed-active',
    domainRowClassName: 'parentos-domain-row-relaxed-active',
  },
  balanced: {
    emoji: '⚖️',
    cardClassName: 'parentos-mode-card-balanced-active',
    iconClassName: 'parentos-mode-icon-balanced-active',
    textClassName: 'parentos-mode-text-balanced-active',
    dotClassName: 'parentos-mode-dot-balanced-active',
    domainRowClassName: 'parentos-domain-row-balanced-active',
  },
  advanced: {
    emoji: '🔬',
    cardClassName: 'parentos-mode-card-advanced-active',
    iconClassName: 'parentos-mode-icon-advanced-active',
    textClassName: 'parentos-mode-text-advanced-active',
    dotClassName: 'parentos-mode-dot-advanced-active',
    domainRowClassName: 'parentos-domain-row-advanced-active',
  },
};

const FALLBACK_MODE_META = {
  emoji: '📋',
  cardClassName: 'parentos-mode-card-advanced-active',
  iconClassName: 'parentos-mode-icon-fallback-active',
  textClassName: 'parentos-mode-text-fallback-active',
  dotClassName: 'parentos-mode-dot-fallback-active',
  domainRowClassName: 'parentos-domain-row-advanced-active',
};

const DOMAIN_GROUPS: Array<{ labelKey: string; emoji: string; iconClassName: string; domains: string[] }> = [
  { labelKey: 'Settings.nurtureMode.domainGroups.health', emoji: '💪', iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-info)_12%,var(--nimi-surface-card))]', domains: ['growth', 'nutrition', 'sleep', 'checkup', 'vaccine', 'dental', 'vision', 'bone-age'] },
  { labelKey: 'Settings.nurtureMode.domainGroups.mind', emoji: '🧠', iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-action-primary-bg)_12%,var(--nimi-surface-card))]', domains: ['language', 'emotional', 'sensitivity', 'independence'] },
  { labelKey: 'Settings.nurtureMode.domainGroups.social', emoji: '🤝', iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-danger)_8%,var(--nimi-surface-card))]', domains: ['relationship', 'values', 'sexuality', 'safety', 'hygiene'] },
  { labelKey: 'Settings.nurtureMode.domainGroups.planning', emoji: '🌟', iconClassName: 'bg-[color-mix(in_srgb,var(--nimi-status-warning)_10%,var(--nimi-surface-card))]', domains: ['interest', 'career', 'digital'] },
];

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function NurtureModeSettingsPage() {
  const { t } = useTranslation();
  const { activeChildId, children, setChildren } = useAppStore();
  const child = children.find((c) => c.childId === activeChildId);

  if (!child) {
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="mx-auto max-w-3xl px-6 pb-6 pt-[86px]">
          <Link to="/settings" className="text-[14px] text-[var(--nimi-text-muted)] hover:underline">{t('Settings.common.backToSettings')}</Link>
          <p className="mt-6 text-[14px] text-[var(--nimi-text-muted)]">{t('Settings.common.noActiveChild')}</p>
        </div>
      </div>
    );
  }

  const handleModeChange = async (newMode: NurtureMode) => {
    const nextOverridesEntries = Object.entries(child.nurtureModeOverrides ?? {}).filter(
      ([, mode]) => mode !== newMode,
    );
    const nextOverrides = nextOverridesEntries.length > 0
      ? Object.fromEntries(nextOverridesEntries) as Record<string, NurtureMode>
      : null;
    const now = isoNow();
    try {
      await updateChild({
        childId: child.childId, displayName: child.displayName, gender: child.gender,
        birthDate: child.birthDate, birthWeightKg: child.birthWeightKg,
        birthHeightCm: child.birthHeightCm, birthHeadCircCm: child.birthHeadCircCm,
        avatarPath: child.avatarPath, nurtureMode: newMode,
        nurtureModeOverrides: nextOverrides ? JSON.stringify(nextOverrides) : null,
        allergies: child.allergies ? JSON.stringify(child.allergies) : null,
        medicalNotes: child.medicalNotes ? JSON.stringify(child.medicalNotes) : null,
        recorderProfiles: child.recorderProfiles ? JSON.stringify(child.recorderProfiles) : null,
        now,
      });
      setChildren(children.map((c) => c.childId === child.childId
        ? { ...c, nurtureMode: newMode, nurtureModeOverrides: nextOverrides, updatedAt: now }
        : c));
    } catch { /* bridge unavailable */ }
  };

  const handleDomainOverride = async (domain: string, mode: NurtureMode | null) => {
    const overrides = { ...(child.nurtureModeOverrides ?? {}) };
    if (mode === null || mode === child.nurtureMode) {
      delete overrides[domain];
    } else {
      overrides[domain] = mode;
    }
    const newOverrides = Object.keys(overrides).length > 0 ? overrides : null;
    const now = isoNow();
    try {
      await updateChild({
        childId: child.childId, displayName: child.displayName, gender: child.gender,
        birthDate: child.birthDate, birthWeightKg: child.birthWeightKg,
        birthHeightCm: child.birthHeightCm, birthHeadCircCm: child.birthHeadCircCm,
        avatarPath: child.avatarPath, nurtureMode: child.nurtureMode,
        nurtureModeOverrides: newOverrides ? JSON.stringify(newOverrides) : null,
        allergies: child.allergies ? JSON.stringify(child.allergies) : null,
        medicalNotes: child.medicalNotes ? JSON.stringify(child.medicalNotes) : null,
        recorderProfiles: child.recorderProfiles ? JSON.stringify(child.recorderProfiles) : null,
        now,
      });
      setChildren(children.map((c) => c.childId === child.childId ? { ...c, nurtureModeOverrides: newOverrides, updatedAt: now } : c));
    } catch { /* bridge unavailable */ }
  };

  const overrideCount = Object.keys(child.nurtureModeOverrides ?? {}).length;

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-3xl px-6 pb-6 pt-[86px]">

        <Link to="/settings" className="mb-5 inline-flex items-center gap-1 text-[14px] text-[var(--nimi-text-muted)] hover:underline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          {t('Settings.common.backToSettings')}
        </Link>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--nimi-text-primary)]">{t('Settings.nurtureMode.childTitle', { name: child.displayName })}</h1>
          <p className="mt-0.5 text-[14px] text-[var(--nimi-text-muted)]">
            {t('Settings.nurtureMode.subtitle')}
          </p>
        </div>

        {/* ── Global mode selector ───────────────────────── */}
        <Surface tone="card" material="solid" elevation="base" padding="lg" className="mb-5 parentos-radius-xl p-5">
          <h2 className="mb-4 text-[16px] font-bold text-[var(--nimi-text-primary)]">{t('Settings.nurtureMode.globalMode')}</h2>
          <div className="grid grid-cols-3 gap-3">
            {NURTURE_MODES.map((m) => {
              const active = child.nurtureMode === m.modeId;
              const meta = MODE_META[m.modeId] ?? FALLBACK_MODE_META;
              const modeName = t(`Settings.nurtureMode.modes.${m.modeId}.displayName`, { defaultValue: m.displayName });
              const modeSubtitle = t(`Settings.nurtureMode.modes.${m.modeId}.subtitle`, { defaultValue: m.subtitle });
              const modeDescription = t(`Settings.nurtureMode.modes.${m.modeId}.description`, { defaultValue: m.description });
              return (
                <button key={m.modeId} onClick={() => void handleModeChange(m.modeId)}
                  className={cn(
                    'parentos-radius-lg p-4 text-left transition-all duration-200',
                    active ? meta.cardClassName : 'parentos-mode-card-idle hover:scale-[1.01] hover:shadow-[var(--nimi-elevation-raised)]',
                  )}
                >
                  {/* Mode icon + name */}
                  <div className="mb-2 flex items-center gap-2">
                    <div className={cn(
                      'flex h-[34px] w-[34px] items-center justify-center parentos-radius-10 bg-[var(--nimi-action-secondary-bg)] text-[16px]',
                      active && meta.iconClassName,
                    )}>
                      {meta.emoji}
                    </div>
                    <div>
                      <h3 className={cn('text-[14px] font-semibold text-[var(--nimi-text-primary)]', active && meta.textClassName)}>{modeName}</h3>
                      <p className="text-[12px] text-[var(--nimi-text-muted)]">{modeSubtitle}</p>
                    </div>
                  </div>
                  {/* Description */}
                  <p className="mb-3 text-[13px] leading-[1.6] text-[var(--nimi-text-secondary)]">{modeDescription}</p>
                  {/* Parameters */}
                  <div className="space-y-1.5">
                    {[
                      t('Settings.nurtureMode.parameter.generalReminder', {
                        value: t(`Settings.nurtureMode.reminderBehavior.${m.parameters.reminderBehavior.P1}`, { defaultValue: m.parameters.reminderBehavior.P1 }),
                      }),
                      t('Settings.nurtureMode.parameter.maxDailyPush', { count: m.parameters.pushFrequency.maxDailyPush }),
                      t('Settings.nurtureMode.parameter.digest', {
                        value: t(`Settings.nurtureMode.digestMode.${m.parameters.pushFrequency.digestMode}`, { defaultValue: m.parameters.pushFrequency.digestMode }),
                      }),
                    ].map((line) => (
                      <p key={line} className="flex items-center gap-1.5 text-[12px] leading-[1.6] text-[var(--nimi-text-muted)]">
                        <span className={cn('h-1 w-1 shrink-0 rounded-full bg-[var(--nimi-border-strong)]', active && meta.dotClassName)} />
                        {line}
                      </p>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Surface>

        {/* ── Domain overrides ───────────────────────────── */}
        <Surface tone="card" material="solid" elevation="base" padding="lg" className="parentos-radius-xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-[var(--nimi-text-primary)]">{t('Settings.nurtureMode.domainOverrides')}</h2>
              <p className="mt-0.5 text-[13px] text-[var(--nimi-text-muted)]">{t('Settings.nurtureMode.domainOverridesDesc')}</p>
            </div>
            {overrideCount > 0 && (
              <span className="rounded-full bg-[var(--nimi-surface-active)] px-2.5 py-1 text-[12px] font-medium text-[var(--nimi-action-primary-bg)]">
                {t('Settings.nurtureMode.overrideCount', { count: overrideCount })}
              </span>
            )}
          </div>

          <div className="space-y-5">
            {DOMAIN_GROUPS.map((group) => {
              const globalLabel = t(`Settings.nurtureMode.modes.${child.nurtureMode}.displayName`, {
                defaultValue: NURTURE_MODES.find((m) => m.modeId === child.nurtureMode)?.displayName ?? child.nurtureMode,
              });
              const validDomains = group.domains.filter((d) => REMINDER_DOMAINS.includes(d));
              if (validDomains.length === 0) return null;

              return (
                <div key={group.labelKey}>
                  {/* Group header */}
                  <div className="mb-2.5 flex items-center gap-2">
                    <div className={cn('flex h-[28px] w-[28px] items-center justify-center parentos-radius-sm text-[16px]', group.iconClassName)}>
                      {group.emoji}
                    </div>
                    <h3 className="text-[14px] font-bold text-[var(--nimi-text-primary)]">{t(group.labelKey)}</h3>
                  </div>
                  {/* Domain rows */}
                  <div className="space-y-1.5">
                    {validDomains.map((domain) => {
                      const override = child.nurtureModeOverrides?.[domain];
                      const overrideMeta = override ? MODE_META[override] : null;
                      return (
                        <div key={domain}
                          className={cn(
                            'flex items-center justify-between parentos-radius-lg px-4 py-2.5 transition-all',
                            override ? overrideMeta?.domainRowClassName ?? FALLBACK_MODE_META.domainRowClassName : 'parentos-domain-row-idle',
                          )}>
                          <span className="text-[14px] font-medium text-[var(--nimi-text-primary)]">{t(`Settings.domains.${domain}`, { defaultValue: domain })}</span>
                          <SelectField
                            value={override ?? ''}
                            onValueChange={(v) => void handleDomainOverride(domain, v ? v as NurtureMode : null)}
                            placeholder={t('Settings.nurtureMode.followGlobal', { mode: globalLabel })}
                            options={[
                              { value: 'relaxed', label: `🌿 ${t('Settings.nurtureMode.modes.relaxed.displayName')}` },
                              { value: 'balanced', label: `⚖️ ${t('Settings.nurtureMode.modes.balanced.displayName')}` },
                              { value: 'advanced', label: `🔬 ${t('Settings.nurtureMode.modes.advanced.displayName')}` },
                            ]}
                            className="w-[220px] whitespace-nowrap"
                          />
                        </div>
                      );
                    })}
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
