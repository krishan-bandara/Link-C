import { describe, expect, it } from 'vitest';
import { downloadName, extForMime } from '../src/lib/assets';
import {
  ALLOWED_MIMES,
  AUDIO_FINAL_MIME,
  AUDIO_MAX_MB,
  assertModeAllowed,
  audioFormatOf,
  kindOf,
  normalizeMime,
  probeProblem,
} from '../src/lib/media-types';
import { quoteLabel } from '../src/lib/chat/reply';

describe('kindOf / allow-list', () => {
  it('classifies audio, image and video', () => {
    expect(kindOf('audio/webm')).toBe('audio');
    expect(kindOf('audio/mp4')).toBe('audio');
    expect(kindOf('image/png')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
  });
  it('allows the four voice mimes only', () => {
    for (const m of ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']) expect(ALLOWED_MIMES).toContain(m);
    expect(ALLOWED_MIMES).not.toContain('audio/wav' as never);
    expect(AUDIO_MAX_MB).toBe(25);
  });
  it('strips mime parameters', () => {
    expect(normalizeMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeMime(' Audio/MP4 ')).toBe('audio/mp4');
  });
});

describe('audio rules', () => {
  it('refuses once/timed for audio, allows normal', () => {
    expect(() => assertModeAllowed('audio/webm', 'once')).toThrow();
    expect(() => assertModeAllowed('audio/mp4', 'timed')).toThrow();
    expect(() => assertModeAllowed('audio/ogg', 'normal')).not.toThrow();
    expect(() => assertModeAllowed('video/mp4', 'once')).not.toThrow();
  });
  it('maps detected containers to formats and final mimes', () => {
    expect(audioFormatOf('video/webm')).toBe('webm');
    expect(audioFormatOf('video/mp4')).toBe('mp4');
    expect(audioFormatOf('audio/x-m4a')).toBe('mp4');
    expect(audioFormatOf('audio/ogg; codecs=opus')).toBe('ogg');
    expect(audioFormatOf('audio/mpeg')).toBe('mp3');
    expect(audioFormatOf('image/png')).toBeNull();
    expect(AUDIO_FINAL_MIME.webm).toBe('audio/webm');
    expect(AUDIO_FINAL_MIME.mp4).toBe('audio/mp4');
  });
  it('checks ffprobe streams', () => {
    const a = { streams: [{ codec_type: 'audio' }] };
    const v = { streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] };
    expect(probeProblem(a, 'audio')).toBeNull();
    expect(probeProblem(v, 'audio')).not.toBeNull();
    expect(probeProblem({ streams: [] }, 'audio')).not.toBeNull();
    expect(probeProblem(v, 'video')).toBeNull();
    expect(probeProblem(a, 'video')).not.toBeNull();
    expect(probeProblem(null, 'audio')).not.toBeNull();
  });
});

describe('audio download names', () => {
  const id = '12345678-aaaa-bbbb-cccc-1234567890ab';
  it('uses the right extension', () => {
    expect(downloadName(id, 'audio/webm')).toBe('link-c-12345678.webm');
    expect(downloadName(id, 'audio/mp4')).toBe('link-c-12345678.m4a');
    expect(downloadName(id, 'audio/ogg')).toBe('link-c-12345678.ogg');
    expect(downloadName(id, 'audio/mpeg')).toBe('link-c-12345678.mp3');
    expect(extForMime('audio/wav')).toBe('bin');
  });
});

describe('reply label', () => {
  it('labels voice messages', () => {
    const msg = { type: 'media', body: '' } as never;
    expect(quoteLabel(msg, { kind: 'audio', mode: 'normal' } as never)).toBe('Voice message');
  });
});
