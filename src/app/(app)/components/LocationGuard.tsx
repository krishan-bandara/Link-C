'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { SHARE_COLS, type LocationShare } from '@/lib/chat/types';
import { holdAlive } from '@/lib/idle-client';

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res;
}

/**
 * Sharer side of location sharing, mounted for the whole signed-in app:
 * shows the consent prompt, the persistent "sharing" banner, and runs geolocation only while a share is active.
 */
export default function LocationGuard({ me }: { me: string }) {
  const [share, setShare] = useState<LocationShare | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSent = useRef(0);

  const consider = useCallback(
    (s: LocationShare) => {
      if (s.sharer_id !== me) return;
      setShare((cur) => {
        if (s.status === 'requested' || s.status === 'active') return s;
        return cur && cur.id === s.id ? null : cur;
      });
    },
    [me],
  );

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('location_shares')
        .select(SHARE_COLS)
        .eq('sharer_id', me)
        .in('status', ['requested', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) consider(data as LocationShare);
    })();
    let ch: ReturnType<typeof supabase.channel> | undefined;
    void (async () => {
      // Realtime must know who we are before subscribing, otherwise row level security treats us as anonymous.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase
        .channel(`loc:${me}`)
        // Realtime rejects a `sharer_id` filter on this table, so subscribe to everything the user is allowed to see
        // (row level security still applies) and let consider() keep only this user's shares.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'location_shares' }, (p) => {
          if (p.new && 'id' in p.new) consider(p.new as LocationShare);
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [me, consider]);

  // Resolve the requester's name.
  const requester = share?.requested_by;
  useEffect(() => {
    if (!requester || names[requester]) return;
    void supabaseBrowser()
      .from('profiles')
      .select('id,display_name')
      .eq('id', requester)
      .maybeSingle()
      .then(({ data }) => data && setNames((n) => ({ ...n, [data.id]: data.display_name })));
  }, [requester, names]);

  const active = share?.status === 'active' ? share : null;
  const shareId = active?.id;
  const expiresAt = active?.expires_at ? new Date(active.expires_at).getTime() : 0;

  // while the person is sharing their location (their own choice, with a visible banner) the session stays open
  useEffect(() => (shareId ? holdAlive() : undefined), [shareId]);

  const stop = useCallback(async (id: string) => {
    setShare(null);
    await post('/api/location/stop', { shareId: id }).catch(() => {});
  }, []);

  // Position watching, only while active; stops at expiry, on stop, and on unmount.
  useEffect(() => {
    if (!shareId) return;
    if (!('geolocation' in navigator)) {
      setError('Location is not available on this device.');
      void stop(shareId);
      return;
    }
    const expiry = setTimeout(() => void stop(shareId), Math.max(0, expiresAt - Date.now()));
    let pending: GeolocationPosition | null = null;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const send = async (pos: GeolocationPosition) => {
      lastSent.current = Date.now();
      pending = null;
      const res = await post('/api/location/update', {
        shareId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }).catch(() => null);
      if (res && res.status === 410) setShare(null);
    };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const wait = 10_000 - (Date.now() - lastSent.current);
        if (wait <= 0) return void send(pos);
        // Too soon: keep the newest position and send it when the 10 s window ends, so a move is never lost.
        pending = pos;
        if (!trailing) {
          trailing = setTimeout(() => {
            trailing = undefined;
            if (pending) void send(pending);
          }, wait);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission was denied, so sharing was stopped.');
          void stop(shareId);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    return () => {
      clearTimeout(expiry);
      clearTimeout(trailing);
      navigator.geolocation.clearWatch(watch);
    };
  }, [shareId, expiresAt, stop]);

  async function respond(action: 'accept' | 'decline', minutes?: 15 | 60 | 480) {
    if (!share) return;
    setBusy(true);
    setError(null);
    const res = await post('/api/location/respond', { shareId: share.id, action, minutes }).catch(() => null);
    setBusy(false);
    if (res && res.status === 409) {
      // The request was cancelled or already answered: drop the stale prompt instead of showing an error.
      setShare(null);
      return;
    }
    if (!res || !res.ok) {
      setError('That did not work. Please try again.');
      return;
    }
    if (action === 'decline') setShare(null);
    // Accepting: the realtime update flips the share to active.
    else {
      const j = (await res.json().catch(() => ({}))) as { expiresAt?: string };
      setShare((s) => (s ? { ...s, status: 'active', expires_at: j.expiresAt ?? s.expires_at, duration_minutes: minutes ?? null } : s));
    }
  }

  const knownName = share ? names[share.requested_by] : undefined;
  const name = knownName || 'The owner';
  const nameInline = knownName || 'the owner';

  if (!share && !error) return null;
  return (
    <div className="shrink-0">
      {error && (
        <p className="bg-danger px-3 py-2 text-sm text-white" role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      {share?.status === 'requested' && (
        <div className="safe-top border-b border-line bg-panel px-4 py-3" role="alertdialog" aria-label="Location request">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-accent" /> {name} would like to see your location
          </p>
          <p className="mt-0.5 text-xs text-muted">Nothing is shared unless you accept. You can stop at any time.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([15, 60, 480] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => void respond('accept', m)}
                className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-main disabled:opacity-50"
              >
                Accept {m === 15 ? '15 min' : m === 60 ? '1 hr' : '8 hr'}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond('decline')}
              className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm hover:bg-panel-2 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      )}
      {active && (
        <div className="safe-top flex items-center gap-2 bg-accent px-3 py-2 text-sm text-accent-ink" role="status">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Sharing your location with {nameInline} until{' '}
            {active.expires_at ? new Date(active.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
          </span>
          <button type="button" onClick={() => void stop(active.id)} className="min-h-11 shrink-0 rounded-lg bg-black/20 px-3 py-1 font-medium hover:bg-black/30">
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
