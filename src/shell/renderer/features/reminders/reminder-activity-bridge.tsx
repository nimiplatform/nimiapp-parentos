import { useEffect, useRef } from 'react';
import { useParentOSNavigation } from '../../app-shell/app-navigation.js';
import { nimiToast } from '@nimiplatform/kit/ui';
import { useAppStore } from '../../app-shell/app-store.js';
import { getParentOSNimiClient, hasParentOSNimiClient } from '../../infra/parentos-nimi-client.js';
import { i18nText } from '../../i18n/index.js';
import {
  beginReminderActivitySession,
  endReminderActivitySession,
  registerReminderOpenHandler,
  requestReminderActivitySync,
  retryReminderActivity,
  subscribeReminderActivitySync,
} from './reminder-activity.js';

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
 * Keeps the active child's admitted reminder projection published while
 * a Nimi session is bound, accepts open requests for those reminders, and
 * stops both when the Host reports the session invalidated. ParentOS itself
 * stays usable; reopening resumes publication.
 */
export function ReminderActivityBridge() {
  const owner = useParentOSNavigation();
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const activeChildId = useAppStore((state) => state.activeChildId);
  const children = useAppStore((state) => state.children);

  useEffect(() => {
    if (!hasParentOSNimiClient()) return undefined;
    let stopped = false;
    let registration: ReturnType<typeof registerReminderOpenHandler> | null = null;
    // Client construction does not bind a session. Establish it through the
    // public Host surface before reminder publication or open registration.
    void getParentOSNimiClient().auth.status().then(access => {
      if (stopped) return;
      if (!access.sessionBound) throw new Error(access.reasonCode);
      beginReminderActivitySession((childId) => useAppStore.getState().children.find((child) => child.childId === childId));
      registration = registerReminderOpenHandler({
        openReminder: (childId, focus) => ownerRef.current.switchChild(childId, { id: '/reminders', focus }),
      });
      const childId = useAppStore.getState().activeChildId;
      if (childId) requestReminderActivitySync(childId);
    }).catch(() => {
      if (!stopped) nimiToast.warning(i18nText('Reminders.activity.sessionChanged'), { sticky: true });
    });
    const stopWatching = window.parentOSHost?.onSessionInvalidated(() => {
      stopped = true;
      ownerRef.current.reset();
      endReminderActivitySession();
      void registration?.stop();
      nimiToast.warning(i18nText('Reminders.activity.sessionChanged'), {
        sticky: true,
      });
    });
    return () => {
      stopped = true;
      stopWatching?.();
      void registration?.stop();
      endReminderActivitySession();
    };
  }, []);

  useEffect(() => {
    if (activeChildId) requestReminderActivitySync(activeChildId);
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
            void retryReminderActivity().then((remaining) => { if (remaining) show(remaining); }).catch(() => show(shown));
          },
        },
      });
      shown = count;
    };
    const unsubscribe = subscribeReminderActivitySync((count) => {
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
