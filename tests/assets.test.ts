import { describe, expect, it } from 'vitest';
import { downloadName, extForMime, parseEmoji, readBodyCapped } from '../src/lib/assets';

describe('extForMime / downloadName', () => {
  it('maps known mimes', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('video/webm')).toBe('webm');
    expect(extForMime('text/html')).toBe('bin');
  });
  it('uses the first 8 chars of the id', () => {
    expect(downloadName('12345678-aaaa-bbbb-cccc-1234567890ab', 'video/mp4')).toBe('link-c-12345678.mp4');
  });
});

describe('parseEmoji', () => {
  it('accepts emoji, trims, and treats blank as null', () => {
    expect(parseEmoji(' 😀 ')).toBe('😀');
    expect(parseEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(parseEmoji('')).toBeNull();
    expect(parseEmoji(null)).toBeNull();
  });
  it('rejects too long text and control characters', () => {
    expect(() => parseEmoji('x'.repeat(17))).toThrow();
    expect(() => parseEmoji('a\u0000b')).toThrow();
  });
});

describe('readBodyCapped', () => {
  const req = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request('http://x/', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
  it('reads a body within the cap', async () => {
    expect((await readBodyCapped(req(Buffer.alloc(10, 1)), 10)).length).toBe(10);
  });
  it('rejects by content-length and by streamed size with 413', async () => {
    await expect(readBodyCapped(req('x', { 'content-length': '999' }), 10)).rejects.toMatchObject({ status: 413 });
    await expect(readBodyCapped(req(Buffer.alloc(11)), 10)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects an empty body', async () => {
    await expect(readBodyCapped(req(''), 10)).rejects.toMatchObject({ status: 400 });
  });
});
