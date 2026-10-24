import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({}) }));
vi.mock('@/lib/storage', () => ({ dataDir: () => '', mediaStore: () => ({}), storeFor: () => ({}) }));

import { normalise } from '@/lib/assets';

/** Animated webp with `frames` solid-colour frames of w x h. */
async function animatedWebp(frames: number, w: number, h: number): Promise<Buffer> {
  const imgs: Buffer[] = [];
  for (let f = 0; f < frames; f++) {
    const c = (f * 40) % 256;
    imgs.push(await sharp({ create: { width: w, height: h, channels: 3, background: { r: c, g: 50, b: 100 } } }).png().toBuffer());
  }
  return sharp(imgs, { join: { animated: true } }).webp({ effort: 0, quality: 30 }).toBuffer();
}

async function pngBuf(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe('normalise (sticker branch)', () => {
  it('keeps an animated webp animated, resized to <=256, as image/webp', async () => {
    const input = await animatedWebp(4, 400, 300);
    expect((await sharp(input, { animated: true }).metadata()).pages).toBe(4);
    const out = await normalise('sticker', input);
    expect(out.mime).toBe('image/webp');
    const meta = await sharp(out.data, { animated: true }).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.pages).toBe(4);
    expect(meta.width).toBeLessThanOrEqual(256);
    expect(meta.pageHeight).toBeLessThanOrEqual(256);
  });

  it('rejects an animation with more than 300 frames', async () => {
    const input = await animatedWebp(301, 8, 8);
    await expect(normalise('sticker', input)).rejects.toMatchObject({ status: 415 });
  });

  it('turns a static png into a 512x512 webp', async () => {
    const out = await normalise('sticker', await pngBuf(100, 50));
    expect(out.mime).toBe('image/webp');
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('keeps only the first frame for non-sticker kinds', async () => {
    const input = await animatedWebp(4, 400, 300);
    const out = await normalise('avatar', input);
    expect(out.mime).toBe('image/webp');
    const meta = await sharp(out.data, { animated: true }).metadata();
    expect(meta.pages ?? 1).toBe(1);
    expect(meta.width).toBe(384);
    expect(meta.height).toBe(384);
  });
});
