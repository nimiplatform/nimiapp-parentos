import { useMemo, useState } from 'react';
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
import { i18nText } from '../../i18n/index.js';
import { NimiLoginBackground } from './nimi-login-background.js';

type ParentOSLaunchPageProps = {
  onEnter: () => void;
};

export function ParentOSLaunchPage({ onEnter }: ParentOSLaunchPageProps) {
  const [isLogoHovered, setIsLogoHovered] = useState(false);

  return (
    <main
      data-testid="parentos-launch-page"
      data-shell-auth-theme="desktop"
      className="nimi-shell-auth-root"
    >
      <div aria-hidden className="nimi-shell-auth-background">
        <NimiLoginBackground isLogoHovered={isLogoHovered} profile="desktop" />
      </div>

      <div className="nimi-shell-auth-shell absolute inset-0 z-10 flex flex-col items-center justify-center p-0">
        <div className="nimi-shell-auth-content">
          <div className="pointer-events-auto flex flex-col items-center gap-8">
            <button
              type="button"
              data-testid="parentos-launch-trigger"
              aria-label={i18nText('Auth.launchEnter')}
              onClick={onEnter}
              onMouseEnter={() => setIsLogoHovered(true)}
              onMouseLeave={() => setIsLogoHovered(false)}
              className="group relative cursor-pointer focus:outline-none"
            >
              <img
                src={parentosLogoUrl}
                alt={i18nText('App.logoAlt')}
                draggable={false}
                className="h-32 w-32 rounded-full object-cover transition-transform duration-200 group-hover:scale-105 select-none pointer-events-none"
              />
            </button>

            <div className="text-center">
              <h1 className="mb-3 text-[13px] font-medium uppercase tracking-[0.38em] text-[var(--nimi-text-secondary)]">
                ParentOS
              </h1>
              <p className="text-xs text-[var(--nimi-text-muted)] transition-opacity duration-500 opacity-0">
                {i18nText('Auth.launchEnter')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

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
      background={({ isLogoHovered }) => (
        <NimiLoginBackground isLogoHovered={isLogoHovered} profile="desktop" />
      )}
      desktopBrowserAuth={{
        baseUrl: webBaseUrl || undefined,
        bridge: parentosTauriOAuthBridge,
        hintVisibility: 'hover-or-status',
        runtimeAccountBroker,
      }}
      copy={{
        desktopLogoIdleHintText: i18nText('Auth.desktopLogoIdleHint'),
        desktopLogoHintText: i18nText('Auth.desktopLogoHint'),
        desktopAuthOpenMessage: i18nText('Auth.desktopAuthOpen'),
        desktopAuthSuccessMessage: i18nText('Auth.desktopAuthSuccess'),
      }}
      testIds={{
        screen: 'parentos-login-page',
        logoTrigger: 'parentos-login-trigger',
      }}
    />
  );
}
