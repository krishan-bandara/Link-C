// Outbox for TEXT messages written while offline (or when a send fails on the network).
// Stored in IndexedDB, shown as pending bubbles, sent in order when the connection is back.
//
// Duplicate safety: the messages table has no client id, so a request whose answer was lost might already have
// stored the message. Such an item is marked `ambiguous`; before it is sent again we re-read the recent own
// messages of that chat and, if a copy is there, we drop the queued item instead of sending it twice. An item is
// only removed after a confirmed response. (A client-supplied id + unique index would make this exact; see the report.)
import type { supabaseBrowser } from '@/lib/supabase/browser';
import { MSG_COLS, type Msg } from '@/lib/chat/types';
import { dbAll, dbDelete, dbGet, dbPut } from './db';
import { OUTBOX_MAX, OUTBOX_MAX_AGE_MS, backoffMs, classifyError, findDuplicate, pickNext, sortOutbox, type OutboxItem } from './logic';
import { reportNetworkFailure, reportNetworkOk } from './status';

type Client = ReturnType<typeof supabaseBrowser>;

export type { OutboxItem };
export const OUTBOX_EVENT = 'lc-outbox'; // the queue changed
export const OUTBOX_SENT_EVENT = 'lc-outbox-sent'; // detail: { item, msg }

let seq = 0;
const changed = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

export async function listOutbox(userId: string, conversationId?: string): Promise<OutboxItem[]> {
  const all = await dbAll<OutboxItem>('outbox');
  return sortOutbox(all.filter((i) => i.userId === userId && (!conversationId || i.conversationId === conversationId)));
}

/** Queues a text message. Returns null when it could not be stored (no IndexedDB, or the queue is full). */
export async function enqueue(p: { userId: string; conversationId: string; body: string; replyTo: string | null; ambiguous: boolean }): Promise<OutboxItem | null> {
  if ((await dbAll<OutboxItem>('outbox')).length >= OUTBOX_MAX) return null;
  const now = Date.now();
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    userId: p.userId,
    conversationId: p.conversationId,
    body: p.body,
    replyTo: p.replyTo,
    createdAt: now,
    seq: seq++,
    status: 'queued',
    attempts: p.ambiguous ? 1 : 0,
    ambiguous: p.ambiguous,
    nextAt: p.ambiguous ? now + backoffMs(0) : 0,
    error: null,
  };
  if (!(await dbPut('outbox', item))) return null;
  changed();
  return item;
}

async function patch(id: string, p: Partial<OutboxItem>) {
  const cur = await dbGet<OutboxItem>('outbox', id);
  if (cur) await dbPut('outbox', { ...cur, ...p });
  changed();
}

export async function deleteItem(id: string): Promise<void> {
  await dbDelete('outbox', id);
  changed();
}

/** "Tap to retry" on a failed message. */
export async function retryItem(id: string): Promise<void> {
  await patch(id, { status: 'queued', nextAt: 0, error: null });
}

function emitSent(item: OutboxItem, msg: Msg) {
  window.dispatchEvent(new CustomEvent(OUTBOX_SENT_EVENT, { detail: { item, msg } }));
}

type Step = 'continue' | 'stop';

async function sendOne(supabase: Client, item: OutboxItem, claimed: Set<string>): Promise<Step> {
  const online = navigator.onLine;
  const retryLater = async (e: { message?: string; status?: number; code?: string }): Promise<Step> => {
    const kind = classifyError(e, online);
    if (kind === 'auth') {
      await patch(item.id, { status: 'failed', error: 'Your session ended. Sign in again, then tap to retry.' });
      return 'continue';
    }
    if (kind === 'network') reportNetworkFailure();
    await patch(item.id, { attempts: item.attempts + 1, nextAt: Date.now() + backoffMs(item.attempts) });
    return 'stop';
  };

  try {
    if (item.ambiguous) {
      // an earlier request may have reached the server: look for the copy before sending again
      const since = new Date(item.createdAt - 5 * 60_000).toISOString();
      const { data, error } = await supabase
        .from('messages')
        .select(MSG_COLS)
        .eq('conversation_id', item.conversationId)
        .eq('sender_id', item.userId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return await retryLater(error); // cannot verify, so do not risk a duplicate
      reportNetworkOk();
      const dup = findDuplicate((data ?? []) as Msg[], item, claimed);
      if (dup) {
        claimed.add(dup.id);
        await dbDelete('outbox', item.id);
        changed();
        emitSent(item, dup);
        return 'continue';
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: item.conversationId, sender_id: item.userId, body: item.body, ...(item.replyTo ? { reply_to: item.replyTo } : {}) })
      .select(MSG_COLS)
      .single();
    if (error) {
      const kind = classifyError(error, online);
      if (kind === 'network') {
        // the request may or may not have arrived
        await patch(item.id, { ambiguous: true });
        return await retryLater(error);
      }
      if (kind === 'auth' || kind === 'rate') return await retryLater(error);
      await patch(item.id, { status: 'failed', error: 'Not sent. Tap to retry or delete.' });
      return 'continue';
    }
    reportNetworkOk();
    claimed.add((data as Msg).id);
    await dbDelete('outbox', item.id);
    changed();
    emitSent(item, data as Msg);
    return 'continue';
  } catch {
    // thrown instead of returned: treat as a network failure with unknown outcome
    await patch(item.id, { ambiguous: true });
    return await retryLater({ message: 'Failed to fetch' });
  }
}

let flushing = false;

async function doFlush(supabase: Client, userId: string): Promise<void> {
  const claimed = new Set<string>();
  for (let guard = 0; guard < OUTBOX_MAX + 5; guard++) {
    const items = await listOutbox(userId);
    // never send a very old message behind the person's back
    for (const it of items) {
      if (it.status === 'queued' && Date.now() - it.createdAt > OUTBOX_MAX_AGE_MS) await patch(it.id, { status: 'failed', error: 'Not sent. Tap to retry or delete.' });
    }
    const next = pickNext(await listOutbox(userId), Date.now());
    if (!next) return;
    if ((await sendOne(supabase, next, claimed)) === 'stop') return;
  }
}

/** Sends what is due, in order. Safe to call often and from several tabs at once (one flush at a time). */
export async function flushOutbox(supabase: Client, userId: string): Promise<void> {
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) return;
  flushing = true;
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) await locks.request('lc-outbox-flush', { ifAvailable: true }, async (lock) => (lock ? doFlush(supabase, userId) : undefined));
    else await doFlush(supabase, userId);
  } finally {
    flushing = false;
  }
}
