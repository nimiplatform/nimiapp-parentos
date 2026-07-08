import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  Landmark,
  NotebookPen,
  Plus,
  ShieldCheck,
  Sparkles,
  type LucideProps,
} from 'lucide-react';
import { AmbientBackground, Surface, buttonVariants, cn } from '@nimiplatform/kit/ui';
import { useAppStore, computeAgeMonths } from '../../app-shell/app-store.js';
import { ChildAvatar } from '../../shared/child-avatar.js';
import { i18nText } from '../../i18n/index.js';


type WelcomeIcon = ComponentType<LucideProps>;

interface FeatureCardSpec {
  icon: WelcomeIcon;
  titleKey: string;
  descKey: string;
}

interface TrustBadgeSpec {
  icon: WelcomeIcon;
  labelKey: string;
}

const INTRO_COMPLETE_MS = 3800;

const BENTO: readonly FeatureCardSpec[] = [
  {
    icon: Archive,
    titleKey: 'Timeline.welcome.feature.healthArchive.title',
    descKey: 'Timeline.welcome.feature.healthArchive.description',
  },
  {
    icon: NotebookPen,
    titleKey: 'Timeline.welcome.feature.observation.title',
    descKey: 'Timeline.welcome.feature.observation.description',
  },
  {
    icon: Sparkles,
    titleKey: 'Timeline.welcome.feature.reminder.title',
    descKey: 'Timeline.welcome.feature.reminder.description',
  },
] as const;

const TRUST: readonly TrustBadgeSpec[] = [
  { icon: ShieldCheck, labelKey: 'Timeline.welcome.trust.localFirst' },
  { icon: Landmark, labelKey: 'Timeline.welcome.trust.standards' },
] as const;

/* ── component ───────────────────────────────────────────── */

export function WelcomePage() {
  const children = useAppStore((s) => s.children);
  const setActiveChildId = useAppStore((s) => s.setActiveChildId);
  const hasChildren = children.length > 0;
  const [introVisible, setIntroVisible] = useState(!hasChildren);

  useEffect(() => {
    if (hasChildren) {
      setIntroVisible(false);
      return undefined;
    }

    if (
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setIntroVisible(false);
      return undefined;
    }

    setIntroVisible(true);

    const completeTimer = window.setTimeout(() => setIntroVisible(false), INTRO_COMPLETE_MS);
    return () => window.clearTimeout(completeTimer);
  }, [hasChildren]);

  const today = new Date();
  const dateStr = today.toLocaleDateString(i18nText('Common.date.locale'), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const hour = today.getHours();
  const greeting = hour < 12
    ? i18nText('Timeline.welcome.greeting.morning')
    : hour < 18
      ? i18nText('Timeline.welcome.greeting.afternoon')
      : i18nText('Timeline.welcome.greeting.evening');
  const showIntro = !hasChildren && introVisible;

  return (
    <AmbientBackground variant="mesh" className="relative flex h-full overflow-hidden">
      {showIntro && <WelcomeIntro onSkip={() => setIntroVisible(false)} />}

      <div
        className={cn(
          'relative min-w-0 flex-1 overflow-y-auto px-5 pb-8 pt-4 sm:px-8 sm:pt-5 lg:px-[60px] lg:pb-10 lg:pt-8',
          showIntro ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        aria-hidden={showIntro}
      >
        <div className="flex min-h-full flex-col gap-8">
          <header>
            <p className="text-[14px] font-medium tracking-wide text-[var(--nimi-text-muted)]">{dateStr}</p>
            <h1 className="mt-2 text-[24px] font-semibold text-[var(--nimi-text-primary)]">
              {i18nText('Timeline.welcome.greetingLine', { greeting })}
            </h1>
          </header>

          <Surface
            as="section"
            material="glass-thick"
            padding="none"
            tone="card"
            className="relative overflow-hidden p-6 sm:p-8 lg:p-12"
          >
            <div className="parentos-welcome-hero-glow" aria-hidden="true" />
            <div className="relative flex flex-col gap-10 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-[520px]">
                <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--nimi-action-primary-bg)]">
                  {i18nText('Timeline.welcome.eyebrow')}
                </p>
                <h2 className="text-[30px] font-semibold leading-tight text-[var(--nimi-text-primary)] sm:text-[36px]">
                  {hasChildren ? i18nText('Timeline.welcome.hero.withChildrenTitle') : i18nText('Timeline.welcome.hero.emptyTitle')}
                </h2>
                <p className="mt-4 max-w-[470px] text-[16px] leading-relaxed text-[var(--nimi-text-muted)]">
                  {hasChildren
                    ? i18nText('Timeline.welcome.hero.withChildrenDescription')
                    : i18nText('Timeline.welcome.hero.emptyDescription')}
                </p>

                {hasChildren ? (
                  <div className="mt-8 flex flex-wrap gap-3">
                    {children.map((child) => {
                      const age = computeAgeMonths(child.birthDate);
                      const years = Math.floor(age / 12);
                      const months = age % 12;
                      const ageLabel = age < 12
                        ? i18nText('Common.age.months', { months: age })
                        : months > 0 ? i18nText('Common.age.yearsMonths', { years, months }) : i18nText('Common.age.years', { years });
                      return (
                        <button
                          key={child.childId}
                          type="button"
                          onClick={() => setActiveChildId(child.childId)}
                          className="group flex items-center gap-3 rounded-full border border-[var(--nimi-material-glass-thin-border)] bg-[var(--nimi-surface-card)] py-2 pl-2.5 pr-5 text-left text-[var(--nimi-text-primary)] shadow-[var(--nimi-elevation-base)] transition-all duration-[var(--nimi-motion-fast)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--nimi-action-primary-bg)_30%,var(--nimi-material-glass-thin-border))]"
                        >
                          <ChildAvatar child={child} ageMonths={age} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          <span>
                            <span className="block text-[14px] font-semibold">{child.displayName}</span>
                            <span className="block text-[13px] text-[var(--nimi-text-muted)]">{ageLabel}</span>
                          </span>
                        </button>
                      );
                    })}
                    <Link
                      to="/settings/children"
                      state={{ intent: 'add-child' }}
                      className={cn(buttonVariants({ tone: 'ghost', size: 'sm' }), 'gap-2 border border-dashed border-[var(--nimi-border-strong)] px-5')}
                    >
                      <Plus size={16} />
                      {i18nText('Timeline.welcome.addChild')}
                    </Link>
                  </div>
                ) : (
                  <Link
                    to="/settings/children"
                    state={{ intent: 'add-child' }}
                    className={cn(buttonVariants({ tone: 'primary', size: 'lg' }), 'mt-8 gap-2 px-7 py-3.5 text-[16px]')}
                  >
                    {i18nText('Timeline.welcome.createProfile')}
                    <ArrowRight size={18} />
                  </Link>
                )}
              </div>

              <ProductSystemVisual />
            </div>
          </Surface>

          <section>
            <h2 className="mb-5 text-[18px] font-semibold text-[var(--nimi-text-primary)]">
              {i18nText('Timeline.welcome.companionTitle')}
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
              {BENTO.map((item) => {
                const Icon = item.icon;
                return (
                  <Surface
                    as="div"
                    key={item.titleKey}
                    material="glass-regular"
                    padding="none"
                    tone="card"
                    className="group p-6 transition-transform duration-[var(--nimi-motion-fast)] hover:-translate-y-0.5 lg:p-7"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center parentos-radius-lg bg-[var(--nimi-surface-card)] text-[var(--nimi-action-primary-bg)] shadow-[var(--nimi-elevation-base)]">
                      <Icon size={22} strokeWidth={1.8} />
                    </div>
                    <h3 className="text-[18px] font-semibold text-[var(--nimi-text-primary)]">{i18nText(item.titleKey)}</h3>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--nimi-text-muted)]">{i18nText(item.descKey)}</p>
                  </Surface>
                );
              })}
            </div>
          </section>

          <footer className="mt-auto flex flex-wrap gap-3 pt-2">
            {TRUST.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.labelKey}
                  className="flex items-center gap-2 rounded-full border border-[var(--nimi-material-glass-thin-border)] bg-[var(--nimi-material-glass-thin-bg)] px-4 py-2 text-[14px] text-[var(--nimi-text-muted)]"
                >
                  <Icon size={15} strokeWidth={1.9} />
                  {i18nText(item.labelKey)}
                </div>
              );
            })}
          </footer>
        </div>
      </div>
    </AmbientBackground>
  );
}

