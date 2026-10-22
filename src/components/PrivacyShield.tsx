'use client';

import { useEffect } from 'react';
import { IDLE_MS } from '@/lib/idle';

const SHARED_KEY = 'lc-last-active'; // written by IdleGuard

/**
 * Hides the whole app at the EARLIEST moment the browser says it is going away, so the phone's recent-apps preview and the
 * screen on return never show the chat. The cover is set directly on <html> (no React render) so it is in place before
 * the OS takes its snapshot.
 *
 * Signals, earliest first: window `blur` (the recent-apps screen, the notification shade, a system dialog or the app switcher
 * takes focus), `visibilitychange` to hidden, `pagehide`, `freeze`. On return the cover stays until the page is visible AND the
 * session is still valid. If the person was idle too long, it stays covered while IdleGuard signs out and redirects to
 * the login page, so no chat flashes on screen.
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
    // Called when the page may be showing again (focus, visible, pageshow, a touch).
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
    const onVisibility = () => (document.visibilityState === 'hidden' ? cover() : back());
    const onTouch = () => {
      // If the person is touching the screen they can see it: never stay covered by a missed focus event.
      if (root.dataset.shield && document.visibilityState === 'visible' && !expired()) uncover();
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('freeze', cover);
    window.addEventListener('blur', cover);
    window.addEventListener('pagehide', cover);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', back);
    window.addEventListener('pointerdown', onTouch, { capture: true, passive: true });
    window.addEventListener('touchstart', onTouch, { capture: true, passive: true });

    // First load: stay covered only if the page is not visible (restored in the background) or the session already ran out.
    if (document.visibilityState !== 'visible') cover();
    back();
    return () => {
      clearTimeout(failsafe);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('freeze', cover);
      window.removeEventListener('blur', cover);
      window.removeEventListener('pagehide', cover);
      window.removeEventListener('focus', back);
      window.removeEventListener('pageshow', back);
      window.removeEventListener('pointerdown', onTouch, { capture: true });
      window.removeEventListener('touchstart', onTouch, { capture: true });
    };
  }, []);
  return null;
}
