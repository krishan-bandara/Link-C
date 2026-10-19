// Login lockout backed by the login_attempts table. The key is sha256(lower(email)), so unknown emails are
// counted exactly like real ones and nothing reveals whether an account exists.
import { adminClient } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/crypto';
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILS } from '@/lib/auth-policy';

export type AttemptRow = { fails: number; locked_until: string | null } | null;

export const emailKey = (email: string): string => sha256(email.trim().toLowerCase());

/** Pure: is this row locked at `now`, and for how long? */
export function lockState(row: AttemptRow, now = Date.now()): { locked: boolean; retryAfterSeconds: number } {
  if (!row?.locked_until) return { locked: false, retryAfterSeconds: 0 };
  const left = new Date(row.locked_until).getTime() - now;
  return left > 0 ? { locked: true, retryAfterSeconds: Math.ceil(left / 1000) } : { locked: false, retryAfterSeconds: 0 };
}

/** Pure: the row to store after one more wrong password. A failure after an expired lock starts again at 1. */
export function nextFailure(
  row: AttemptRow,
  now = Date.now(),
  maxFails = LOGIN_MAX_FAILS,
  lockMinutes = LOGIN_LOCK_MINUTES,
): { fails: number; locked_until: string | null } {
  const expired = !!row?.locked_until && new Date(row.locked_until).getTime() <= now;
  const fails = (expired ? 0 : (row?.fails ?? 0)) + 1;
  return {
    fails,
    locked_until: fails >= maxFails ? new Date(now + lockMinutes * 60_000).toISOString() : null,
  };
}

async function readRow(key: string): Promise<AttemptRow> {
  const { data } = await adminClient().from('login_attempts').select('fails,locked_until').eq('email_hash', key).maybeSingle();
  return data ?? null;
}

export async function getLock(email: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  return lockState(await readRow(emailKey(email)));
}

/**
 * Counts this attempt BEFORE the password is checked (one atomic database step), so many parallel guesses
 * cannot all slip under the limit. Clear with clearFailures() after a correct password.
 */
export async function reserveAttempt(email: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await adminClient().rpc('reserve_login_attempt', {
    p_key: emailKey(email),
    p_max: LOGIN_MAX_FAILS,
    p_lock_minutes: LOGIN_LOCK_MINUTES,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; locked_until: string | null };
  const { retryAfterSeconds } = lockState({ fails: 0, locked_until: row.locked_until });
  return { allowed: !!row.allowed, retryAfterSeconds };
}

export async function registerFailure(email: string): Promise<void> {
  const key = emailKey(email);
  // housekeeping: forget attempts older than a day (cheap, runs on about 1 in 20 failures)
  if (Math.random() < 0.05) {
    await adminClient().from('login_attempts').delete().lt('updated_at', new Date(Date.now() - 86_400_000).toISOString());
  }
  const next = nextFailure(await readRow(key));
  await adminClient()
    .from('login_attempts')
    .upsert({ email_hash: key, ...next, updated_at: new Date().toISOString() }, { onConflict: 'email_hash' });
}

export async function clearFailures(email: string): Promise<void> {
  await adminClient().from('login_attempts').delete().eq('email_hash', emailKey(email));
}
