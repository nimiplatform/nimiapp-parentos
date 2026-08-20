import growthJourneyUrl from './assets/growth-journey.webp';

/**
 * Growth-stage illustration (infant → toddler → school-age → teen) on a
 * transparent plate. All text, tags and trajectory visuals live in UI layers
 * around it, so the asset can be swapped without touching copy or layout.
 */
export function GrowthCharacters() {
  return (
    <img
      src={growthJourneyUrl}
      alt=""
      aria-hidden="true"
      data-testid="parentos-onboarding-growth-journey"
      draggable={false}
      fetchPriority="high"
      className="relative z-10 h-auto w-full select-none object-contain"
    />
  );
}
