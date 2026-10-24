import type { ConversationItem } from '@/lib/chat/types';
import type { ChatPref } from '@/lib/chatprefs';

export type Filter = 'all' | 'unread' | 'online' | 'favourites';

type Prefs = Record<string, ChatPref | undefined>;

/** Filters the list by name text and by the chosen pill. Pure, so it can be unit tested. */
export function filterConversations(items: ConversationItem[], q: string, filter: Filter, online: Record<string, boolean>, prefs: Prefs = {}): ConversationItem[] {
  const n = q.trim().toLowerCase();
  const byPill = (c: ConversationItem) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return c.unread > 0;
    if (filter === 'favourites') return !!prefs[c.id]?.starred;
    return !!online[c.id];
  };
  return items.filter((c) => (!n || c.otherName.toLowerCase().includes(n)) && byPill(c));
}

/** Starred chats first; everything else keeps its incoming order (stable). */
export function sortStarredFirst(items: ConversationItem[], prefs: Prefs): ConversationItem[] {
  if (!items.some((c) => prefs[c.id]?.starred)) return items;
  return [...items.filter((c) => prefs[c.id]?.starred), ...items.filter((c) => !prefs[c.id]?.starred)];
}
