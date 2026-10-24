/** Pure helpers for the admin "Members health" page. No I/O, no clock reads: callers pass `now`. */

export type HealthStatus = 'active' | 'quiet' | 'inactive' | 'never';

export const QUIET_DAYS = 3;
export const INACTIVE_DAYS = 7;
const DAY_MS = 86_400_000;

type Ts = string | number | Date | null | undefined;

/** Parse a timestamp. Null, junk and the 1970 epoch placeholder (presence "never seen") all mean "no value". */
export function toMs(v: Ts): number | null {
  if (v === null || v === undefined || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime();
  if (!Number.isFinite(t) || t <= 0) return null;
  return t;
}

/** The later of last seen and last sign-in, or null if neither ever happened. */
export function lastActivityMs(lastSeen: Ts, lastSignIn: Ts): number | null {
  const a = toMs(lastSeen);
  const b = toMs(lastSignIn);
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Whole days since the last activity (floored, never negative), or null when there was none. */
export function daysSince(ms: number | null, now: number): number | null {
  if (ms === null) return null;
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

export type Health = { status: HealthStatus; daysSince: number | null; lastActivity: number | null };

/** Amber ("quiet") after 3 days, red ("inactive") after 7 days without activity. */
export function classify(lastSeen: Ts, lastSignIn: Ts, now: number): Health {
  const lastActivity = lastActivityMs(lastSeen, lastSignIn);
  const d = daysSince(lastActivity, now);
  if (d === null) return { status: 'never', daysSince: null, lastActivity: null };
  if (d >= INACTIVE_DAYS) return { status: 'inactive', daysSince: d, lastActivity };
  if (d >= QUIET_DAYS) return { status: 'quiet', daysSince: d, lastActivity };
  return { status: 'active', daysSince: d, lastActivity };
}

/** Needs the owner's attention: quiet, inactive or never signed in (disabled logins are on purpose, so excluded). */
export function needsAttention(status: HealthStatus, loginDisabled = false): boolean {
  return !loginDisabled && status !== 'active';
}

/** Active within the last 24 hours. */
export function activeToday(lastActivity: number | null, now: number): boolean {
  return lastActivity !== null && now - lastActivity < DAY_MS;
}

export function statusLabel(status: HealthStatus, days: number | null): string {
  if (status === 'active') return 'Active';
  if (status === 'quiet') return `Quiet ${days ?? QUIET_DAYS}d`;
  if (status === 'inactive') return 'Inactive 7d+';
  return 'Never signed in';
}

/** "2 hours ago", "3 days ago", "just now"; "never" for no value. */
export function relativeAgo(ms: number | null, now: number): string {
  if (ms === null) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(s / 3600);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(s / 86400);
  if (d < 60) return `${d} days ago`;
  return `${Math.floor(d / 30)} months ago`;
}

/** Exact time in Colombo, e.g. "25 Oct 2026, 14:05 (Colombo)". */
export function colomboExact(ms: number | null): string {
  if (ms === null) return 'Never';
  const t = new Date(ms).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${t} (Colombo)`;
}
