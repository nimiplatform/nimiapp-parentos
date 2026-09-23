import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { nimiToast } from '@nimiplatform/kit/ui';
import { useAppStore } from '../../app-shell/app-store.js';
import { focusMainWindow } from '../../bridge/index.js';
import { hasParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import { i18nText } from '../../i18n/index.js';
import {
  beginGrowthReminderActivitySession,
  endGrowthReminderActivitySession,
  registerGrowthReminderOpenHandler,
  requestGrowthReminderSync,
  retryGrowthReminderActivity,
  subscribeGrowthReminderActivitySync,
} from './growth-reminder-activity.js';

type ParentOSHostEvents = {
  readonly onSessionInvalidated: (listener: () => void) => () => void;
};

declare global {
  interface Window {
    /** ParentOS's preload forwards the Kit Host's session invalidation. */
    readonly parentOSHost?: ParentOSHostEvents;
  }
}

/**
 * Keeps the active child's growth record reminder projection published while
 * a Nimi session is bound, accepts open requests for those reminders, and
 * stops both when the Host reports the session invalidated. ParentOS itself
 * stays usable; reopening resumes publication.
 */
export function GrowthReminderActivityBridge() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const activeChildId = useAppStore((state) => state.activeChildId);
  const children = useAppStore((state) => state.children);

  useEffect(() => {
    if (!hasParentOSNimiClient()) return undefined;
    beginGrowthReminderActivitySession((childId) => useAppStore.getState().children.find((child) => child.childId === childId));
    const registration = registerGrowthReminderOpenHandler({
      selectChild: (childId) => useAppStore.getState().setActiveChildId(childId),
      navigate: (path) => navigateRef.current(path),
      focus: focusMainWindow,
    });
    const stopWatching = window.parentOSHost?.onSessionInvalidated(() => {
      endGrowthReminderActivitySession();
      void registration.stop();
      nimiToast.warning(i18nText('Reminders.activity.sessionChanged'), {
        sticky: true,
        action: { label: i18nText('Reminders.activity.reopen'), onClick: () => window.location.reload() },
      });
    });
    return () => {
      stopWatching?.();
      void registration.stop();
      endGrowthReminderActivitySession();
    };
  }, []);

  useEffect(() => {
    if (activeChildId) requestGrowthReminderSync(activeChildId);
  }, [activeChildId, children]);

  useUnsyncedReminderNotice();
  return null;
}

function useUnsyncedReminderNotice() {
  useEffect(() => {
    let toastId: string | null = null;
    let shown = 0;
    const show = (count: number) => {
      if (toastId) nimiToast.dismiss(toastId);
      toastId = nimiToast.warning(i18nText('Reminders.activity.unsynced'), {
        sticky: true,
        action: {
          label: i18nText('Reminders.activity.retryNow'),
          onClick: () => {
            void retryGrowthReminderActivity().then((remaining) => { if (remaining) show(remaining); }).catch(() => show(shown));
          },
        },
      });
      shown = count;
    };
    const unsubscribe = subscribeGrowthReminderActivitySync((count) => {
      if (count === 0) {
        if (toastId) nimiToast.dismiss(toastId);
        toastId = null;
        shown = 0;
      } else if (shown === 0) {
        show(count);
      }
    });
    return () => {
      unsubscribe();
      if (toastId) nimiToast.dismiss(toastId);
    };
  }, []);
}
