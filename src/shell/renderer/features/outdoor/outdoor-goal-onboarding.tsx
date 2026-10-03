import { Button } from '@nimiplatform/kit/ui';
import { ArrowRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ChildProfile } from '../../app-shell/app-store.js';
import { i18nText } from '../../i18n/index.js';
import heroBoyUrl from './assets/outdoor-goal-hero-boy.webp';
import heroGirlUrl from './assets/outdoor-goal-hero-girl.webp';

// Accent for the eyebrow and handwritten note: the brand blue pulled slightly
// toward the text color so small type holds up on the pale veil.
export const HERO_ACCENT_TEXT = 'text-[color-mix(in_srgb,var(--nimi-action-primary-bg)_84%,var(--nimi-text-primary))]';

// Pill CTA shared by the guide and the goal picker.
export const HERO_CTA_CLASS = 'min-h-11 gap-3 rounded-full px-6 text-[15px] font-medium shadow-[0_10px_24px_-12px_color-mix(in_srgb,var(--nimi-action-primary-bg)_80%,transparent)]';

// Per-art inputs to the `.parentos-outdoor-hero__art` and
// `.parentos-outdoor-scene__art` geometry: pixel aspect ratio, how far across
// the art the child's trailing shoe sits (the part that must stay clear of the
// copy column), and how far down the art the lowest paw or sole reaches.
const HERO_ART = {
  boy: { src: heroBoyUrl, aspect: 1536 / 1024, shoeAt: 757 / 1536, groundAt: 848 / 1024 },
  girl: { src: heroGirlUrl, aspect: 1448 / 1086, shoeAt: 716 / 1448, groundAt: 810 / 1086 },
} as const;

/** The outdoor illustration drawn for this child; the weekly tracker reuses it. */
export function outdoorHeroArt(gender: ChildProfile['gender']) {
  return gender === 'female' ? HERO_ART.girl : HERO_ART.boy;
}

/**
 * Illustrated page for the weekly outdoor goal, drawn with a girl or boy to
 * match the child. The first-run guide and the goal picker both render inside
 * it, so moving from one to the other keeps the art in place. From 60rem the
 * art bleeds behind the copy column (geometry lives in `.parentos-outdoor-hero`
 * in styles.css); narrower layouts stack it below.
 */
export function OutdoorGoalHero({ gender, children }: {
  gender: ChildProfile['gender'];
  children: ReactNode;
}) {
  const art = outdoorHeroArt(gender);

  return (
    <section className="parentos-outdoor-hero relative isolate flex min-h-full flex-col overflow-hidden min-[60rem]:h-full">
      <img
        src={art.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="parentos-outdoor-hero__art pointer-events-none select-none"
        style={{
          '--parentos-outdoor-art-aspect': art.aspect,
          '--parentos-outdoor-art-shoe': art.shoeAt,
        } as CSSProperties}
      />
      <div aria-hidden="true" className="parentos-outdoor-hero__veil pointer-events-none" />

      <div className="relative z-10 flex flex-1 flex-col px-5 pt-[72px] sm:px-10 min-[60rem]:h-full min-[60rem]:overflow-y-auto min-[60rem]:pb-6 min-[60rem]:pl-20 min-[60rem]:pr-0 xl:pl-24">
        <Link
          to="/profile"
          className="self-start text-[14px] text-[var(--nimi-text-muted)] hover:underline"
        >
          {i18nText('Outdoor.page.backToProfile')}
        </Link>

        {/* my-auto rather than justify-center: centers when there is room,
            yet stays scrollable from the top when the copy overflows. */}
        <div className="my-auto flex shrink-0 flex-col py-10">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Handwritten aside in the hero's copy column, with an arrow toward the art. */
export function OutdoorHeroNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-fit -rotate-[10deg] ${HERO_ACCENT_TEXT} ${className}`}>
      {/* zh copy carries a phrase-aware line break; pre-line keeps it. */}
      <p className="parentos-handwriting whitespace-pre-line pl-[0.7em] -indent-[0.7em] text-[17px] leading-[1.5]">
        {children}
      </p>
      <svg
        aria-hidden="true"
        viewBox="0 0 88 34"
        className="ml-6 mt-1 h-[30px] w-[80px] opacity-75"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M84 4C64 19 36 28 7 28" />
        <path d="M15 21.5 7 28l9.5 3.5" />
      </svg>
    </div>
  );
}

/** First-run guide shown while the child has no weekly outdoor goal. */
export function OutdoorGoalIntro({ onSetGoal }: { onSetGoal: () => void }) {
  return (
    <>
      <p className={`text-[12px] font-medium uppercase tracking-[0.1em] ${HERO_ACCENT_TEXT}`}>
        {i18nText('Outdoor.page.goalOnboarding.eyebrow')}
      </p>
      <h2 className="mt-3 text-[34px] font-bold leading-[1.15] tracking-normal text-[var(--nimi-text-primary)] sm:text-[40px]">
        {i18nText('Outdoor.page.goalOnboarding.title')}
      </h2>
      <p className="mt-3.5 whitespace-pre-line text-[18px] leading-[1.4] tracking-normal text-[color-mix(in_srgb,var(--nimi-text-primary)_84%,transparent)] sm:text-[19px]">
        {i18nText('Outdoor.page.goalOnboarding.tagline')}
      </p>
      {/* zh copy carries a phrase-aware line break; pre-line keeps it. */}
      <p className="mt-5 max-w-[21rem] whitespace-pre-line text-[14px] leading-[1.6] tracking-normal text-[var(--nimi-text-secondary)]">
        {i18nText('Outdoor.page.goalOnboarding.description')}
      </p>

      <Button
        tone="primary"
        size="lg"
        onClick={onSetGoal}
        trailingIcon={<ArrowRight size={18} strokeWidth={2} aria-hidden="true" />}
        className={`mt-7 self-start ${HERO_CTA_CLASS}`}
      >
        {i18nText('Outdoor.page.goalOnboarding.setGoal')}
      </Button>

      <OutdoorHeroNote className="mt-9 ml-3">
        {i18nText('Outdoor.page.goalOnboarding.note')}
      </OutdoorHeroNote>
    </>
  );
}
