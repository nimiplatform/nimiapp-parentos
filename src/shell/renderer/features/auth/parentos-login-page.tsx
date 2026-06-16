import { useMemo } from 'react';
import { ShellAuthPage } from '@nimiplatform/kit/auth';
import '@nimiplatform/kit/auth/styles.css';
import { useAppStore } from '../../app-shell/app-store.js';
import {
  createParentOSDesktopBrowserAuthAdapter,
  createParentOSRuntimeAccountBrowserBroker,
} from './parentos-auth-adapter.js';
import { parentosTauriOAuthBridge } from '../../bridge/index.js';
import { syncParentOSLocalDataScope } from '../../infra/parentos-bootstrap.js';
import parentosLogoUrl from '../../../../../src-tauri/icons/icon.png';

export function ParentOSLoginPage() {
  const adapter = useMemo(() => createParentOSDesktopBrowserAuthAdapter(), []);
  const runtimeAccountBroker = useMemo(() => createParentOSRuntimeAccountBrowserBroker(), []);
  const webBaseUrl = useAppStore((s) => s.runtimeDefaults?.webBaseUrl || '');

  return (
    <ShellAuthPage
      adapter={adapter}
      session={{
        mode: 'desktop-browser',
        authStatus: 'unauthenticated',
        // The kit only invokes `setAuthSession` after the runtime broker has
        // returned an account projection; the second argument (legacy access
        // token) is always empty under PO-SHELL-008.
        setAuthSession: (user) => {
          const store = useAppStore.getState();
          if (!user || !user.id) {
            store.clearAuthSession();
            void syncParentOSLocalDataScope(null);
            return;
          }

          const nextUserId = String(user.id);
          const previousUserId = store.auth.user?.id ?? null;
          store.setAuthSession({
            id: nextUserId,
            displayName: String(user.displayName || user.name || ''),
            email: user.email ? String(user.email) : undefined,
            avatarUrl: user.avatarUrl ? String(user.avatarUrl) : undefined,
          });
          if (previousUserId !== nextUserId) {
            void syncParentOSLocalDataScope(nextUserId);
          }
        },
      }}
      branding={{
        networkLabel: 'ParentOS',
        logo: parentosLogoUrl,
        logoAltText: 'ParentOS Logo',
      }}
      appearance={{
        theme: 'desktop',
        shellClassName: 'absolute inset-0 z-10 flex flex-col items-center justify-center p-0',
        contentClassName: '',
        footerPlacement: 'inside-content',
      }}
      desktopBrowserAuth={{
        baseUrl: webBaseUrl || undefined,
        bridge: parentosTauriOAuthBridge,
        hintVisibility: 'hover-or-status',
        runtimeAccountBroker,
      }}
      copy={{
        desktopLogoHintText: '授权失败。点击 logo 重试。',
        desktopAuthOpenMessage: '已打开浏览器，请在网页完成授权登录。',
        desktopAuthSuccessMessage: '网页登录授权成功，已登录。',
      }}
      testIds={{
        screen: 'parentos-login-page',
        logoTrigger: 'parentos-login-trigger',
      }}
    />
  );
}
