'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** false during server render and hydration, true afterwards. Use it for anything that depends on the clock or locale. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
