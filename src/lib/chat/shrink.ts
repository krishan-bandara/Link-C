const MAX_SIDE = 2048;
const HD_SIDE = 4096;
const HD_MAX_PIXELS = 12_000_000; // about 12 megapixels: keeps phone canvases from running out of memory
const SKIP_BELOW = 500 * 1024;
const MIN_BLOB_BYTES = 1024; // anything smaller than this is a blank or failed encode

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Reads the real size without decoding the whole picture when the browser allows it. */
async function readSize(file: File): Promise<{ w: number; h: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Shrinks big JPEG/PNG photos on the device before upload (max 2048 px, or 4096 px / ~12 MP in HD, re-encoded).
 * GIF, WebP (may be animated) and video are left alone. Any problem returns the original file.
 */
export async function shrinkImage(file: File, hd = false): Promise<File> {
  let bmp: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (file.size < SKIP_BELOW || (file.type !== 'image/jpeg' && file.type !== 'image/png')) return file;
    const side = hd ? HD_SIDE : MAX_SIDE;
    const maxPixels = hd ? HD_MAX_PIXELS : MAX_SIDE * MAX_SIDE;
    const fit = (sw: number, sh: number) => {
      let scale = Math.min(1, side / Math.max(sw, sh));
      if (sw * scale * sh * scale > maxPixels) scale = Math.sqrt(maxPixels / (sw * sh));
      return { w: Math.max(1, Math.floor(sw * scale)), h: Math.max(1, Math.floor(sh * scale)) };
    };

    // Ask the browser to decode straight to the target size (saves a huge full-size bitmap); fall back to a full decode.
    const full = await readSize(file);
    let w: number;
    let h: number;
    if (full) {
      ({ w, h } = fit(full.w, full.h));
    } else {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      ({ w, h } = fit(bmp.width, bmp.height));
    }
    if (full && (w < full.w || h < full.h)) {
      try {
        bmp = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
        if (bmp.width !== w || bmp.height !== h) {
          bmp.close();
          bmp = null; // option ignored or odd result: use the full decode instead
        }
      } catch {
        bmp = null;
      }
    }
    if (!bmp) bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });

    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);

    // JPEG stays JPEG; PNG becomes WebP (keeps transparency) when the browser can encode it.
    const okType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const out = await toBlob(canvas, okType, hd ? 0.92 : 0.85);
    if (!out || out.type !== okType || out.size < MIN_BLOB_BYTES || out.size >= file.size) return file;
    const ext = okType === 'image/jpeg' ? 'jpg' : 'webp';
    return new File([out], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: okType });
  } catch {
    return file;
  } finally {
    bmp?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
