/** Tiny haptic tick, only on touch devices that support it. Never throws. */
export function buzz(ms = 10) {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches) return;
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
