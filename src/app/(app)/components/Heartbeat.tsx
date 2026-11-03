'use client';

import { useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { allowLeave } from '@/lib/idle-client';
import { clearOfflineData } from '@/lib/offline/cache';

/**
 * Tells the server we are online: every 10 s while visible (well inside the 30 s minimum "offline after" of the SMS alert), and immediately on focus / becoming visible.
 * It is also how a person whose login was disabled (or whose session ended) is sent out of an open tab: the server
 * answers 401, and we leave to the login page with the right explanation.
 */
export default function Heartbeat() {
  useEffect(() => {
    let left = false;
    let skip = 0; // beats to skip (back-off)
    let delay = 1; // current back-off, in beats (max 6 = 60 s)
    const beat = async () => {
      if (left || document.visibilityState !== 'visible') return;
      if (skip > 0) {
        skip -= 1;
        return;
      }
      try {
        const res = await fetch('/api/presence', { method: 'POST', keepalive: true });
        if (res.ok) {
          delay = 1;
          return;
        }
        if (res.status === 429 || res.status >= 500) {
          skip = delay;
          delay = Math.min(delay * 2, 6);
          return;
        }
        if (res.status !== 401 || left) return;
        left = true;
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (/inactiv/i.test(body.error ?? '')) {
          allowLeave();
          window.location.replace('/login?reason=idle');
          return;
        }
        await supabaseBrowser().auth.signOut({ scope: 'local' }).catch(() => {});
        await fetch('/api/activity', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
        try {
          await Promise.race([clearOfflineData(), new Promise<void>((r) => setTimeout(r, 1500))]);
        } catch {
          /* best effort */
        }
        allowLeave();
        window.location.replace('/login?reason=ended');
      } catch {
        /* offline: try again next time */
      }
    };
    void beat();
    const t = setInterval(beat, 10_000);
    const onVisible = () => void beat();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  return null;
}
