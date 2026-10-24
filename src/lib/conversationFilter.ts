import type { ConversationItem } from '@/lib/chat/types';

export type Filter = 'all' | 'unread' | 'online';

/** Filters the list by name text and by the chosen pill. Pure, so it can be unit tested. */
export function filterConversations(items: ConversationItem[], q: string, filter: Filter, online: Record<string, boolean>): ConversationItem[] {
  const n = q.trim().toLowerCase();
  return items.filter((c) => (!n || c.otherName.toLowerCase().includes(n)) && (filter === 'all' || (filter === 'unread' ? c.unread > 0 : !!online[c.id])));
}
