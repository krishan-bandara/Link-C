'use client';

import { useEffect } from 'react';
import { isLeaveAllowed } from '@/lib/idle-client';

/**
 * Refreshing or closing the page asks "Leave site?" (the browser draws that box; its text cannot be changed).
 * Cancel keeps everything as it is. Confirm ends the session, so the next load lands on the login page.
 * Moving between pages inside the app is not affected. Phones that only switch apps do not fire pagehide
 * for a closed page, and a page kept in the back/forward cache (event.persisted) stays signed in.
 */
export default function RefreshGuard() {
  useEffect(() => {
    const ask = (e: BeforeUnloadEvent) => {
      if (isLeaveAllowed()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const leave = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      navigator.sendBeacon('/api/auth/logout');
    };
    window.addEventListener('beforeunload', ask);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('beforeunload', ask);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  return null;
}
