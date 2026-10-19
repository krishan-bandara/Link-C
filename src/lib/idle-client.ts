'use client';

/**
 * Things that must keep the session alive even without touching the screen: an active call, an upload in
 * progress, an accepted location share. Call the returned function to release the hold.
 */
const holds = new Set<symbol>();

export function holdAlive(): () => void {
  const id = Symbol('hold');
  holds.add(id);
  return () => {
    holds.delete(id);
  };
}

export const isHeld = () => holds.size > 0;

/** Our own redirects (auto sign-out) must not trigger the "Leave site?" box. Call right before them. */
let leaving = false;
export const allowLeave = () => {
  leaving = true;
};
export const isLeaveAllowed = () => leaving;

/** Tell the idle guard that the user did something (also used right after signing in). */
export async function reportActivity(): Promise<boolean> {
  try {
    const r = await fetch('/api/activity', { method: 'POST', cache: 'no-store', credentials: 'same-origin' });
    return r.ok;
  } catch {
    return false;
  }
}
