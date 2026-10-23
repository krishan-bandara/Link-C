import { describe, expect, it } from 'vitest';
import { classifySlide, cleanMime, extForMime, formatDuration, makeVoiceFile, pickAudioMime, voiceFileName } from '../src/lib/chat/voice';

const fake = (ok: string[]) => ({ isTypeSupported: (t: string) => ok.includes(t) });

describe('pickAudioMime', () => {
  it('prefers webm opus, then mp4, then ogg', () => {
    expect(pickAudioMime(fake(['audio/webm;codecs=opus', 'audio/mp4']))).toBe('audio/webm;codecs=opus');
    expect(pickAudioMime(fake(['audio/mp4', 'audio/ogg;codecs=opus']))).toBe('audio/mp4');
    expect(pickAudioMime(fake(['audio/ogg;codecs=opus']))).toBe('audio/ogg;codecs=opus');
  });
  it('returns null when nothing or no MediaRecorder', () => {
    expect(pickAudioMime(fake([]))).toBeNull();
    expect(pickAudioMime(null)).toBeNull();
  });
  it('falls back to webm when isTypeSupported is missing', () => {
    expect(pickAudioMime({})).toBe('audio/webm');
  });
});

describe('mime and file names', () => {
  it('strips codecs', () => {
    expect(cleanMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(cleanMime('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(cleanMime('audio/mp4')).toBe('audio/mp4');
  });
  it('maps extensions', () => {
    expect(extForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extForMime('audio/mp4')).toBe('m4a');
    expect(extForMime('audio/ogg;codecs=opus')).toBe('ogg');
  });
  it('names and builds the file', () => {
    expect(voiceFileName('audio/mp4', 5)).toBe('voice-5.m4a');
    const f = makeVoiceFile([new Uint8Array(3)], 'audio/webm;codecs=opus', 9);
    expect(f.name).toBe('voice-9.webm');
    expect(f.type).toBe('audio/webm');
  });
});

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75.9)).toBe('1:15');
    expect(formatDuration(300)).toBe('5:00');
  });
  it('is safe on bad input', () => {
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
    expect(formatDuration(-3)).toBe('0:00');
  });
});

describe('classifySlide', () => {
  it('cancel on left beyond 80', () => {
    expect(classifySlide(-81, 0)).toBe('cancel');
    expect(classifySlide(-80, 0)).toBe('none');
  });
  it('lock on up beyond 60', () => {
    expect(classifySlide(0, -61)).toBe('lock');
    expect(classifySlide(0, -60)).toBe('none');
  });
  it('ignores right and down', () => {
    expect(classifySlide(200, 200)).toBe('none');
  });
  it('picks the dominant axis when both pass', () => {
    expect(classifySlide(-200, -65)).toBe('cancel');
    expect(classifySlide(-85, -200)).toBe('lock');
  });
});
