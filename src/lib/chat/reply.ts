import type { Media, Msg } from './types';

export type QuoteKind = 'text' | 'image' | 'video' | 'audio' | 'snap' | 'sticker';

/** Which small icon a quote shows. */
export function quoteKind(m: Msg, media: Media | undefined): QuoteKind {
  if (m.type === 'sticker') return 'sticker';
  if (m.type === 'media') {
    if (media && media.mode !== 'normal') return 'snap';
    if (media?.kind === 'video') return 'video';
    if (media?.kind === 'audio') return 'audio';
    return 'image';
  }
  return 'text';
}

/** Short text shown in a reply quote. Snaps and view-once media never show a picture, only a label. */
export function quoteLabel(m: Msg, media: Media | undefined): string {
  switch (quoteKind(m, media)) {
    case 'sticker':
      return 'Sticker';
    case 'snap':
      return 'Snap';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Voice message';
    case 'image':
      return 'Photo';
  }
  const t = m.body.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}
