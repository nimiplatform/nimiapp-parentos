import { Link } from 'react-router-dom';
import { Landmark, Plus } from 'lucide-react';
import { AmbientBackground, buttonVariants, cn } from '@nimiplatform/kit/ui';
import { useAppStore, computeAgeMonths } from '../../app-shell/app-store.js';
import { ChildAvatar } from '../../shared/child-avatar.js';
import { i18nText } from '../../i18n/index.js';
import { ParentOnboardingPage } from '../onboarding/parent-onboarding-page.js';
import welcomeHeroKids from './assets/welcome-hero-kids.png';

interface StepSpec {
  titleKey: string;
  descKey: string;
}

const STEPS: readonly StepSpec[] = [
  {
    titleKey: 'Timeline.welcome.step.createProfile.title',
    descKey: 'Timeline.welcome.step.createProfile.description',
  },
  {
    titleKey: 'Timeline.welcome.step.record.title',
    descKey: 'Timeline.welcome.step.record.description',
  },
  {
    titleKey: 'Timeline.welcome.step.remind.title',
    descKey: 'Timeline.welcome.step.remind.description',
  },
] as const;

/* ── component ───────────────────────────────────────────── */

export function WelcomePage() {
  const children = useAppStore((s) => s.children);
  const setActiveChildId = useAppStore((s) => s.setActiveChildId);
  const hasChildren = children.length > 0;

  if (!hasChildren) {
    return <ParentOnboardingPage />;
  }

  return (
    <AmbientBackground variant="mesh" className="relative flex h-full overflow-hidden">
      <div
        data-testid="parentos-welcome-page"
        className="relative min-w-0 flex-1 overflow-y-auto px-5 pb-8 pt-6 sm:px-8 lg:px-[60px] lg:pb-10 lg:pt-10"
      >
        <div className="flex min-h-full flex-col gap-6">
          <section
            className="relative overflow-hidden p-6 sm:p-8 lg:p-12 xl:min-h-[400px] min-[1700px]:min-h-[460px]"
          >
            <img
              src={welcomeHeroKids}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 z-0 hidden h-full w-auto select-none [mask-image:linear-gradient(to_right,transparent,black_10%)] xl:block"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-[660px] xl:block"
              style={{
                background:
                  'linear-gradient(100deg, color-mix(in srgb, var(--nimi-surface-card) 88%, transparent) 0%, color-mix(in srgb, var(--nimi-surface-card) 88%, transparent) 380px, color-mix(in srgb, var(--nimi-surface-card) 55%, transparent) 500px, transparent 640px)',
              }}
            />
            <div className="relative z-10 flex flex-col gap-10 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-[520px]">
                <h2 className="text-[28px] font-semibold leading-snug text-[var(--nimi-text-primary)] sm:text-[34px]">
                  {i18nText('Timeline.welcome.hero.withChildrenTitle')}
                </h2>
                <p className="mt-3 max-w-[440px] text-[15px] leading-relaxed text-[var(--nimi-text-muted)]">
                  {i18nText('Timeline.welcome.hero.withChildrenDescription')}
                </p>

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
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-[16px] font-semibold text-[var(--nimi-text-primary)]">
              {i18nText('Timeline.welcome.stepsTitle')}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
              {STEPS.map((step, index) => (
                <div
                  key={step.titleKey}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-card)] px-4 py-3.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--nimi-action-primary-bg)] text-[12px] font-bold text-[var(--nimi-text-inverse)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--nimi-text-primary)]">{i18nText(step.titleKey)}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--nimi-text-muted)]">{i18nText(step.descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <footer className="mt-auto flex flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-2 rounded-full border border-[var(--nimi-material-glass-thin-border)] bg-[var(--nimi-material-glass-thin-bg)] px-4 py-2 text-[13px] text-[var(--nimi-text-muted)]">
              <Landmark size={14} strokeWidth={1.9} />
              {i18nText('Timeline.welcome.trust.standards')}
            </div>
          </footer>
        </div>
      </div>
    </AmbientBackground>
  );
}
