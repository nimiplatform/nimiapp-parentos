import type { CSSProperties } from 'react';
import type { ChildProfile } from '../../app-shell/app-store.js';
import { i18nText } from '../../i18n/index.js';
import { HERO_ACCENT_TEXT, outdoorHeroArt } from './outdoor-goal-onboarding.js';

/**
 * The goal guide's illustration as the weekly tracker's corner scene. From
 * 60rem it fills the top of the side column: the art bleeds up to the page's
 * top edge and out to its right edge, feathers into the sky on the left, and
 * melts under the trend card just below the children's feet, with a
 * handwritten aside in the sky. Narrower layouts show it as a feathered banner
 * under the week's numbers. Geometry lives in `.parentos-outdoor-scene` in
 * styles.css.
 */
export function OutdoorWeekScene({ gender, className = '' }: {
  gender: ChildProfile['gender'];
  className?: string;
}) {
  const art = outdoorHeroArt(gender);

  return (
    <div aria-hidden="true" className={`parentos-outdoor-scene pointer-events-none ${className}`}>
      <div className="parentos-outdoor-scene__frame">
        <img
          src={art.src}
          alt=""
          draggable={false}
          className="parentos-outdoor-scene__art select-none"
          style={{ '--parentos-outdoor-art-ground': art.groundAt } as CSSProperties}
        />
      </div>

      <div className={`parentos-outdoor-scene__note -rotate-[9deg] text-[21px] min-[72rem]:text-[24px] ${HERO_ACCENT_TEXT}`}>
        {/* zh copy carries a phrase-aware line break; pre-line keeps it. */}
        <p className="parentos-handwriting whitespace-pre-line pl-[0.9em] -indent-[0.9em] leading-[1.45]">
          {i18nText('Outdoor.page.tracker.sceneNote')}
        </p>
        <svg
          viewBox="0 0 96 22"
          className="-mt-0.5 ml-[4.4em] h-[0.9em] w-[4em] opacity-80"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19C30 15 60 9 93 3" />
          <path d="M4 19l5.5 1.4" />
        </svg>
      </div>
    </div>
  );
}
