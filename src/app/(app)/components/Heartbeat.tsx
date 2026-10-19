'use client';

import { useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { allowLeave } from '@/lib/idle-client';

/**
 * Tells the server we are online: every 30 s while visible, and immediately on focus / becoming visible.
 * It is also how a person whose login was disabled (or whose session ended) is sent out of an open tab: the server
 * answers 401, and we leave to the login page with the right explanation.
 */
export default function Heartbeat() {
  useEffect(() => {
    let left = false;
    const beat = async () => {
      if (left || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/presence', { method: 'POST', keepalive: true });
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
        allowLeave();
        window.location.replace('/login?reason=ended');
      } catch {
        /* offline: try again next time */
      }
    };
    void beat();
    const t = setInterval(beat, 30_000);
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
