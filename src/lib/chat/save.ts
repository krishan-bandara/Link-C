// Save a NORMAL photo/video to the device. Snaps are never saveable (the server answers 403).
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};

export type SaveResult = 'saved' | 'shared' | 'cancelled' | 'error';

export async function saveMedia(mediaId: string, mime: string, toast: (m: string) => void): Promise<SaveResult> {
  toast('Saving...');
  try {
    const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/stream?download=1`);
    if (!res.ok) {
      toast(res.status === 403 ? 'This media cannot be saved.' : 'Could not save. Please try again.');
      return 'error';
    }
    const blob = await res.blob();
    const type = blob.type || mime;
    const ext = EXT[type] ?? EXT[mime] ?? (type.split('/')[1] || 'bin');
    const file = new File([blob], `link-c-${new Date().toISOString().slice(0, 10)}-${mediaId.slice(0, 6)}.${ext}`, { type });
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        toast('Ready to save');
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          toast('');
          return 'cancelled';
        }
        // share failed for another reason: fall through to a normal download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Saved to your downloads');
    return 'saved';
  } catch {
    toast('Could not save. Check your connection.');
    return 'error';
  }
}
