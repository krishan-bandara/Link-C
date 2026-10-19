import { describe, expect, it } from 'vitest';
import { isBigEmoji } from '../src/lib/chat/emoji';

describe('isBigEmoji', () => {
  it('counts 1 to 3 emoji', () => {
    for (const t of ['😀', '😂😂', '👍🏽', '❤️', '👨‍👩‍👧‍👦', '🇱🇰', '🇱🇰🇱🇰🇱🇰']) expect(isBigEmoji(t), t).toBe(true);
  });
  it('rejects 4 emoji, text, spaces and symbols that are not emoji', () => {
    for (const t of ['😀😀😀😀', 'hi😀', '😀 hi', '😀 😀', '©', '®', '™', '1', '', ' 😀']) expect(isBigEmoji(t), JSON.stringify(t)).toBe(false);
  });
});
