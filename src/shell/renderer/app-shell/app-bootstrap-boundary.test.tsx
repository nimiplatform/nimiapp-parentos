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

import { AppBootstrapBoundary } from './app-bootstrap-boundary.js';

describe('AppBootstrapBoundary app-owned data bootstrap', () => {
  beforeEach(() => {
    runParentOSBootstrapMock.mockClear();
    useAppStore.setState({
      bootstrapReady: false,
      bootstrapError: null,
      bootstrapFailure: null,
      familyId: null,
      children: [],
      activeChildId: null,
    });
  });

  it('renders an accessible loading state while bootstrap is pending', () => {
    render(<AppBootstrapBoundary><div>APP_CONTENT</div></AppBootstrapBoundary>);

    expect(screen.getByTestId('parentos-bootstrap-loading')).toBeTruthy();
    expect(screen.queryByText('APP_CONTENT')).toBeNull();
  });

  it.each([
    'app-data-unavailable',
    'app-data-repair-required',
  ] as const)('renders the %s state without opening local product data', (state) => {
    useAppStore.setState({
      bootstrapFailure: {
        state,
        reasonCode: `test-${state}`,
        actionHint: `act-${state}`,
        message: `message-${state}`,
      },
      bootstrapError: `message-${state}`,
    });

    render(<AppBootstrapBoundary><div>APP_CONTENT</div></AppBootstrapBoundary>);

    const failure = screen.getByTestId('parentos-bootstrap-failure');
    expect(failure.getAttribute('data-bootstrap-state')).toBe(state);
    expect(screen.getByRole('alert').textContent).not.toContain(`test-${state}`);
    expect(failure.querySelector('details')?.textContent).toContain(`test-${state}`);
    expect((screen.getByTestId('parentos-app-data-locked') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('APP_CONTENT')).toBeNull();
  });

  it('retries app-data bootstrap without claiming success', () => {
    useAppStore.setState({
      bootstrapFailure: {
        state: 'app-data-unavailable',
        reasonCode: 'parentos-electron-sidecar-binary-unavailable',
        actionHint: 'build_parentos_host_sidecar_before_launching_electron',
        message: 'ParentOS app data unavailable',
      },
      bootstrapError: 'ParentOS app data unavailable',
    });

    render(<AppBootstrapBoundary><div>APP_CONTENT</div></AppBootstrapBoundary>);
    fireEvent.click(screen.getByTestId('parentos-bootstrap-retry'));

    expect(runParentOSBootstrapMock).toHaveBeenLastCalledWith({ force: true });
  });

  it('opens product content immediately after app-owned local data is ready', () => {
    useAppStore.setState({
      bootstrapReady: true,
      bootstrapFailure: null,
    });

    render(<AppBootstrapBoundary><div>APP_CONTENT</div></AppBootstrapBoundary>);
    expect(screen.getByText('APP_CONTENT')).toBeTruthy();
  });
});
