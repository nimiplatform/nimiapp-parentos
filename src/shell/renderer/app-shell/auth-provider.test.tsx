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
  ParentOSLaunchPage: ({ onEnter }: { onEnter: () => void }) => (
    <button type="button" onClick={onEnter}>LAUNCH_SCREEN</button>
  ),
}));

import { AuthProvider } from './auth-provider.js';

describe('AuthProvider app-owned data bootstrap', () => {
  beforeEach(() => {
    runParentOSBootstrapMock.mockClear();
    useAppStore.setState({
      auth: { status: 'bootstrapping', user: null },
      bootstrapReady: false,
      bootstrapError: null,
      bootstrapFailure: null,
      familyId: null,
      children: [],
      activeChildId: null,
      aiConfig: null,
    });
  });

  it('renders an accessible loading state while bootstrap is pending', () => {
    render(<AuthProvider><div>APP_CONTENT</div></AuthProvider>);

    expect(screen.getByTestId('parentos-bootstrap-loading')).toBeTruthy();
    expect(screen.queryByText('APP_CONTENT')).toBeNull();
  });

  it.each([
    'app-data-unavailable',
    'app-data-repair-required',
  ] as const)('renders the %s state without opening local product data', (state) => {
    useAppStore.setState({
      auth: { status: 'unauthenticated', user: null },
      bootstrapFailure: {
        state,
        reasonCode: `test-${state}`,
        actionHint: `act-${state}`,
        message: `message-${state}`,
      },
      bootstrapError: `message-${state}`,
    });

    render(<AuthProvider><div>APP_CONTENT</div></AuthProvider>);

    const failure = screen.getByTestId('parentos-bootstrap-failure');
    expect(failure.getAttribute('data-bootstrap-state')).toBe(state);
    expect(screen.getByRole('alert').textContent).toContain(`test-${state}`);
    expect((screen.getByTestId('parentos-app-data-locked') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('APP_CONTENT')).toBeNull();
  });

  it('retries app-data bootstrap without claiming success', () => {
    useAppStore.setState({
      auth: { status: 'unauthenticated', user: null },
      bootstrapFailure: {
        state: 'app-data-unavailable',
        reasonCode: 'parentos-electron-sidecar-binary-unavailable',
        actionHint: 'build_parentos_host_sidecar_before_launching_electron',
        message: 'ParentOS app data unavailable',
      },
      bootstrapError: 'ParentOS app data unavailable',
    });

    render(<AuthProvider><div>APP_CONTENT</div></AuthProvider>);
    fireEvent.click(screen.getByTestId('parentos-bootstrap-retry'));

    expect(runParentOSBootstrapMock).toHaveBeenLastCalledWith({ force: true });
  });

  it('opens the launch screen after app-owned local data is ready without Nimi login', () => {
    useAppStore.setState({
      bootstrapReady: true,
      bootstrapFailure: null,
      auth: { status: 'unauthenticated', user: null },
    });

    render(<AuthProvider><div>APP_CONTENT</div></AuthProvider>);
    expect(screen.getByText('LAUNCH_SCREEN')).toBeTruthy();
    fireEvent.click(screen.getByText('LAUNCH_SCREEN'));
    expect(screen.getByText('APP_CONTENT')).toBeTruthy();
  });
});
