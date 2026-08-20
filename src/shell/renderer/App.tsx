import type { PropsWithChildren } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { NimiToaster, TooltipProvider } from '@nimiplatform/kit/ui';
import { i18n } from './i18n/index.js';
import { AppRoutes } from './app-shell/routes.js';
import { ShellLayout } from './app-shell/shell-layout.js';
import { AppBootstrapBoundary } from './app-shell/app-bootstrap-boundary.js';
import { shouldUseParentOSHashRouter } from './app-router-mode.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
});

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
            <AppBootstrapBoundary>
              <ShellLayout>
                <div data-testid="parentos-app-routed-surface" className="h-full">
                  <AppRoutes />
                </div>
              </ShellLayout>
            </AppBootstrapBoundary>
          </ParentOSRouter>
          <NimiToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
