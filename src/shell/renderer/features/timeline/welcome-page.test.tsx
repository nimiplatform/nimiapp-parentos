// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

  it('shows the empty-profile action immediately without an intro screen', () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '建立宝贝专属档案' })).toBeTruthy();
    expect(screen.getByTestId('parentos-welcome-page')).toBeTruthy();
    expect(screen.queryByTestId('parentos-welcome-intro')).toBeNull();
  });
});
