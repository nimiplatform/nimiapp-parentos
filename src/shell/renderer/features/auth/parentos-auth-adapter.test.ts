/**
 * ParentOS auth adapter regression tests (PO-SHELL-008 / spec K-ACCSVC-008).
 *
 * The installed app does not own OAuth, access tokens, refresh tokens, or
 * account-control RPCs. Account projection is read through the installed app
 * Runtime caller created during bootstrap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountSessionState } from '@nimiplatform/sdk/runtime/wire-types';

const mockGetAccountSessionStatus = vi.fn();
const mockLogout = vi.fn();
const mockEnsureRuntimeClient = vi.fn(async () => undefined);
const installedCaller = {
  appId: 'nimi.parentos',
  appInstanceId: 'nimi.parentos.desktop-installed',
  deviceId: 'desktop-installed-app',
  mode: 8,
  scopes: [],
  launchHostId: 'desktop-electron-installed-app-host',
  launchNonce: 'launch-nonce-1',
  releaseDescriptorRef: 'nimi.parentos.bundled-with-nimi',
};

vi.mock('../../infra/parentos-bootstrap.js', () => {
  return {
    ensureParentOSRuntimeClientReady: mockEnsureRuntimeClient,
    loadParentOSRuntimeAccountUser: async (runtime: {
      account: {
        getAccountSessionStatus: typeof mockGetAccountSessionStatus;
      };
    }) => {
      const response = await runtime.account.getAccountSessionStatus({ caller: installedCaller });
      if (response.state !== AccountSessionState.AUTHENTICATED) {
        return null;
      }
      const accountId = String(response.accountProjection?.accountId || '').trim();
      return accountId
        ? {
            id: accountId,
            displayName: String(response.accountProjection?.displayName || '').trim(),
          }
        : null;
    },
  };
});

vi.mock('../../infra/parentos-nimi-client.js', () => ({
  getParentOSNimiClient: () => ({
    runtime: {
      account: {
        getAccountSessionStatus: mockGetAccountSessionStatus,
        logout: mockLogout,
      },
    },
  }),
}));

const {
  loadCurrentUser,
  logoutParentOSRuntimeAccount,
} = await import('./parentos-auth-adapter.js');

describe('parentos-auth-adapter installed app boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadCurrentUser derives the user from runtime.account.getAccountSessionStatus', async () => {
    mockGetAccountSessionStatus.mockResolvedValue({
      state: AccountSessionState.AUTHENTICATED,
      accountProjection: { accountId: 'acct-7', displayName: 'Seven' },
    });

    const user = await loadCurrentUser();

    expect(mockEnsureRuntimeClient).toHaveBeenCalledTimes(1);
    expect(mockGetAccountSessionStatus).toHaveBeenCalledWith({ caller: installedCaller });
    expect(user).toEqual({ id: 'acct-7', displayName: 'Seven' });
  });

  it('loadCurrentUser returns null when runtime account state is not AUTHENTICATED', async () => {
    mockGetAccountSessionStatus.mockResolvedValue({
      state: AccountSessionState.ANONYMOUS,
      accountProjection: null,
    });

    await expect(loadCurrentUser()).resolves.toBeNull();
  });

  it('logoutParentOSRuntimeAccount fails closed without Runtime account-control RPC', async () => {
    await expect(logoutParentOSRuntimeAccount()).rejects.toThrow(/cannot own Runtime account logout/);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('source does not define an OAuth/browser login broker', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, 'parentos-auth-adapter.ts'), 'utf8');

    expect(source).not.toMatch(/createParentOSRuntimeAccountBrowserBroker/);
    expect(source).not.toMatch(/AuthPlatformAdapter|ShellAuthPage|beginLogin|completeLogin|oauthAuthorizationUrl|oauthLogin/);
    expect(source).not.toMatch(/parentosRuntimeAccountCaller|LOCAL_DEVELOPER_APP|local-developer/);
  });
});
