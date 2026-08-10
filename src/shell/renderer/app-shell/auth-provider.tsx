import { useEffect, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  AmbientBackground,
  Button,
  InlineAlert,
  Surface,
} from '@nimiplatform/kit/ui';
import { useAppStore } from './app-store.js';
import { runParentOSBootstrap } from '../infra/parentos-bootstrap.js';
import { ParentOSLaunchPage } from '../features/auth/parentos-login-page.js';
import { i18nText } from '../i18n/index.js';


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((s) => s.auth.status);
  const bootstrapReady = useAppStore((s) => s.bootstrapReady);
  const bootstrapFailure = useAppStore((s) => s.bootstrapFailure);
  const [launchEntered, setLaunchEntered] = useState(false);

  useEffect(() => {
    void runParentOSBootstrap();
  }, []);

  if (bootstrapFailure) {
    const titleKey = `Auth.bootstrapFailure.states.${bootstrapFailure.state}.title`;
    const descriptionKey = `Auth.bootstrapFailure.states.${bootstrapFailure.state}.description`;
    return (
      <AmbientBackground variant="mesh" className="min-h-dvh w-full overflow-y-auto px-4 py-8 sm:px-6">
        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl items-center justify-center">
          <Surface
            data-testid="parentos-bootstrap-failure"
            data-bootstrap-state={bootstrapFailure.state}
            tone="card"
            material="glass-regular"
            elevation="floating"
            padding="lg"
            className="w-full min-w-0 overflow-hidden rounded-[var(--nimi-radius-xl)]"
          >
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--nimi-status-warning-soft-bg)] text-[var(--nimi-status-warning-soft-text)]">
                  <ShieldAlert size={23} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--nimi-type-body-sm-size)] font-semibold uppercase tracking-[0.12em] text-[var(--nimi-text-muted)]">
                    {i18nText('Auth.bootstrapFailure.eyebrow')}
                  </p>
                  <h1 className="mt-1 text-balance text-2xl font-semibold leading-tight text-[var(--nimi-text-primary)]">
                    {i18nText(titleKey)}
                  </h1>
                  <p className="mt-2 text-pretty text-sm leading-6 text-[var(--nimi-text-secondary)]">
                    {i18nText(descriptionKey)}
                  </p>
                </div>
              </div>

              <InlineAlert role="alert" tone="warning" icon={<LockKeyhole size={17} aria-hidden="true" />}>
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{i18nText('Auth.bootstrapFailure.localDataLocked')}</p>
                </div>
              </InlineAlert>

              <details className="rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--nimi-text-muted)]">
                  {i18nText('Auth.bootstrapFailure.technicalDetails')}
                </summary>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--nimi-text-muted)]">
                  {i18nText('Auth.bootstrapFailure.reasonCode')}: {bootstrapFailure.reasonCode}
                </p>
              </details>

              <div className="rounded-[var(--nimi-radius-md)] border border-[var(--nimi-border-subtle)] bg-[var(--nimi-surface-panel)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nimi-text-muted)]">
                  {i18nText('Auth.bootstrapFailure.nextStep')}
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-[var(--nimi-text-secondary)]">
                  {i18nText(`Auth.bootstrapFailure.states.${bootstrapFailure.state}.action`)}
                </p>
              </div>

              <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  data-testid="parentos-app-data-locked"
                  disabled
                  tone="secondary"
                  className="w-full sm:w-auto"
                  leadingIcon={<LockKeyhole size={16} aria-hidden="true" />}
                >
                  {i18nText('Auth.bootstrapFailure.localDataButton')}
                </Button>
                <Button
                  data-testid="parentos-bootstrap-retry"
                  tone="primary"
                  className="w-full sm:w-auto"
                  leadingIcon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={() => void runParentOSBootstrap({ force: true })}
                >
                  {i18nText('Auth.bootstrapFailure.retry')}
                </Button>
              </div>
            </div>
          </Surface>
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
