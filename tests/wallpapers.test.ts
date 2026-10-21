import { describe, expect, it } from 'vitest';
import { effectiveWallpaper, wallpaperStyle, wallpaperUrl } from '../src/lib/wallpapers';
import { parseConversationParam } from '../src/lib/assets';

const ID = '12345678-aaaa-4bbb-8ccc-1234567890ab';

describe('wallpaperUrl', () => {
  it('uses the default endpoint without a conversation', () => {
    expect(wallpaperUrl('v1')).toBe('/api/wallpaper?v=v1');
  });
  it('adds the conversation for a per-chat picture', () => {
    expect(wallpaperUrl('v1', ID)).toBe(`/api/wallpaper?conversation=${ID}&v=v1`);
    expect(wallpaperStyle('custom', null, false, 'v1', ID).backgroundImage).toContain(`conversation=${ID}`);
  });
});

describe('effectiveWallpaper', () => {
  const def = { kind: 'preset', preset: 'doodle', assetId: null };
  it('falls back to the default without an override', () => {
    expect(effectiveWallpaper(null, def)).toEqual({ ...def, own: false });
  });
  it('prefers the chat override', () => {
    const chat = { kind: 'none', preset: null, assetId: null };
    expect(effectiveWallpaper(chat, def)).toEqual({ ...chat, own: true });
  });
});

describe('parseConversationParam', () => {
  it('returns null when absent', () => {
    expect(parseConversationParam('http://x/api/wallpaper?v=1')).toBeNull();
  });
  it('accepts a uuid and rejects anything else', () => {
    expect(parseConversationParam(`http://x/api/wallpaper?conversation=${ID}`)).toBe(ID);
    expect(() => parseConversationParam('http://x/?conversation=../etc')).toThrow();
  });
});
