import sharp from 'sharp';

/** Photos whose longer side is above this are "HD" (the standard upload is shrunk to 2048 px on the phone). */
export const HD_ABOVE_PX = 2048;
const PREVIEW_SIDE = 1280;
sharp.cache(false);

/** Hard server-side caps for uploaded photos. */
export const MAX_IMAGE_SIDE_PX = 4096;
export const MAX_IMAGE_PIXELS = Math.ceil(4096 * 4096 * 1.1);
export const MAX_ANIM_FRAMES = 300;

export class ImageLimitError extends Error {}

/** Reads the header only and rejects images that are too large (side, frames, total pixels). */
export async function assertImageWithinLimits(path: string): Promise<void> {
  const meta = await sharp(path, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false }).metadata();
  const w = meta.width ?? 0;
  const h = meta.pageHeight ?? meta.height ?? 0;
  const pages = meta.pages ?? 1;
  if (!w || !h) throw new ImageLimitError('This image could not be read');
  if (Math.max(w, h) > MAX_IMAGE_SIDE_PX) throw new ImageLimitError(`Image is too large (max ${MAX_IMAGE_SIDE_PX} px on the longer side)`);
  if (pages > MAX_ANIM_FRAMES) throw new ImageLimitError('This animation has too many frames');
  if (pages * w * h > MAX_IMAGE_PIXELS) throw new ImageLimitError('This image is too large');
}

/** True when the longer side makes this an HD photo. */
export const isHdSize = (width: number, height: number) => Math.max(width, height) > HD_ABOVE_PX;

/**
 * For a clean, still image: reads its size and, when it is HD, writes a lighter WebP preview (1280 px) to `outPath`.
 * Returns null for animated or standard-size images (no preview needed).
 */
export async function makeHdPreview(cleanPath: string, outPath: string): Promise<{ hd: boolean; previewMime: string } | null> {
  const meta = await sharp(cleanPath, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  if ((meta.pages ?? 1) > 1 || !meta.width || !meta.height || !isHdSize(meta.width, meta.height)) return null;
  await sharp(cleanPath, { limitInputPixels: MAX_IMAGE_PIXELS })
    .resize({ width: PREVIEW_SIDE, height: PREVIEW_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(outPath);
  return { hd: true, previewMime: 'image/webp' };
}
