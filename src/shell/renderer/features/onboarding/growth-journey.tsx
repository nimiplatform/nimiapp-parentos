import { Footprints, Heart, Sparkles, Stethoscope, Syringe } from 'lucide-react';
import { i18nText } from '../../i18n/index.js';
import { GrowthCharacters } from './growth-characters.js';
import { GrowthMilestone, type GrowthMilestoneTint } from './growth-milestone.js';
import { GrowthPath } from './growth-path.js';

type MilestoneSpec = {
  key: string;
  icon: typeof Syringe;
  tint: GrowthMilestoneTint;
  positionClassName: string;
};

const MILESTONES: readonly MilestoneSpec[] = [
  { key: 'vaccine', icon: Syringe, tint: 'blue', positionClassName: 'left-[0%] top-[13%]' },
  { key: 'checkup', icon: Stethoscope, tint: 'teal', positionClassName: 'right-[1%] top-[5%]' },
  { key: 'milestone', icon: Footprints, tint: 'violet', positionClassName: 'left-[6%] top-[44%]' },
  { key: 'sensitive', icon: Sparkles, tint: 'violet', positionClassName: 'right-[0%] top-[46%]' },
  { key: 'journal', icon: Heart, tint: 'blue', positionClassName: 'left-[36%] bottom-[1%]' },
] as const;

/**
 * Right-hand core visual: a child growing from infant to teen along a soft
 * upward trajectory, surrounded by a low-opacity ambient glow and a handful
 * of floating growth-focus tags.
 */
export function GrowthJourney() {
  return (
    <div className="parentos-onboarding-enter-visual relative mx-auto w-full max-w-[660px] lg:ml-0">
      <div aria-hidden="true" className="parentos-onboarding-glow" />
      <GrowthPath />
      <GrowthCharacters />
      {MILESTONES.map((milestone, index) => (
        <GrowthMilestone
          key={milestone.key}
          icon={milestone.icon}
          label={i18nText(`Onboarding.milestone.${milestone.key}`)}
          tint={milestone.tint}
          positionClassName={milestone.positionClassName}
          enterDelayMs={280 + index * 90}
          floatDelayMs={index * 1200}
        />
      ))}
    </div>
  );
}
