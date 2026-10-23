import { describe, expect, it } from 'vitest';
import { quoteLabel } from '../src/lib/chat/reply';
import type { Media, Msg } from '../src/lib/chat/types';

const msg = (o: Partial<Msg>): Msg => ({ id: 'm', conversation_id: 'c', sender_id: 's', body: '', type: 'text', sticker_id: null, reply_to: null, created_at: '', delivered_at: null, read_at: null, ...o });
const med = (o: Partial<Media>): Media => ({ id: 'x', message_id: 'm', conversation_id: 'c', sender_id: 's', kind: 'image', mime: 'image/jpeg', size_bytes: 1, mode: 'normal', timer_seconds: null, viewed_at: null, deleted_at: null, expires_at: null, created_at: '', ...o });

describe('quoteLabel', () => {
  it('labels every media kind', () => {
    const m = msg({ type: 'media' });
    expect(quoteLabel(m, med({ kind: 'image' }))).toBe('Photo');
    expect(quoteLabel(m, med({ kind: 'video' }))).toBe('Video');
    expect(quoteLabel(m, med({ kind: 'audio' }))).toBe('Voice message');
    expect(quoteLabel(m, undefined)).toBe('Photo');
  });
  it('never reveals snaps', () => {
    const m = msg({ type: 'media' });
    expect(quoteLabel(m, med({ mode: 'once' }))).toBe('Snap');
    expect(quoteLabel(m, med({ mode: 'timed', kind: 'video' }))).toBe('Snap');
  });
  it('handles stickers and text', () => {
    expect(quoteLabel(msg({ type: 'sticker' }), undefined)).toBe('Sticker');
    expect(quoteLabel(msg({ body: '  hi   there ' }), undefined)).toBe('hi there');
    expect(quoteLabel(msg({ body: 'a'.repeat(100) }), undefined)).toBe(`${'a'.repeat(80)}…`);
  });
});
