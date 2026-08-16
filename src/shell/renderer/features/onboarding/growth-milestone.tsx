import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@nimiplatform/kit/ui';

export type GrowthMilestoneTint = 'blue' | 'teal' | 'violet';

type GrowthMilestoneProps = {
  icon: ComponentType<LucideProps>;
  label: string;
  tint: GrowthMilestoneTint;
  /** Absolute placement inside the journey visual, e.g. 'left-[4%] top-[14%]'. */
  positionClassName: string;
  /** Stagger for the one-shot entry animation. */
  enterDelayMs: number;
  /** Phase offset for the slow ambient float loop. */
  floatDelayMs: number;
};

/**
 * One lightweight floating node on the growth trajectory — an icon chip plus
 * a short label. Deliberately not a card: it reads as a point of interest on
 * the path, not a feature menu entry.
 */
export function GrowthMilestone({
  icon: Icon,
  label,
  tint,
  positionClassName,
  enterDelayMs,
  floatDelayMs,
}: GrowthMilestoneProps) {
  return (
    <div
      className={cn('parentos-onboarding-tag-enter absolute z-20', positionClassName)}
      style={{ animationDelay: `${enterDelayMs}ms` }}
    >
      <div
        className="parentos-onboarding-tag parentos-onboarding-tag-float"
        style={{ animationDelay: `${floatDelayMs}ms` }}
      >
        <span className={`parentos-onboarding-tag-icon parentos-onboarding-tag-icon--${tint}`}>
          <Icon size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="parentos-onboarding-tag-label">{label}</span>
      </div>
    </div>
  );
}
