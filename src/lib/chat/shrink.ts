const MAX_SIDE = 2048;
const SKIP_BELOW = 500 * 1024;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks big JPEG/PNG photos on the device before upload (max 2048 px, re-encoded).
 * GIF, WebP (may be animated) and video are left alone. Any problem returns the original file.
 */
export async function shrinkImage(file: File): Promise<File> {
  try {
    if (file.size < SKIP_BELOW || (file.type !== 'image/jpeg' && file.type !== 'image/png')) return file;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();

    // JPEG stays JPEG; PNG becomes WebP (keeps transparency) when the browser can encode it.
    const out = await toBlob(canvas, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.85);
    const okType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    if (!out || out.type !== okType || out.size >= file.size) return file;
    const ext = okType === 'image/jpeg' ? 'jpg' : 'webp';
    return new File([out], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: okType });
  } catch {
    return file;
  }
}
