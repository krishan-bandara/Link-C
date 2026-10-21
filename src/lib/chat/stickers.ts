export type StickerRef = { id: string; emoji: string | null };
export type StickerPack = { id: string; name: string; stickers: StickerRef[] };
export type StickerList = { mine: StickerRef[]; packs: StickerPack[] };

let cache: StickerList | null = null;

export const stickerSrc = (id: string) => `/api/stickers/${id}/image`;
export const invalidateStickers = () => {
  cache = null;
};

export async function loadStickers(force = false): Promise<StickerList> {
  if (cache && !force) return cache;
  const res = await fetch('/api/stickers');
  if (!res.ok) throw new Error('Could not load stickers.');
  cache = (await res.json()) as StickerList;
  return cache;
}

async function errText(res: Response, fallback: string) {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? fallback;
}

/** Returns an error message, or null on success. */
export async function createSticker(file: File, emoji: string): Promise<string | null> {
  const res = await fetch(`/api/stickers${emoji ? `?emoji=${encodeURIComponent(emoji)}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  }).catch(() => null);
  if (!res) return 'Could not reach the server.';
  invalidateStickers();
  return res.ok ? null : errText(res, 'Could not create the sticker.');
}

export async function saveSticker(id: string, save: boolean): Promise<string | null> {
  const res = await fetch(`/api/stickers/${id}/save`, { method: save ? 'POST' : 'DELETE' }).catch(() => null);
  invalidateStickers();
  if (!res) return 'Could not reach the server.';
  return res.ok ? null : errText(res, save ? 'Could not add the sticker.' : 'Could not remove the sticker.');
}

export async function sendSticker(conversationId: string, stickerId: string, replyTo: string | null = null): Promise<string | null> {
  const res = await fetch('/api/messages/sticker', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId, stickerId, replyTo }),
  }).catch(() => null);
  if (!res) return 'Could not reach the server.';
  return res.ok ? null : errText(res, 'Sticker not sent.');
}
