// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import { render } from '@testing-library/react';
import { useAppStore } from '../../app-shell/app-store.js';

const shellAuthPageSpy = vi.fn();

vi.mock('@nimiplatform/kit/auth', () => ({
  ShellAuthPage: (props: unknown) => {
    shellAuthPageSpy(props);
    return <div data-testid="shell-auth-page" />;
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
    shellAuthPageSpy.mockClear();
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

    expect(shellAuthPageSpy).toHaveBeenCalledTimes(1);
    const props = shellAuthPageSpy.mock.calls[0]?.[0] as {
      desktopBrowserAuth?: { baseUrl?: string };
    };
    expect(props.desktopBrowserAuth?.baseUrl).toBe('http://localhost:3000');
  });

  it('PO-SHELL-008: wires runtimeAccountBroker into desktopBrowserAuth (admitted login path)', () => {
    render(<ParentOSLoginPage />);

    const props = shellAuthPageSpy.mock.calls[0]?.[0] as {
      desktopBrowserAuth?: { runtimeAccountBroker?: unknown };
    };
    expect(props.desktopBrowserAuth?.runtimeAccountBroker).toBeDefined();
  });

  it('PO-SHELL-008: passes a code-only desktop bridge with no token exchange surface', () => {
    render(<ParentOSLoginPage />);

    const props = shellAuthPageSpy.mock.calls[0]?.[0] as {
      desktopBrowserAuth?: { bridge?: Record<string, unknown> };
    };
    expect(props.desktopBrowserAuth?.bridge).toBeDefined();
    expect(props.desktopBrowserAuth?.bridge).not.toHaveProperty('oauthTokenExchange');
  });

  it('uses the ParentOS logo as the desktop login trigger branding', () => {
    render(<ParentOSLoginPage />);

    const props = shellAuthPageSpy.mock.calls[0]?.[0] as {
      branding?: { networkLabel?: string; logo?: string; logoAltText?: string };
      desktopBrowserAuth?: { hintVisibility?: string };
    };
    expect(props.branding?.networkLabel).toBe('ParentOS');
    expect(props.branding?.logoAltText).toBe('ParentOS Logo');
    expect(props.branding?.logo).toContain('/src-tauri/icons/icon.png');
    expect(props.desktopBrowserAuth?.hintVisibility).toBe('hover-or-status');
  });

  it('uses the Nimi default desktop auth background with ParentOS branding', () => {
    render(<ParentOSLoginPage />);

    const props = shellAuthPageSpy.mock.calls[0]?.[0] as {
      appearance?: { rootClassName?: string; shellClassName?: string; contentClassName?: string };
      background?: (state: { isLogoHovered: boolean; mode: 'desktop-browser' }) => unknown;
      copy?: { desktopLogoIdleHintText?: string };
    };

    expect(props.appearance?.rootClassName).toBeUndefined();
    expect(props.appearance?.shellClassName).toBe('absolute inset-0 z-10 flex flex-col items-center justify-center p-0');
    expect(props.appearance?.contentClassName).toBe('');
    expect(props.copy?.desktopLogoIdleHintText).toBe('点击授权并进入成长底稿');

    expect(typeof props.background).toBe('function');
    const background = props.background?.({ isLogoHovered: false, mode: 'desktop-browser' });
    expect(isValidElement(background)).toBe(true);
  });
});
