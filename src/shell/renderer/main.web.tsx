import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NimiAppAccessGate, NimiAppSessionProvider } from '@nimiplatform/kit/auth/app';
import { createWebNimiAppSession, type NimiRemoteAppConfig } from '@nimiplatform/kit/auth/app/web';
import { NimiThemeProvider } from '@nimiplatform/kit/ui';
import { App } from './App.js';
import { bindParentOSShellCommandExecutor } from './bridge/shell-command.js';
import { createParentOSWebStorageController } from './bridge/web-storage-backend.js';
import { resetParentOSBootstrapState } from './infra/parentos-bootstrap.js';
import { bindParentOSWebSession } from './infra/parentos-nimi-client.js';
import { installParentosGlobalErrorLogging } from './infra/telemetry/renderer-log.js';
import './styles.css';

declare const __NIMI_APP_WEB_CONFIG__: NimiRemoteAppConfig;

function resolveGateLanguage(): 'zh' | 'en' {
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return 'zh';
}

function mountParentOSWeb() {
  installParentosGlobalErrorLogging();
  const session = createWebNimiAppSession(__NIMI_APP_WEB_CONFIG__);
  const webStorage = createParentOSWebStorageController();
  bindParentOSWebSession(session);
  bindParentOSShellCommandExecutor(webStorage.executor);

  let identityKey: string | undefined;
  let connectionKey: string | undefined;
  const syncScope = () => {
    const snapshot = session.getSnapshot();
    const nextIdentity = snapshot.identity.status === 'signed-in' ? snapshot.identity.viewKey : undefined;
    const nextConnection = snapshot.runtime.status === 'connected' ? snapshot.runtime.scope.viewKey : undefined;
    if (identityKey === nextIdentity && connectionKey === nextConnection) {
      return;
    }
    identityKey = nextIdentity;
    connectionKey = nextConnection;
    if (snapshot.runtime.status === 'connected' && !snapshot.runtime.scope.signal.aborted) {
      webStorage.bindScope({
        assets: snapshot.runtime.scope.client.storage.assets,
        signal: snapshot.runtime.scope.signal,
      });
    } else {
      webStorage.reset();
    }
    resetParentOSBootstrapState();
  };

  const unsubscribe = session.subscribe(syncScope);
  syncScope();

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <NimiThemeProvider accentPack="nimi-accent" defaultScheme="light">
        <NimiAppSessionProvider session={session}>
          <NimiAppAccessGate title="ParentOS" language={resolveGateLanguage()} requireRuntime={true}>
            {() => <App />}
          </NimiAppAccessGate>
        </NimiAppSessionProvider>
      </NimiThemeProvider>
    </StrictMode>,
  );

  void session.start();
  return () => {
    unsubscribe();
    session.dispose();
    root.unmount();
    webStorage.reset();
    bindParentOSShellCommandExecutor(null);
    bindParentOSWebSession(null);
    resetParentOSBootstrapState();
  };
}

const dispose = mountParentOSWeb();
if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
