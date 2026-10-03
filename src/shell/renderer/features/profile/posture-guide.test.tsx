// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostureGuide } from './posture-guide.js';
import { i18nText } from '../../i18n/index.js';

describe('PostureGuide', () => {
  it('renders the banner illustration behind the step header', () => {
    const { container } = render(<PostureGuide onClose={() => undefined} />);

    const hero = container.querySelector('img[src*="posture-guide-hero"]');
    expect(hero).not.toBeNull();
    expect(hero?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(i18nText('PostureGuide.steps.why.title'))).toBeTruthy();
  });

  it('gives the observe, Cobb and foot-arch steps their own art', () => {
    const { container } = render(<PostureGuide onClose={() => undefined} />);
    const next = () => fireEvent.click(screen.getByRole('button', { name: i18nText('PostureGuide.ui.next') }));
    const heroSrc = () => container.querySelector('img')?.getAttribute('src') ?? '';

    next();
    expect(screen.getByText(i18nText('PostureGuide.steps.observe.title'))).toBeTruthy();
    expect(heroSrc()).toContain('posture-guide-observe-hero');

    next();
    expect(screen.getByText(i18nText('PostureGuide.steps.cobb.title'))).toBeTruthy();
    expect(heroSrc()).toContain('posture-guide-cobb-hero');

    next();
    expect(screen.getByText(i18nText('PostureGuide.steps.footArch.title'))).toBeTruthy();
    expect(heroSrc()).toContain('posture-guide-foot-arch-hero');

    next();
    expect(screen.getByText(i18nText('PostureGuide.steps.care.title'))).toBeTruthy();
    expect(heroSrc()).toContain('posture-guide-hero');
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    render(<PostureGuide onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: i18nText('PostureGuide.ui.close') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
