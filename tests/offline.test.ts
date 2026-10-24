import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  classifyError,
  findDuplicate,
  isStale,
  pickNext,
  pruneIds,
  sameUser,
  sanitizeMessage,
  sortOutbox,
  trimMessages,
  type OutboxItem,
} from '@/lib/offline/logic';

const item = (o: Partial<OutboxItem>): OutboxItem => ({
  id: 'i',
  userId: 'me',
  conversationId: 'c1',
  body: 'hi',
  replyTo: null,
  createdAt: 1000,
  seq: 0,
  status: 'queued',
  attempts: 0,
  ambiguous: false,
  nextAt: 0,
  error: null,
  ...o,
});

const msg = (id: string, created_at: string, o: Record<string, unknown> = {}) => ({
  id,
  sender_id: 'me',
  type: 'text',
  body: 'hi',
  created_at,
  reply_to: null as string | null,
  ...o,
});

describe('trimMessages', () => {
  it('keeps the newest N, oldest first, without duplicates', () => {
    const list = [msg('3', '2026-01-03'), msg('1', '2026-01-01'), msg('2', '2026-01-02'), msg('2', '2026-01-02', { body: 'edited' })];
    const out = trimMessages(list, 2);
    expect(out.map((m) => m.id)).toEqual(['2', '3']);
    expect(out[0].body).toBe('edited');
  });
  it('orders equal timestamps by id', () => {
    expect(trimMessages([msg('b', 't'), msg('a', 't')]).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('cache age and pruning', () => {
  const day = 86_400_000;
  it('isStale', () => {
    expect(isStale(0, 15 * day)).toBe(true);
    expect(isStale(10 * day, 15 * day)).toBe(false);
    expect(isStale(Number.NaN, 1)).toBe(true);
    expect(isStale(100 * day, 1 * day)).toBe(true); // from the future
  });
  it('drops stale records, then the oldest beyond the cap', () => {
    const now = 100 * day;
    const recs = [
      { key: 'old', savedAt: now - 20 * day },
      { key: 'a', savedAt: now - 3 },
      { key: 'b', savedAt: now - 2 },
      { key: 'c', savedAt: now - 1 },
    ];
    expect(pruneIds(recs, now, 2).sort()).toEqual(['a', 'old']);
  });
});

describe('privacy helpers', () => {
  it('never keeps media bodies', () => {
    expect(sanitizeMessage({ type: 'media', body: 'Snap' }).body).toBe('');
    expect(sanitizeMessage({ type: 'text', body: 'Snap' }).body).toBe('Snap');
  });
  it('detects a different user', () => {
    expect(sameUser('a', 'a')).toBe(true);
    expect(sameUser('a', 'b')).toBe(false);
    expect(sameUser(null, 'b')).toBe(true);
  });
});

describe('outbox ordering', () => {
  it('sorts by time then sequence', () => {
    const out = sortOutbox([item({ id: 'c', createdAt: 5 }), item({ id: 'b', createdAt: 1, seq: 2 }), item({ id: 'a', createdAt: 1, seq: 1 })]);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
  it('picks the oldest due message', () => {
    expect(pickNext([item({ id: 'b', createdAt: 2 }), item({ id: 'a', createdAt: 1 })], 10)?.id).toBe('a');
  });
  it('does not send behind a failed message of the same chat, but other chats go on', () => {
    const items = [item({ id: 'a', createdAt: 1, status: 'failed' }), item({ id: 'b', createdAt: 2 }), item({ id: 'c', createdAt: 3, conversationId: 'c2' })];
    expect(pickNext(items, 10)?.id).toBe('c');
  });
  it('waits for the retry time, in order', () => {
    const items = [item({ id: 'a', createdAt: 1, nextAt: 50 }), item({ id: 'b', createdAt: 2 })];
    expect(pickNext(items, 10)).toBeNull();
    expect(pickNext(items, 60)?.id).toBe('a');
  });
  it('returns null for an empty queue', () => {
    expect(pickNext([], 1)).toBeNull();
  });
  it('backs off up to a minute', () => {
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(2)).toBe(8000);
    expect(backoffMs(20)).toBe(60_000);
  });
});

describe('classifyError', () => {
  it('network', () => {
    expect(classifyError({ message: 'TypeError: Failed to fetch' }, true)).toBe('network');
    expect(classifyError({ message: 'Load failed' }, true)).toBe('network');
    expect(classifyError({ message: 'anything' }, false)).toBe('network');
  });
  it('auth', () => {
    expect(classifyError({ message: 'JWT expired', code: 'PGRST301' }, true)).toBe('auth');
    expect(classifyError({ status: 401 }, true)).toBe('auth');
    expect(classifyError({ message: 'new row violates row-level security policy', code: '42501' }, true)).toBe('auth');
  });
  it('rate and permanent', () => {
    expect(classifyError({ message: 'rate limit exceeded' }, true)).toBe('rate');
    expect(classifyError({ message: 'insert or update violates foreign key constraint', code: '23503' }, true)).toBe('permanent');
  });
});

describe('findDuplicate', () => {
  const it1 = { userId: 'me', body: 'hi', createdAt: Date.parse('2026-01-01T10:00:00Z'), replyTo: null };
  it('finds a copy sent at about the same time', () => {
    const m = msg('x', '2026-01-01T10:00:02Z');
    expect(findDuplicate([m], it1)?.id).toBe('x');
  });
  it('ignores older messages with the same text, other senders, other types and other replies', () => {
    expect(findDuplicate([msg('old', '2026-01-01T09:00:00Z')], it1)).toBeNull();
    expect(findDuplicate([msg('o', '2026-01-01T10:00:02Z', { sender_id: 'them' })], it1)).toBeNull();
    expect(findDuplicate([msg('s', '2026-01-01T10:00:02Z', { type: 'sticker' })], it1)).toBeNull();
    expect(findDuplicate([msg('r', '2026-01-01T10:00:02Z', { reply_to: 'q' })], it1)).toBeNull();
    expect(findDuplicate([msg('b', '2026-01-01T10:00:02Z', { body: 'other' })], it1)).toBeNull();
  });
  it('does not let two identical queued messages claim the same copy', () => {
    const copies = [msg('x', '2026-01-01T10:00:02Z')];
    const claimed = new Set<string>();
    const first = findDuplicate(copies, it1, claimed);
    claimed.add(first!.id);
    expect(findDuplicate(copies, it1, claimed)).toBeNull();
  });
  it('picks the earliest copy first', () => {
    const copies = [msg('b', '2026-01-01T10:00:09Z'), msg('a', '2026-01-01T10:00:01Z')];
    expect(findDuplicate(copies, it1)?.id).toBe('a');
  });
});
