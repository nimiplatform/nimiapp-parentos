// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisionGuide } from './vision-guide.js';
import { i18nText } from '../../i18n/index.js';

describe('VisionGuide', () => {
  it('renders the hero illustration in the step header', () => {
    const { container } = render(<VisionGuide onClose={() => undefined} />);

    const hero = container.querySelector('img[src*="vision-guide-hero"]');
    expect(hero).not.toBeNull();
    expect(hero?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(i18nText('Vision.guide.steps.refraction.title'))).toBeTruthy();
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    render(<VisionGuide onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: i18nText('Vision.guide.closeAria') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
