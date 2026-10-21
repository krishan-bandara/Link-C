'use client';

import { useEffect } from 'react';
import { IDLE_MS } from '@/lib/idle';

const SHARED_KEY = 'lc-last-active'; // written by IdleGuard

/**
 * Hides the whole app the moment it leaves the foreground (so the phone's app switcher shows nothing) and keeps it
 * hidden on return until we know the session is still valid. If the person was idle too long, the screen stays
 * covered while IdleGuard signs out and redirects to the login page, so no chat flashes on screen.
 * The cover is set directly on <html> (no React render) so it is in place before the OS takes its snapshot.
 */
export default function PrivacyShield() {
  useEffect(() => {
    const root = document.documentElement;
    let failsafe: ReturnType<typeof setTimeout> | undefined;

    const cover = () => {
      root.dataset.shield = '1';
    };
    const uncover = () => {
      clearTimeout(failsafe);
      delete root.dataset.shield;
    };
    const expired = () => {
      try {
        const last = Number(localStorage.getItem(SHARED_KEY)) || 0;
        return last > 0 && Date.now() - last >= IDLE_MS;
      } catch {
        return false;
      }
    };
    const back = () => {
      if (document.visibilityState !== 'visible') return;
      if (expired()) {
        cover(); // IdleGuard is signing out; the page reloads to /login
        clearTimeout(failsafe);
        failsafe = setTimeout(uncover, 4000); // e.g. already on the login page: never leave a blank screen
      } else {
        uncover();
      }
    };
    const away = () => {
      if (document.visibilityState === 'hidden') cover();
    };

    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? away() : back()));
    const onHide = () => cover();
    const onShow = () => back();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    back(); // first load
    return () => {
      clearTimeout(failsafe);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);
  return null;
}
