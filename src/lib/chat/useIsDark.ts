'use client';

import { useSyncExternalStore } from 'react';

function read() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mq.addEventListener('change', cb);
  return () => {
    obs.disconnect();
    mq.removeEventListener('change', cb);
  };
}

/** True when the effective theme is dark (data-theme on <html>, or the OS setting for 'system'). Dark is the default. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
