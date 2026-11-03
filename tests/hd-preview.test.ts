import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertImageWithinLimits, isHdSize, makeHdPreview } from '@/lib/image-preview';

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

  it('exactly 2048 px gives no preview, 2049 does', async () => {
    expect(await makeHdPreview(await make('e2048.jpg', 2048, 100), path.join(dir, 'p1'))).toBeNull();
    expect(await makeHdPreview(await make('e2049.jpg', 2049, 100), path.join(dir, 'p2'))).not.toBeNull();
  });

  it('portrait photo with only the height above the limit gets a preview', async () => {
    const out = path.join(dir, 'portrait-preview');
    expect(await makeHdPreview(await make('portrait.jpg', 1500, 3000), out)).not.toBeNull();
    const meta = await sharp(out).metadata();
    expect(meta.height).toBe(1280);
    expect(meta.width!).toBeLessThanOrEqual(1280);
  });

  it('throws cleanly on non-image input', async () => {
    const p = path.join(dir, 'not-image.bin');
    await writeFile(p, Buffer.from('this is not an image at all'));
    await expect(makeHdPreview(p, path.join(dir, 'x'))).rejects.toThrow();
    await expect(assertImageWithinLimits(p)).rejects.toThrow();
  });

  it('strips EXIF/GPS from clean and preview output', async () => {
    const src = path.join(dir, 'gps.jpg');
    await sharp({ create: { width: 3000, height: 2200, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .withExif({ IFD0: { Copyright: 'secret' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '6/1 55/1 0/1' } })
      .jpeg()
      .toFile(src);
    expect((await sharp(src).metadata()).exif).toBeDefined();
    const clean = path.join(dir, 'gps-clean');
    await sharp(src).rotate().jpeg({ quality: 90 }).toFile(clean);
    const prev = path.join(dir, 'gps-prev');
    expect(await makeHdPreview(clean, prev)).not.toBeNull();
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect((await sharp(prev).metadata()).exif).toBeUndefined();
  });

  it('rejects images above 4096 px, accepts exactly 4096', async () => {
    await expect(assertImageWithinLimits(await make('w4097.jpg', 4097, 10))).rejects.toThrow(/too large/);
    await expect(assertImageWithinLimits(await make('h4097.jpg', 10, 4097))).rejects.toThrow(/too large/);
    await expect(assertImageWithinLimits(await make('ok4096.jpg', 4096, 10))).resolves.toBeUndefined();
  });
});
