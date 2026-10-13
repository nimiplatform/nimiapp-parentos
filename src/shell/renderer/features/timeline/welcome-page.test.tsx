// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { TestNavigation } from '../../testing/navigation.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../app-shell/app-store.js';
import { WelcomePage } from './welcome-page.js';

describe('WelcomePage', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeChildId: null,
      children: [],
    });
  });

  afterEach(() => {
    useAppStore.setState({
      activeChildId: null,
      children: [],
    });
  });

  it('shows the onboarding empty state when no child profile exists', () => {
    render(
      <TestNavigation>
        <WelcomePage />
      </TestNavigation>,
    );

    expect(screen.getByTestId('parentos-onboarding-page')).toBeTruthy();
    expect(screen.getByRole('button', { name: '建立宝贝档案' })).toBeTruthy();
  });
});
