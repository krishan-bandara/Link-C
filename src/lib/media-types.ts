// Pure helpers (no I/O) for media kinds, allowed types and audio rules. Unit-tested in tests/audio-media.test.ts.
import { HttpError } from '@/lib/errors';

export const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
] as const;

export type MediaKind = 'image' | 'video' | 'audio';
export const kindOf = (mime: string): MediaKind =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'video';

/** Voice notes are tiny (5 minutes of opus/AAC is a few MB). */
export const AUDIO_MAX_MB = 25;

/** "audio/webm;codecs=opus" -> "audio/webm" (MediaRecorder adds parameters). */
export const normalizeMime = (mime: string): string => mime.split(';')[0].trim().toLowerCase();

export type AudioFormat = 'webm' | 'mp4' | 'ogg' | 'mp3';

/**
 * Maps the container that file-type detected to an audio format we can re-mux, or null.
 * An audio-only WebM/MP4 is reported by file-type as video/webm, video/mp4, audio/mp4 or audio/x-m4a;
 * ffprobe then confirms there is really no video stream.
 */
export function audioFormatOf(detected: string): AudioFormat | null {
  const m = normalizeMime(detected);
  if (m === 'audio/mpeg') return 'mp3';
  if (m === 'video/webm' || m === 'audio/webm') return 'webm';
  if (m === 'audio/mp4' || m === 'audio/x-m4a' || m === 'video/mp4') return 'mp4';
  if (m === 'audio/ogg' || m === 'audio/opus' || m === 'application/ogg' || m === 'video/ogg') return 'ogg';
  return null;
}

export const AUDIO_FINAL_MIME: Record<AudioFormat, string> = {
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
};

/** ffmpeg output flags per audio format (metadata is removed with -map_metadata -1 -c copy). */
export const AUDIO_FFMPEG_FORMAT_ARGS: Record<AudioFormat, string[]> = {
  mp3: ['-f', 'mp3'],
  ogg: ['-f', 'ogg'],
  webm: ['-f', 'webm'],
  mp4: ['-f', 'mp4', '-movflags', '+faststart'],
};

/** Audio is always a normal message: view-once and timed modes are refused (400). */
export function assertModeAllowed(mime: string, mode: 'normal' | 'once' | 'timed'): void {
  if (kindOf(mime) === 'audio' && mode !== 'normal') {
    throw new HttpError(400, 'Voice messages cannot be sent as view-once or timed snaps');
  }
}

type ProbeStream = { codec_type?: string };
/** Checks ffprobe `-show_streams -of json` output against the declared kind. Returns an error message or null. */
export function probeProblem(probe: unknown, kind: MediaKind): string | null {
  const streams = (probe as { streams?: ProbeStream[] } | null)?.streams;
  if (!Array.isArray(streams)) return 'This file could not be read';
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const hasVideo = streams.some((s) => s.codec_type === 'video');
  if (kind === 'audio') {
    if (hasVideo) return 'File does not match its declared type';
    if (!hasAudio) return 'This audio file has no sound track';
  } else if (kind === 'video' && !hasVideo) {
    return 'This video file has no video track';
  }
  return null;
}
