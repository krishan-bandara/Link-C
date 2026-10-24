// Offline read cache: the conversation list and the last messages of each chat, kept in IndexedDB as the person
// browses and read by public/offline.js when there is no connection.
// Privacy rules: bounded in size and age, never holds media (so no snaps), wiped on logout / idle logout / another user.
import type { ConversationItem, Msg } from '@/lib/chat/types';
import { dbAll, dbClearAll, dbDelete, dbGet, dbKeys, dbPut, openDb } from './db';
import { CACHE_MAX_CONVERSATIONS, CACHE_MAX_MESSAGES, isStale, pruneIds, sanitizeMessage, trimMessages } from './logic';

type ConvRecord = { userId: string; savedAt: number; items: ConversationItem[] };
type MsgRecord = { userId: string; savedAt: number; messages: Msg[] };

let activeUser: string | null = null;
let epoch = 0; // bumped by every wipe, so a save that started before a logout cannot write afterwards

/** Binds the cache to the signed-in person. Data of a different person is wiped first. Call once when the app opens. */
export async function setActiveUser(userId: string): Promise<void> {
  const e = epoch;
  const stored = await dbGet<string>('meta', 'user');
  if (e !== epoch) return;
  if (stored && stored !== userId) await clearOfflineData();
  if (await dbPut('meta', userId, 'user')) activeUser = userId;
  void prune();
}

/** Deletes ALL offline data (cached chats, queued messages, owner marker). Safe to call at any time. */
export async function clearOfflineData(): Promise<void> {
  epoch += 1;
  activeUser = null;
  await dbClearAll();
  try {
    window.dispatchEvent(new Event('lc-offline-cleared'));
  } catch {
    /* no window */
  }
}

export async function saveConversations(items: ConversationItem[]): Promise<void> {
  const user = activeUser;
  const e = epoch;
  if (!user) return;
  const rec: ConvRecord = { userId: user, savedAt: Date.now(), items: items.slice(0, CACHE_MAX_CONVERSATIONS) };
  await openDb();
  if (e !== epoch) return;
  await dbPut('convs', rec, 'all');
}

export async function saveMessages(conversationId: string, messages: Msg[]): Promise<void> {
  const user = activeUser;
  const e = epoch;
  if (!user) return;
  const rec: MsgRecord = { userId: user, savedAt: Date.now(), messages: trimMessages(messages, CACHE_MAX_MESSAGES).map(sanitizeMessage) };
  await openDb();
  if (e !== epoch) return;
  await dbPut('msgs', rec, conversationId);
}

export async function loadConversations(userId: string): Promise<ConversationItem[] | null> {
  const rec = await dbGet<ConvRecord>('convs', 'all');
  if (!rec || rec.userId !== userId || isStale(rec.savedAt, Date.now())) return null;
  return rec.items;
}

export async function loadMessages(userId: string, conversationId: string): Promise<Msg[] | null> {
  const rec = await dbGet<MsgRecord>('msgs', conversationId);
  if (!rec || rec.userId !== userId || isStale(rec.savedAt, Date.now())) return null;
  return rec.messages;
}

/** Removes stale chats and the oldest ones beyond the cap. */
async function prune(): Promise<void> {
  const keys = await dbKeys('msgs');
  const records: { key: string; savedAt: number }[] = [];
  for (const key of keys) {
    const rec = await dbGet<MsgRecord>('msgs', key);
    records.push({ key, savedAt: rec?.savedAt ?? 0 });
  }
  for (const key of pruneIds(records, Date.now())) await dbDelete('msgs', key);
  const conv = (await dbAll<ConvRecord>('convs'))[0];
  if (conv && isStale(conv.savedAt, Date.now())) await dbDelete('convs', 'all');
}
