// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useAppStore } from '../../app-shell/app-store.js';

const desktopShellAuthPageSpy = vi.fn();

vi.mock('@nimiplatform/kit/auth', () => ({
  DesktopShellAuthPage: (props: unknown) => {
    desktopShellAuthPageSpy(props);
    return <div data-testid="desktop-shell-auth-page" />;
  },
}));

vi.mock('./parentos-auth-adapter.js', () => ({
  createParentOSDesktopBrowserAuthAdapter: vi.fn(() => ({
    applyToken: vi.fn(),
    loadCurrentUser: vi.fn(),
  })),
  createParentOSRuntimeAccountBrowserBroker: vi.fn(() => ({
    begin: vi.fn(),
    complete: vi.fn(),
  })),
}));

vi.mock('../../bridge/index.js', () => ({
  parentosTauriOAuthBridge: {
    hasTauriInvoke: vi.fn(() => true),
    oauthListenForCode: vi.fn(),
    openExternalUrl: vi.fn(),
    focusMainWindow: vi.fn(),
  },
}));

import { ParentOSLoginPage } from './parentos-login-page.js';

describe('ParentOSLoginPage', () => {
  beforeEach(() => {
    desktopShellAuthPageSpy.mockClear();
    useAppStore.setState({
      runtimeDefaults: {
        webBaseUrl: 'http://localhost:3000',
      },
    });
  });

  afterEach(() => {
    useAppStore.setState({ runtimeDefaults: null });
  });

  it('passes the configured web auth base URL into desktop browser auth', () => {
    render(<ParentOSLoginPage />);

    expect(desktopShellAuthPageSpy).toHaveBeenCalledTimes(1);
    const props = desktopShellAuthPageSpy.mock.calls[0]?.[0] as {
      desktopBrowserAuth?: { baseUrl?: string };
    };
    expect(props.desktopBrowserAuth?.baseUrl).toBe('http://localhost:3000');
  });

  it('PO-SHELL-008: wires runtimeAccountBroker into desktopBrowserAuth (admitted login path)', () => {
    render(<ParentOSLoginPage />);

    const props = desktopShellAuthPageSpy.mock.calls[0]?.[0] as {
      desktopBrowserAuth?: { runtimeAccountBroker?: unknown };
    };
    expect(props.desktopBrowserAuth?.runtimeAccountBroker).toBeDefined();
  });

  it('PO-SHELL-008: passes a code-only desktop bridge with no token exchange surface', () => {
    render(<ParentOSLoginPage />);

    const props = desktopShellAuthPageSpy.mock.calls[0]?.[0] as {
      desktopBrowserAuth?: { bridge?: Record<string, unknown> };
    };
    expect(props.desktopBrowserAuth?.bridge).toBeDefined();
    expect(props.desktopBrowserAuth?.bridge).not.toHaveProperty('oauthTokenExchange');
  });
});
