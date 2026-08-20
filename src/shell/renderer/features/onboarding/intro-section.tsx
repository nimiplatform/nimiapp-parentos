import { BellRing, ChartNoAxesCombined, Heart, ShieldCheck } from 'lucide-react';
import { i18nText } from '../../i18n/index.js';

const FEATURES = [
  {
    key: 'reminder',
    icon: ShieldCheck,
    iconClassName: 'bg-[#e8efff] text-[#4f7cf3]',
  },
  {
    key: 'evidence',
    icon: ChartNoAxesCombined,
    iconClassName: 'bg-[#eee9ff] text-[#8b6cf7]',
  },
  {
    key: 'journal',
    icon: Heart,
    iconClassName: 'bg-[#ddf7f8] text-[#24b8bc]',
  },
  {
    key: 'personalized',
    icon: BellRing,
    iconClassName: 'bg-[#eee9ff] text-[#8b6cf7]',
  },
] as const;

export function IntroSection() {
  return (
    <div>
      <h2 className="text-[32px] font-bold leading-[1.3] tracking-[-0.01em] text-[var(--nimi-text-primary)] xl:text-[40px]">
        {i18nText('Onboarding.title.line1')}
        <br />
        {i18nText('Onboarding.title.line2')}
      </h2>
      <p className="mt-5 max-w-[430px] text-[15px] leading-relaxed text-[var(--nimi-text-secondary)] [text-wrap:balance]">
        {i18nText('Onboarding.description')}
      </p>
      <ul className="mt-7 space-y-4" aria-label={i18nText('Onboarding.features.ariaLabel')}>
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.key} className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${feature.iconClassName}`}
              >
                <Icon size={18} strokeWidth={2.1} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[14px] font-semibold leading-5 text-[var(--nimi-text-primary)]">
                  {i18nText(`Onboarding.features.${feature.key}.title`)}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-[var(--nimi-text-secondary)]">
                  {i18nText(`Onboarding.features.${feature.key}.description`)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
