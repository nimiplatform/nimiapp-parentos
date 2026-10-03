import type { ReactNode } from 'react';
import { ParentosAiMascotStatic } from '../profile/parentos-ai-mascot-button.js';

/**
 * The advisor's face is the same glass-orb mascot as the profile "AI 分析" card,
 * so the advisor reads as one persona across the app. Hero sizes float over a
 * mint / sky / violet aura with a ground shadow (styles.css `advisor-hero-*`).
 */
export function AdvisorHeroMascot({ size = 104 }: { size?: number }) {
  return (
    <span className="advisor-hero-mascot" style={{ width: size, height: size }}>
      <ParentosAiMascotStatic size={size} />
    </span>
  );
}

export type AdvisorAvatarState = 'idle' | 'thinking' | 'still';

/** Assistant avatar in the transcript; only the newest reply keeps the idle motion. */
export function AdvisorAvatar({ state = 'idle' }: { state?: AdvisorAvatarState }) {
  return (
    <span className="advisor-avatar">
      <ParentosAiMascotStatic size={34} thinking={state === 'thinking'} still={state === 'still'} />
    </span>
  );
}

export type AdvisorHeroProps = {
  title: string;
  description: string;
  action?: ReactNode;
  hint?: string;
};

/** Centered mascot-led state for the right panel when no conversation is open. */
export function AdvisorHero({ title, description, action, hint }: AdvisorHeroProps) {
  return (
    // my-auto rather than justify-center: centered while it fits, scrollable (not clipped) when it doesn't.
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 pb-[7vh] pt-10">
      <div className="my-auto flex flex-col items-center text-center">
        <AdvisorHeroMascot />
        <h2 className="mt-11 text-[24px] font-bold leading-snug tracking-tight text-[var(--nimi-text-primary)]">
          {title}
        </h2>
        <p className="mt-3 max-w-[340px] break-keep break-words text-balance text-[14px] leading-[1.75] text-[var(--nimi-text-secondary)]">
          {description}
        </p>
        {action ? <div className="mt-8">{action}</div> : null}
        {hint ? (
          <p className="mt-3 text-[12px] leading-5 text-[var(--nimi-text-muted)]">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
