'use client';

import { useEffect, useState } from 'react';

type State = 'checking' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Switch for push notifications on THIS phone or browser. Asks the browser for permission only when turned on. */
export default function PushToggle() {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      if (isIos() && !isStandalone()) return live && setState('needs-install');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return live && setState('unsupported');
      if (Notification.permission === 'denied') return live && setState('blocked');
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (live) setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
      } catch {
        if (live) setState('unsupported');
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'blocked' : 'off');
        return;
      }
      const k = (await (await fetch('/api/push/key', { cache: 'no-store' })).json()) as { key?: string };
      if (!k.key) throw new Error('not configured');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(k.key) }));
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {});
        throw new Error('save failed');
      }
      setState('on');
    } catch {
      setError('Could not turn notifications on. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
    } catch {
      setError('Could not turn notifications off. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const hint =
    state === 'needs-install'
      ? 'On iPhone, first tap Share, then Add to Home Screen, and open Link-C from the new icon. Then come back here.'
      : state === 'unsupported'
        ? 'This browser cannot show notifications.'
        : state === 'blocked'
          ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.'
          : 'Get a notification on this phone when a message arrives while you are away, even if the app is closed.';
  const usable = state === 'off' || state === 'on';

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p id="push-label" className="font-medium">
          Phone notifications
        </p>
        <p id="push-desc" className="text-sm text-muted">
          {hint}
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={state === 'on'}
        aria-labelledby="push-label"
        aria-describedby="push-desc"
        disabled={!usable || busy}
        onClick={() => void (state === 'on' ? turnOff() : turnOn())}
        className="ui-switch mt-1 disabled:opacity-50"
      >
        <span />
      </button>
    </div>
  );
}
