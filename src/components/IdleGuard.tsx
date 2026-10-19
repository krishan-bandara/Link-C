'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { IDLE_MS, PING_EVERY_MS, WARN_BEFORE_MS } from '@/lib/idle';
import { allowLeave, isHeld, reportActivity } from '@/lib/idle-client';

const SHARED_KEY = 'lc-last-active'; // shared between tabs, so activity in one tab keeps the others signed in

function readShared(): number {
  try {
    return Number(localStorage.getItem(SHARED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Signs the person out after IDLE_MS without activity (mouse, keys, touch, scroll). Uses timestamps, not just
 * timers, so a phone that slept or a throttled background tab still logs out the moment it wakes up.
 * An active call, upload or location share (see holdAlive) counts as activity.
 */
export default function IdleGuard() {
  const [signedIn, setSignedIn] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const last = useRef(Date.now());
  const lastPing = useRef(0);
  const done = useRef(false);
  const wasSignedIn = useRef(false);

  // only act when there is a session
  useEffect(() => {
    const supabase = supabaseBrowser();
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      wasSignedIn.current = wasSignedIn.current || !!data.session;
      setSignedIn(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
      // Only a NEW sign-in restarts the clock. The auth library also fires SIGNED_IN / TOKEN_REFRESHED events by
      // itself (tab focus, token refresh); those are not the person doing something.
      if (session && !wasSignedIn.current) {
        last.current = Date.now();
        done.current = false;
      }
      wasSignedIn.current = !!session;
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    last.current = Math.max(last.current, readShared());

    const mark = () => {
      const now = Date.now();
      last.current = now;
      setSecondsLeft(null);
      try {
        localStorage.setItem(SHARED_KEY, String(now));
      } catch {
        /* private mode */
      }
      if (now - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = now;
        void reportActivity();
      }
    };

    async function logout() {
      if (done.current) return;
      done.current = true;
      try {
        await supabaseBrowser().auth.signOut({ scope: 'local' });
        await fetch('/api/activity', { method: 'DELETE', credentials: 'same-origin' });
      } finally {
        allowLeave();
        window.location.replace('/login?reason=idle'); // full reload clears every in-memory state
      }
    }

    const tick = () => {
      if (done.current) return;
      if (isHeld()) {
        // a call, upload or location share is running: keep the session alive
        const now = Date.now();
        last.current = now;
        if (now - lastPing.current >= PING_EVERY_MS * 2) {
          lastPing.current = now;
          void reportActivity();
        }
        setSecondsLeft(null);
        return;
      }
      const idle = Date.now() - Math.max(last.current, readShared());
      if (idle >= IDLE_MS) void logout();
      else if (idle >= IDLE_MS - WARN_BEFORE_MS) setSecondsLeft(Math.ceil((IDLE_MS - idle) / 1000));
      else setSecondsLeft(null);
    };

    // Not 'scroll' (the chat scrolls by itself when a message arrives) and not 'focus' (the warning banner and
    // other components take focus by themselves): neither is the person doing something. Real scrolling is
    // covered by wheel, touch and key events.
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove', 'click'];
    let throttled = 0;
    const onEvent = () => {
      const now = Date.now();
      if (now - throttled < 400) return; // pointermove fires constantly
      throttled = now;
      mark();
    };
    for (const e of events) window.addEventListener(e, onEvent, { passive: true, capture: true });
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(tick, 1000);
    tick();
    return () => {
      for (const e of events) window.removeEventListener(e, onEvent, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [signedIn]);

  if (!signedIn || secondsLeft === null) return null;
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Signing out soon"
      className="safe-bottom fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4"
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-xl">
        <p className="flex-1 text-sm text-main">
          Signing you out in <strong>{secondsLeft}</strong> s because you have been inactive.
        </p>
        <button
          type="button"
          className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-main"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
