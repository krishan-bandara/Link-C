// Pure helpers for the offline feature (no browser APIs, unit tested in tests/offline.test.ts).
// Storage lives in db.ts / cache.ts / outbox.ts, which stay thin and call these.

export const CACHE_MAX_MESSAGES = 100; // per chat
export const CACHE_MAX_CONVERSATIONS = 60;
export const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // a cached chat not refreshed for 14 days is dropped
export const OUTBOX_MAX = 50; // queued text messages in total
export const OUTBOX_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // an unsent message older than this is not sent behind the person's back
export const DUPLICATE_WINDOW_MS = 15_000; // tolerance for device/server clock difference when looking for an already delivered copy

export type OutboxStatus = 'queued' | 'failed';

export type OutboxItem = {
  id: string; // random, local only
  userId: string;
  conversationId: string;
  body: string;
  replyTo: string | null;
  createdAt: number; // ms, when the person pressed send (= time of the first attempt)
  seq: number;
  status: OutboxStatus;
  attempts: number;
  /** true once a request was made and its outcome is unknown (the message may already be on the server) */
  ambiguous: boolean;
  nextAt: number; // not before this time (ms)
  error: string | null;
};

type Timed = { created_at: string; id: string };

export const byTime = (a: Timed, b: Timed) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** Keep the newest `max` messages, oldest first, one entry per id (the later entry wins). */
export function trimMessages<T extends Timed>(msgs: T[], max = CACHE_MAX_MESSAGES): T[] {
  const map = new Map<string, T>();
  for (const m of msgs) map.set(m.id, m);
  const all = [...map.values()].sort(byTime);
  return all.length > max ? all.slice(all.length - max) : all;
}

export function isStale(savedAt: number, now: number, maxAge = CACHE_MAX_AGE_MS): boolean {
  return !Number.isFinite(savedAt) || now - savedAt > maxAge || savedAt > now + 60_000;
}

/** Keys of cached records to delete: stale ones, then the oldest beyond `max`. */
export function pruneIds(records: { key: string; savedAt: number }[], now: number, max = CACHE_MAX_CONVERSATIONS, maxAge = CACHE_MAX_AGE_MS): string[] {
  const drop = new Set<string>();
  const live: { key: string; savedAt: number }[] = [];
  for (const r of records) {
    if (isStale(r.savedAt, now, maxAge)) drop.add(r.key);
    else live.push(r);
  }
  live.sort((a, b) => b.savedAt - a.savedAt);
  for (const r of live.slice(max)) drop.add(r.key);
  return [...drop];
}

/** What is allowed on disk for a message: media is never stored (no snaps, no view-once media), and its body is dropped. */
export function sanitizeMessage<T extends { type: string; body: string }>(m: T): T {
  return m.type === 'media' ? { ...m, body: '' } : m;
}

export function sameUser(cachedUserId: string | null | undefined, currentUserId: string): boolean {
  return !cachedUserId || cachedUserId === currentUserId;
}

// ---- outbox

export function sortOutbox(items: OutboxItem[]): OutboxItem[] {
  return items.slice().sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq || a.id.localeCompare(b.id));
}

/**
 * The next message to send. Order inside one chat is strict: nothing is sent behind a failed message or one that is
 * waiting for its retry time. Different chats do not block each other.
 */
export function pickNext(items: OutboxItem[], now: number): OutboxItem | null {
  const blocked = new Set<string>();
  for (const it of sortOutbox(items)) {
    if (blocked.has(it.conversationId)) continue;
    if (it.status === 'failed' || it.nextAt > now) {
      blocked.add(it.conversationId);
      continue;
    }
    return it;
  }
  return null;
}

export function backoffMs(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts));
}

export type ErrKind = 'network' | 'auth' | 'rate' | 'permanent';

/** Sorts a Supabase / fetch error into what the outbox should do about it. */
export function classifyError(err: { message?: string; status?: number; code?: string } | null | undefined, online: boolean): ErrKind {
  const msg = err?.message ?? '';
  if (/rate limit/i.test(msg)) return 'rate';
  if (
    err?.status === 401 ||
    err?.status === 403 ||
    err?.code === 'PGRST301' ||
    err?.code === 'PGRST303' ||
    err?.code === '42501' ||
    /jwt|not authenticated|invalid token|row-level security/i.test(msg)
  )
    return 'auth';
  if (
    !online ||
    err?.status === 0 ||
    err?.status === 502 ||
    err?.status === 503 ||
    err?.status === 504 ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|network connection|timed? ?out|aborted/i.test(msg)
  )
    return 'network';
  return 'permanent';
}

/**
 * Looks for a copy of a queued message that is already on the server (the answer to the earlier request was lost).
 * `claimed` holds ids that already belong to another queued message, so two identical texts do not match one copy.
 */
export function findDuplicate<T extends { id: string; sender_id: string; type: string; body: string; created_at: string; reply_to?: string | null }>(
  existing: T[],
  item: Pick<OutboxItem, 'userId' | 'body' | 'createdAt' | 'replyTo'>,
  claimed: Set<string> = new Set(),
  windowMs = DUPLICATE_WINDOW_MS,
): T | null {
  const sorted = existing.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const m of sorted) {
    if (m.sender_id !== item.userId || m.type !== 'text' || m.body !== item.body || claimed.has(m.id)) continue;
    if ((m.reply_to ?? null) !== item.replyTo) continue;
    const t = Date.parse(m.created_at);
    if (Number.isFinite(t) && t >= item.createdAt - windowMs) return m;
  }
  return null;
}
