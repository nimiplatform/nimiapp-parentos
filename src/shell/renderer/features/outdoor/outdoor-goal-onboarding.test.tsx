// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestNavigation, NavigationProbe } from '../../testing/navigation.js';
import { describe, expect, it, vi } from 'vitest';
import type { ChildProfile } from '../../app-shell/app-store.js';
import { OutdoorGoalHero, OutdoorGoalIntro } from './outdoor-goal-onboarding.js';
import { i18nText } from '../../i18n/index.js';

function renderOnboarding(gender: ChildProfile['gender'] = 'male', onSetGoal = vi.fn()) {
  const view = render(
    <TestNavigation>
      <OutdoorGoalHero gender={gender}>
        <OutdoorGoalIntro onSetGoal={onSetGoal} />
      </OutdoorGoalHero>
    <NavigationProbe /></TestNavigation>,
  );
  return { ...view, onSetGoal };
}

describe('OutdoorGoalHero + OutdoorGoalIntro', () => {
  it('renders the hero illustration as decoration behind the guide copy', async () => {
    const { container } = renderOnboarding();

    const hero = container.querySelector('img[src*="outdoor-goal-hero"]');
    expect(hero).not.toBeNull();
    expect(hero?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('heading', { name: i18nText('Outdoor.page.goalOnboarding.title') })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: i18nText('Outdoor.page.backToProfile') }));
    await waitFor(() => expect(screen.getByTestId('navigation-probe').textContent).toContain('/profile'));
  });

  it.each([
    ['female', 'outdoor-goal-hero-girl'],
    ['male', 'outdoor-goal-hero-boy'],
  ] as const)('draws the %s child with the matching illustration', (gender, artName) => {
    const { container } = renderOnboarding(gender);

    const hero = container.querySelector<HTMLImageElement>('img.parentos-outdoor-hero__art');
    expect(hero?.getAttribute('src')).toContain(artName);
    expect(hero?.style.getPropertyValue('--parentos-outdoor-art-aspect')).not.toBe('');
    expect(hero?.style.getPropertyValue('--parentos-outdoor-art-shoe')).not.toBe('');
  });

  it('starts goal setup from the primary action', async () => {
    const { onSetGoal } = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: i18nText('Outdoor.page.goalOnboarding.setGoal') }));
    expect(onSetGoal).toHaveBeenCalledTimes(1);
  });

  it('keeps the same illustration element when its content changes step', async () => {
    const { container, rerender } = renderOnboarding();
    const art = container.querySelector('img.parentos-outdoor-hero__art');

    rerender(
      <TestNavigation>
        <OutdoorGoalHero gender="male">
          <p>step two</p>
        </OutdoorGoalHero>
      <NavigationProbe /></TestNavigation>,
    );

    expect(screen.getByText('step two')).toBeTruthy();
    expect(container.querySelector('img.parentos-outdoor-hero__art')).toBe(art);
  });
});
