import type { PropsWithChildren } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { TooltipProvider } from '@nimiplatform/kit/ui';
import { i18n } from './i18n/index.js';
import { AppRoutes } from './app-shell/routes.js';
import { ShellLayout } from './app-shell/shell-layout.js';
import { AuthProvider } from './app-shell/auth-provider.js';
import { hasElectronRuntime } from './bridge/index.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
});

export function shouldUseParentOSHashRouter(input: {
  readonly electronRuntime: boolean;
  readonly locationProtocol: string;
} = {
  electronRuntime: hasElectronRuntime(),
  locationProtocol: globalThis.location?.protocol ?? '',
}): boolean {
  return input.electronRuntime && input.locationProtocol === 'file:';
}

function ParentOSRouter({ children }: PropsWithChildren) {
  const Router = shouldUseParentOSHashRouter() ? HashRouter : BrowserRouter;
  return <Router>{children}</Router>;
}

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ParentOSRouter>
            <AuthProvider>
              <ShellLayout>
                <div data-testid="parentos-app-routed-surface" className="h-full">
                  <AppRoutes />
                </div>
              </ShellLayout>
            </AuthProvider>
          </ParentOSRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
