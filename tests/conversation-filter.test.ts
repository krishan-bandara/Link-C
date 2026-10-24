import { describe, expect, it } from 'vitest';
import { filterConversations, sortStarredFirst } from '../src/lib/conversationFilter';
import type { ConversationItem } from '../src/lib/chat/types';

const mk = (id: string, otherName: string, unread: number) => ({ id, otherName, unread }) as ConversationItem;
const items = [mk('a', 'Alice', 2), mk('b', 'Bob', 0), mk('c', 'Alicia', 0)];

describe('filterConversations', () => {
  it('returns everything for all + empty text', () => {
    expect(filterConversations(items, '  ', 'all', {})).toHaveLength(3);
  });
  it('filters by name text', () => {
    expect(filterConversations(items, 'ali', 'all', {}).map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('unread keeps only unread > 0', () => {
    expect(filterConversations(items, '', 'unread', {}).map((c) => c.id)).toEqual(['a']);
  });
  it('online uses the online map and combines with text', () => {
    expect(filterConversations(items, '', 'online', { b: true, c: true }).map((c) => c.id)).toEqual(['b', 'c']);
    expect(filterConversations(items, 'ali', 'online', { b: true, c: true }).map((c) => c.id)).toEqual(['c']);
  });
  it('favourites keeps only starred chats and combines with text', () => {
    const prefs = { a: { mutedUntil: null, starred: true }, c: { mutedUntil: null, starred: true }, b: { mutedUntil: null, starred: false } };
    expect(filterConversations(items, '', 'favourites', {}, prefs).map((c) => c.id)).toEqual(['a', 'c']);
    expect(filterConversations(items, 'alicia', 'favourites', {}, prefs).map((c) => c.id)).toEqual(['c']);
    expect(filterConversations(items, '', 'favourites', {})).toHaveLength(0);
  });
});

describe('sortStarredFirst', () => {
  it('moves starred chats to the top and keeps order otherwise', () => {
    const prefs = { c: { mutedUntil: null, starred: true } };
    expect(sortStarredFirst(items, prefs).map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
  it('returns the same list when nothing is starred', () => {
    expect(sortStarredFirst(items, {})).toBe(items);
  });
});
