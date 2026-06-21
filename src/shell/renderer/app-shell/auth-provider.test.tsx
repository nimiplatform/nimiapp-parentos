// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './app-store.js';

const { runParentOSBootstrapMock } = vi.hoisted(() => ({
  runParentOSBootstrapMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../infra/parentos-bootstrap.js', () => ({
  runParentOSBootstrap: runParentOSBootstrapMock,
}));

vi.mock('../features/auth/parentos-login-page.js', () => ({
  ParentOSLoginPage: () => <div>LOGIN_PAGE</div>,
  ParentOSLaunchPage: ({ onEnter }: { onEnter: () => void }) => (
    <button type="button" onClick={onEnter}>LAUNCH_SCREEN</button>
  ),
}));

import { AuthProvider } from './auth-provider.js';

describe('AuthProvider', () => {
  beforeEach(() => {
    runParentOSBootstrapMock.mockClear();
    useAppStore.setState({
      auth: { status: 'bootstrapping', user: null },
      bootstrapReady: false,
      bootstrapError: null,
      runtimeDefaults: null,
      familyId: null,
      children: [],
      activeChildId: null,
      aiConfig: null,
    });
  });

  it('keeps the bootstrap loading state above AmbientBackground layers', () => {
    render(
      <AuthProvider>
        <div>APP_CONTENT</div>
      </AuthProvider>,
    );

    const loading = screen.getByTestId('parentos-bootstrap-loading');
    expect(loading.className).toContain('relative');
    expect(loading.className).toContain('z-10');
  });

  it('keeps bootstrap failures visible above AmbientBackground layers', () => {
    useAppStore.setState({
      bootstrapError: "Cannot read properties of undefined (reading 'invoke')",
    });

    render(
      <AuthProvider>
        <div>APP_CONTENT</div>
      </AuthProvider>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("Cannot read properties of undefined (reading 'invoke')");
    expect(alert.className).toContain('relative');
    expect(alert.className).toContain('z-10');
  });

  it('shows the launch screen before authenticated shell content and enters on logo click', () => {
    useAppStore.setState({
      bootstrapReady: true,
      auth: {
        status: 'authenticated',
        user: { id: 'parent-1', displayName: 'Parent' },
      },
    });

    render(
      <AuthProvider>
        <div>APP_CONTENT</div>
      </AuthProvider>,
    );

    expect(screen.getByText('LAUNCH_SCREEN')).toBeTruthy();
    expect(screen.queryByText('APP_CONTENT')).toBeNull();

    fireEvent.click(screen.getByText('LAUNCH_SCREEN'));

    expect(screen.getByText('APP_CONTENT')).toBeTruthy();
  });
});
