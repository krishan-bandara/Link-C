const PICT = /\p{Extended_Pictographic}/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;
/** A real emoji: a flag, or a pictograph shown as emoji by default or forced with the emoji selector (so (c) and (r) are not). */
const isEmoji = (s: string) => FLAG.test(s) || (PICT.test(s) && (/\p{Emoji_Presentation}/u.test(s) || s.includes('️')));
const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** True when the text is only 1 to 3 emoji (nothing else, not even spaces). */
export function isBigEmoji(text: string): boolean {
  const t = text.trim();
  if (!seg || !t || t.length > 40 || t !== text) return false;
  let n = 0;
  for (const s of seg.segment(t)) {
    if (!isEmoji(s.segment)) return false;
    if (++n > 3) return false;
  }
  return n > 0;
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
