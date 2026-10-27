import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isHdSize, makeHdPreview } from '@/lib/image-preview';

let dir: string;
beforeAll(async () => {
  sharp.cache(false); // otherwise sharp keeps files open and Windows cannot delete them
  dir = await mkdtemp(path.join(os.tmpdir(), 'hd-'));
});
afterAll(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const make = async (name: string, w: number, h: number) => {
  const p = path.join(dir, name);
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toFile(p);
  return p;
};

describe('HD preview', () => {
  it('treats only photos above 2048 px as HD', () => {
    expect(isHdSize(2048, 1536)).toBe(false);
    expect(isHdSize(1536, 3000)).toBe(true);
  });

  it('makes a 1280 px WebP preview for an HD photo', async () => {
    const src = await make('big.jpg', 4000, 3000);
    const out = path.join(dir, 'big-preview');
    expect(await makeHdPreview(src, out)).toEqual({ hd: true, previewMime: 'image/webp' });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(1280);
  });

  it('makes no preview for a standard-size photo', async () => {
    const src = await make('small.jpg', 2000, 1500);
    expect(await makeHdPreview(src, path.join(dir, 'small-preview'))).toBeNull();
  });
});
