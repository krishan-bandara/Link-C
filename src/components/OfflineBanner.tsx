'use client';

import { useCallback, useEffect } from 'react';
import { CloudOff, Send } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { clearOfflineData, setActiveUser } from '@/lib/offline/cache';
import { flushOutbox } from '@/lib/offline/outbox';
import { useOutbox } from '@/lib/offline/hooks';
import { useOnlineStatus } from '@/lib/offline/status';

/**
 * Mounted once in the signed-in shell. Shows the "You are offline" notice and also runs the offline plumbing:
 * binds the cache to this person (wiping another person's data), wipes everything on logout, and sends the
 * queued messages when the connection is back (online event, tab visible, short retry timer).
 */
export default function OfflineBanner({ userId }: { userId: string }) {
  const online = useOnlineStatus();
  const items = useOutbox(userId);
  const queued = items.filter((i) => i.status === 'queued').length;

  useEffect(() => {
    void setActiveUser(userId);
  }, [userId]);

  // Privacy: logout buttons dispatch 'lc-logout'; idle logout, ended sessions and sign-outs elsewhere show up as SIGNED_OUT.
  useEffect(() => {
    const wipe = () => void clearOfflineData();
    window.addEventListener('lc-logout', wipe);
    const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') wipe();
    });
    return () => {
      window.removeEventListener('lc-logout', wipe);
      data.subscription.unsubscribe();
    };
  }, []);

  const flush = useCallback(() => void flushOutbox(supabaseBrowser(), userId), [userId]);
  useEffect(() => {
    flush();
    const vis = () => document.visibilityState === 'visible' && flush();
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [flush]);
  useEffect(() => {
    if (online) flush();
  }, [online, flush]);
  // short retry timer while something is waiting (a flush that is not due yet does nothing)
  useEffect(() => {
    if (!queued) return;
    const t = setInterval(flush, 5000);
    return () => clearInterval(t);
  }, [queued, flush]);

  if (online && !queued) return null;
  const waiting = queued ? `${queued} message${queued > 1 ? 's' : ''} will be sent when you are back online.` : '';
  return (
    <p
      role="status"
      aria-live="polite"
      className={`safe-top flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-center text-xs ${online ? 'bg-accent/15 text-main' : 'bg-danger/15 text-danger'}`}
    >
      {online ? <Send className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{online ? `Sending ${queued} queued message${queued > 1 ? 's' : ''}...` : `You are offline. Showing saved messages. ${waiting}`.trim()}</span>
    </p>
  );
}
