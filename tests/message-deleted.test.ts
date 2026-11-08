import { describe, expect, it } from 'vitest';
import { canEdit } from '@/lib/chat/edit';
import { quoteKind, quoteLabel } from '@/lib/chat/reply';
import { MSG_COLS, type Msg } from '@/lib/chat/types';

const base: Msg = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'me',
  body: 'secret text',
  type: 'text',
  sticker_id: null,
  reply_to: null,
  created_at: new Date().toISOString(),
  delivered_at: null,
  read_at: null,
};

describe('message deleted for everyone', () => {
  it('cannot be edited', () => {
    expect(canEdit(base, 'me')).toBe(true);
    expect(canEdit({ ...base, deleted_at: new Date().toISOString() }, 'me')).toBe(false);
  });
  it('a reply quote shows the notice, never the old content', () => {
    const gone = { ...base, body: '', deleted_at: new Date().toISOString() };
    expect(quoteLabel(gone, undefined)).toBe('This message was deleted');
    expect(quoteKind({ ...gone, type: 'media' }, undefined)).toBe('text');
    expect(quoteLabel({ ...gone, type: 'sticker' }, undefined)).toBe('This message was deleted');
  });
  it('is part of the columns the chat loads (and migration 35 grants it)', () => {
    expect(MSG_COLS.split(',')).toContain('deleted_at');
  });
});
