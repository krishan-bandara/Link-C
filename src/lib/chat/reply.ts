import type { Media, Msg } from './types';

/** Short text shown in a reply quote. Snaps and view-once media never show a picture, only a label. */
export function quoteLabel(m: Msg, media: Media | undefined): string {
  if (m.type === 'sticker') return 'Sticker';
  if (m.type === 'media') {
    if (media && media.mode !== 'normal') return 'Snap';
    return media?.kind === 'video' ? 'Video' : 'Photo';
  }
  const t = m.body.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}
