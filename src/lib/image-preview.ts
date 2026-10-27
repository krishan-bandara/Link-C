import sharp from 'sharp';

/** Photos whose longer side is above this are "HD" (the standard upload is shrunk to 2048 px on the phone). */
export const HD_ABOVE_PX = 2048;
const PREVIEW_SIDE = 1280;

/** True when the longer side makes this an HD photo. */
export const isHdSize = (width: number, height: number) => Math.max(width, height) > HD_ABOVE_PX;

/**
 * For a clean, still image: reads its size and, when it is HD, writes a lighter WebP preview (1280 px) to `outPath`.
 * Returns null for animated or standard-size images (no preview needed).
 */
export async function makeHdPreview(cleanPath: string, outPath: string): Promise<{ hd: boolean; previewMime: string } | null> {
  const meta = await sharp(cleanPath, { limitInputPixels: 40_000_000 }).metadata();
  if ((meta.pages ?? 1) > 1 || !meta.width || !meta.height || !isHdSize(meta.width, meta.height)) return null;
  await sharp(cleanPath, { limitInputPixels: 40_000_000 })
    .resize({ width: PREVIEW_SIDE, height: PREVIEW_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(outPath);
  return { hd: true, previewMime: 'image/webp' };
}
