import { i18nText } from '../../i18n/index.js';

export function IntroSection() {
  return (
    <div>
      <h2 className="text-[32px] font-bold leading-[1.3] tracking-[-0.01em] text-[var(--nimi-text-primary)] xl:text-[40px]">
        {i18nText('Onboarding.title.line1')}
        <br />
        {i18nText('Onboarding.title.line2')}
      </h2>
      <p className="mt-5 max-w-[430px] text-[15px] leading-relaxed text-[var(--nimi-text-secondary)] [text-wrap:balance]">
        {i18nText('Onboarding.subtitle')}
      </p>
      <p className="mt-2.5 text-[13px] text-[var(--nimi-text-muted)]">
        {i18nText('Onboarding.tagline')}
      </p>
    </div>
  );
}
