import { useEffect, useState } from 'react';
import { AmbientBackground } from '@nimiplatform/kit/ui';
import { useAppStore } from './app-store.js';
import { runParentOSBootstrap } from '../infra/parentos-bootstrap.js';
import { ParentOSLaunchPage } from '../features/auth/parentos-login-page.js';
import { i18nText } from '../i18n/index.js';


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((s) => s.auth.status);
  const bootstrapReady = useAppStore((s) => s.bootstrapReady);
  const bootstrapError = useAppStore((s) => s.bootstrapError);
  const [launchEntered, setLaunchEntered] = useState(false);

  useEffect(() => {
    void runParentOSBootstrap();
  }, []);

  if (bootstrapError) {
    return (
      <AmbientBackground variant="mesh" className="flex h-screen w-screen items-center justify-center">
        <div role="alert" className="relative z-10 text-center space-y-4">
          <p className="text-red-500 text-lg">{bootstrapError}</p>
        </div>
      </AmbientBackground>
    );
  }

  if (!bootstrapReady || authStatus === 'bootstrapping') {
    return (
      <AmbientBackground variant="mesh" className="flex h-screen w-screen items-center justify-center">
        <div data-testid="parentos-bootstrap-loading" className="relative z-10 text-center space-y-4">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto" />
          <p className="text-gray-500">{i18nText('App.loading')}</p>
        </div>
      </AmbientBackground>
    );
  }

  if (!launchEntered) {
    return <ParentOSLaunchPage onEnter={() => setLaunchEntered(true)} />;
  }

  return <>{children}</>;
}
