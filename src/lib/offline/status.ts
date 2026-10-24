'use client';
// Online status: the browser's online/offline events PLUS failed-request detection (a phone can say "online" while
// the connection is dead). While a failure is flagged, a cheap probe runs until the network answers again.
import { useSyncExternalStore } from 'react';

let failed = false;
let installed = false;
let probeTimer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine && !failed);

/** Asks the server for a tiny static file (no cookies needed, never cached). Any answer means the network works. */
export async function probeNow(): Promise<boolean> {
  try {
    const res = await fetch(`/icon-192.png?probe=${Date.now()}`, { method: 'HEAD', cache: 'no-store', credentials: 'omit' });
    void res;
    reportNetworkOk();
    return true;
  } catch {
    return false;
  }
}

export function reportNetworkFailure(): void {
  if (failed) return;
  failed = true;
  emit();
  clearInterval(probeTimer);
  probeTimer = setInterval(() => void probeNow(), 8000);
}

export function reportNetworkOk(): void {
  if (!failed) return;
  failed = false;
  clearInterval(probeTimer);
  emit();
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('offline', emit);
  window.addEventListener('online', () => {
    emit();
    if (failed) void probeNow();
  });
}

function subscribe(cb: () => void) {
  install();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** true while the connection works; false when the browser is offline or a request recently failed. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