function WelcomeIntro({ onSkip }: { onSkip: () => void }) {
  return (
    <section
      data-testid="parentos-welcome-intro"
      className="parentos-welcome-intro absolute inset-0 z-20 overflow-hidden"
      aria-label={i18nText('Timeline.welcome.intro.ariaLabel')}
    >
      <button
        type="button"
        data-testid="parentos-welcome-intro-skip"
        onClick={onSkip}
        className={cn(
          buttonVariants({ tone: 'ghost', size: 'sm' }),
          'absolute right-6 top-6 z-30 min-h-0 rounded-full px-4 py-2 text-[13px] text-[var(--nimi-text-muted)]',
        )}
      >
        {i18nText('Timeline.welcome.intro.skip')}
      </button>

      <div className="parentos-welcome-intro-stage">
        <p className="parentos-welcome-intro-line">{i18nText('Timeline.welcome.intro.line')}</p>

        <div className="parentos-welcome-brand-lockup">
          <p>ParentOS</p>
          <h1>{i18nText('Timeline.welcome.brandName')}</h1>
          <span>{i18nText('Timeline.welcome.brandTagline')}</span>
        </div>
      </div>
    </section>
  );
}

function ProductSystemVisual() {
  return (
    <div className="parentos-product-system" aria-hidden="true">
      <div className="parentos-product-system-grid" />
      <div className="parentos-product-system-axis parentos-product-system-axis-a" />
      <div className="parentos-product-system-axis parentos-product-system-axis-b" />

      <div className="parentos-product-system-core">
        <span>ParentOS</span>
        <strong>{i18nText('Timeline.welcome.brandName')}</strong>
      </div>

      <SystemNode className="parentos-system-node-profile" label={i18nText('Timeline.welcome.systemNode.profile')} value="PROFILE" />
      <SystemNode className="parentos-system-node-journal" label={i18nText('Timeline.welcome.systemNode.journal')} value="JOURNAL" />
      <SystemNode className="parentos-system-node-reminder" label={i18nText('Timeline.welcome.systemNode.reminder')} value="RULES" />
      <SystemNode className="parentos-system-node-advisor" label={i18nText('Timeline.welcome.systemNode.advisor')} value="ADVISOR" />
    </div>
  );
}

function SystemNode({ className, label, value }: { className: string; label: string; value: string }) {
  return (
    <div className={cn('parentos-system-node', className)}>
      <span>{value}</span>
      <strong>{label}</strong>
    </div>
  );
}
