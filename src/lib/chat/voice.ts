/** Pure helpers for voice notes (no DOM needed, so they are unit-tested). */

export const MAX_VOICE_SECONDS = 300;
export const MIN_VOICE_SECONDS = 1;
export const CANCEL_DX = 80;
export const LOCK_DY = 60;

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;

type RecorderLike = { isTypeSupported?: (t: string) => boolean };

/** Best mime this browser can record, or null when MediaRecorder is missing. */
export function pickAudioMime(MR: RecorderLike | undefined | null = typeof MediaRecorder === 'undefined' ? null : MediaRecorder): string | null {
  if (!MR) return null;
  if (typeof MR.isTypeSupported !== 'function') return 'audio/webm';
  for (const m of CANDIDATES) {
    try {
      if (MR.isTypeSupported(m)) return m;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 'audio/webm;codecs=opus' -> 'audio/webm' (the server wants a clean declared mime). */
export function cleanMime(mime: string): string {
  const base = (mime.split(';')[0] ?? '').trim().toLowerCase();
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'audio/mp4';
  return base || 'audio/webm';
}

export function extForMime(mime: string): 'webm' | 'm4a' | 'ogg' {
  const b = cleanMime(mime);
  if (b === 'audio/mp4') return 'm4a';
  if (b === 'audio/ogg') return 'ogg';
  return 'webm';
}

export function voiceFileName(mime: string, now = Date.now()): string {
  return `voice-${now}.${extForMime(mime)}`;
}

export function makeVoiceFile(parts: BlobPart[], mime: string, now = Date.now()): File {
  return new File(parts, voiceFileName(mime, now), { type: cleanMime(mime) });
}

/** 75 -> '1:15'. Bad input -> '0:00'. */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type Slide = 'cancel' | 'lock' | 'none';

/** Where a held finger has moved to (dx/dy relative to the press point; left and up are negative). */
export function classifySlide(dx: number, dy: number): Slide {
  const left = -dx;
  const up = -dy;
  const c = left > CANCEL_DX;
  const l = up > LOCK_DY;
  if (c && l) return left - CANCEL_DX >= up - LOCK_DY ? 'cancel' : 'lock';
  if (c) return 'cancel';
  if (l) return 'lock';
  return 'none';
}
