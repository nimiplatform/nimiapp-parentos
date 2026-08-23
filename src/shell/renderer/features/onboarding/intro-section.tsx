import { BellRing, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import { i18nText } from '../../i18n/index.js';

// Tints mirror the floating growth tags (.parentos-onboarding-tag-icon--*):
// blue / violet / teal, with blue repeated to balance the palette.
const FEATURES = [
  {
    key: 'reminder',
    icon: BellRing,
    iconClassName: 'bg-[rgba(62,143,229,0.12)] text-[#3b82e0]',
  },
  {
    key: 'evidence',
    icon: ShieldCheck,
    iconClassName: 'bg-[rgba(139,124,246,0.12)] text-[#7c6ff0]',
  },
  {
    key: 'journal',
    icon: Heart,
    iconClassName: 'bg-[rgba(69,184,214,0.14)] text-[#2aa79b]',
  },
  {
    key: 'personalized',
    icon: Sparkles,
    iconClassName: 'bg-[rgba(62,143,229,0.12)] text-[#3b82e0]',
  },
] as const;

export function IntroSection() {
  return (
    <div>
      <h2 className="text-[30px] font-bold leading-[1.25] tracking-[-0.01em] text-[var(--nimi-text-primary)] xl:text-[38px]">
        {i18nText('Onboarding.title.line1')}
        <br />
        <span className="bg-gradient-to-r from-[#3e8fe5] to-[#7d7df2] bg-clip-text text-transparent">
          {i18nText('Onboarding.title.line2')}
        </span>
      </h2>
      <p className="mt-4 max-w-[430px] text-[15px] leading-relaxed text-[var(--nimi-text-secondary)] [text-wrap:balance]">
        {i18nText('Onboarding.description')}
      </p>
      <ul className="mt-8 space-y-[18px]" aria-label={i18nText('Onboarding.features.ariaLabel')}>
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.key} className="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${feature.iconClassName}`}
              >
                <Icon size={16} strokeWidth={2.1} />
              </span>
              <div className="min-w-0">
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
