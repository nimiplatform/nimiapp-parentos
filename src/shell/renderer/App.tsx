import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NimiAppChrome } from '@nimiplatform/kit/ui/app-chrome';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { NimiToaster, TooltipProvider } from '@nimiplatform/kit/ui';
import { i18n } from './i18n/index.js';
import { AppRoutes } from './app-shell/routes.js';
import { ShellLayout } from './app-shell/shell-layout.js';
import { AppBootstrapBoundary } from './app-shell/app-bootstrap-boundary.js';
import { ChildDirectoryBridge } from './features/settings/child-directory-bridge.js';
import { ReminderActivityBridge } from './features/reminders/reminder-activity-bridge.js';
import { ParentOSNavigationProvider, useParentOSNavigation } from './app-shell/app-navigation.js';
import { useAppStore } from './app-shell/app-store.js';
import appPackage from '../../../package.json';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
});

function ParentOSFrame() {
  const owner = useParentOSNavigation(), { i18n } = useTranslation();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const ready = useAppStore(state => state.bootstrapReady);
  const hasChild = useAppStore(state => state.children.some(child => child.childId === state.activeChildId));
  return <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <NimiAppChrome metadata={{ name: 'ParentOS', version: appPackage.version, license: appPackage.license }} locale={i18n.language.startsWith('zh') ? 'zh' : 'en'}
      navigation={owner.navigation} navigationEnabled={ready}
      sidebar={ready && hasChild ? { visible: sidebarVisible, onVisibleChange: setSidebarVisible } : undefined} />
    <div className="relative min-h-0 flex-1 overflow-hidden [contain:layout]">
      <AppBootstrapBoundary><ReminderActivityBridge /><ChildDirectoryBridge /><ShellLayout sidebarVisible={sidebarVisible}>
        <div data-testid="parentos-app-routed-surface" className="h-full"><AppRoutes /></div>
      </ShellLayout></AppBootstrapBoundary>
    </div>
  </div>;
}

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ParentOSNavigationProvider><ParentOSFrame /></ParentOSNavigationProvider>
          <NimiToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
