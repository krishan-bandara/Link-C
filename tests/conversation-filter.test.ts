import { describe, expect, it } from 'vitest';
import { filterConversations } from '../src/lib/conversationFilter';
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
});
