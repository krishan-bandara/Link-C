import { describe, expect, it } from 'vitest';
import { describeDevice, relativeTime } from '../src/lib/userAgent';

describe('describeDevice', () => {
  it('names common devices', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0')).toBe('Edge on Windows');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0')).toBe('Firefox on Windows');
  });
  it('falls back safely', () => {
    expect(describeDevice('')).toBe('Unknown device');
    expect(describeDevice(null)).toBe('Unknown device');
    expect(describeDevice('curl/8.0')).toBe('Unknown device');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  it('formats ages', () => {
    expect(relativeTime('2026-10-25T11:59:30Z', now)).toBe('active now');
    expect(relativeTime('2026-10-25T11:55:00Z', now)).toBe('5 min ago');
    expect(relativeTime('2026-10-25T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-10-24T09:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-10-20T12:00:00Z', now)).toBe('5 days ago');
    expect(relativeTime(null, now)).toBe('unknown');
  });
});
