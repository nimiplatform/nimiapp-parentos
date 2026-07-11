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

describe('AuthProvider protected installed state', () => {
  beforeEach(() => {
    runParentOSBootstrapMock.mockClear();
    useAppStore.setState({
      auth: { status: 'bootstrapping', user: null },
      bootstrapReady: false,
      bootstrapError: null,
      bootstrapFailure: null,
      runtimeDefaults: null,
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
    'login-required',
    'runtime-unavailable',
    'permission-denied',
    'repair-required',
    'capability-unavailable',
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

    const failure = screen.getByTestId('parentos-protected-session-failure');
    expect(failure.getAttribute('data-protected-state')).toBe(state);
    expect(screen.getByRole('alert').textContent).toContain(`test-${state}`);
    expect((screen.getByTestId('parentos-local-data-locked') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('APP_CONTENT')).toBeNull();
  });

  it('retries the protected bootstrap without changing local state', () => {
    useAppStore.setState({
      auth: { status: 'unauthenticated', user: null },
      bootstrapFailure: {
        state: 'runtime-unavailable',
        reasonCode: 'runtime-service-unavailable',
        actionHint: 'start_verified_runtime_service',
        message: 'Runtime service unavailable',
      },
      bootstrapError: 'Runtime service unavailable',
    });

    render(<AuthProvider><div>APP_CONTENT</div></AuthProvider>);
    fireEvent.click(screen.getByTestId('parentos-protected-session-retry'));

    expect(runParentOSBootstrapMock).toHaveBeenLastCalledWith({ force: true });
  });

  it('keeps the launch screen for a future admitted protected session', () => {
    useAppStore.setState({
      bootstrapReady: true,
      bootstrapFailure: null,
      auth: { status: 'authenticated', user: { id: 'parent-1', displayName: 'Parent' } },
    });

    render(<AuthProvider><div>APP_CONTENT</div></AuthProvider>);
    expect(screen.getByText('LAUNCH_SCREEN')).toBeTruthy();
    fireEvent.click(screen.getByText('LAUNCH_SCREEN'));
    expect(screen.getByText('APP_CONTENT')).toBeTruthy();
  });
});
