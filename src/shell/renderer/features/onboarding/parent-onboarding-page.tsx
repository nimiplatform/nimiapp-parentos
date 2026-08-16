import { useNavigate } from 'react-router-dom';
import { BrandHeader } from './brand-header.js';
import { CreateChildButton } from './create-child-button.js';
import { GrowthJourney } from './growth-journey.js';
import { IntroSection } from './intro-section.js';

/**
 * First-launch empty state shown when the family has no child profile yet.
 * The whole page exists to funnel into one action: 建立宝贝档案.
 */
export function ParentOnboardingPage() {
  const navigate = useNavigate();

  // Connects to the existing create-child flow: the children settings page
  // opens its profile form directly when navigated with intent 'add-child'.
  const handleCreateChild = () => {
    navigate('/settings/children', { state: { intent: 'add-child' } });
  };

  return (
    <div
      data-testid="parentos-onboarding-page"
      className="relative h-full overflow-y-auto overflow-x-hidden"
    >
      <div aria-hidden="true" className="parentos-onboarding-ambient" />
      <div className="relative z-10 mx-auto flex min-h-full w-[86%] max-w-[1440px] flex-col">
        <header className="shrink-0 pb-4 pt-7">
          <BrandHeader />
        </header>
        <div className="grid flex-1 items-center gap-10 pb-12 lg:grid-cols-[2fr_3fr] lg:gap-4">
          <div className="parentos-onboarding-enter-left max-w-[480px] lg:justify-self-end">
            <IntroSection />
            <div className="mt-9">
              <CreateChildButton onCreateChild={handleCreateChild} />
            </div>
          </div>
          <GrowthJourney />
        </div>
      </div>
    </div>
  );
}
