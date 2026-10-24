import { describe, expect, it } from 'vitest';
import { inQuietHours, isMuted, isQuiet, minutesOfDay, muteLabel, muteUntilValue, parseHm } from '@/lib/chatprefs';

const at = (iso: string) => new Date(iso); // Colombo is UTC+5:30
describe('mute', () => {
  it('null and past are not muted, future and infinity are', () => {
    const now = Date.parse('2026-10-25T10:00:00Z');
    expect(isMuted(null, now)).toBe(false);
    expect(isMuted('2026-10-25T09:00:00Z', now)).toBe(false);
    expect(isMuted('2026-10-25T11:00:00Z', now)).toBe(true);
    expect(isMuted('infinity', now)).toBe(true);
    expect(isMuted('garbage', now)).toBe(false);
  });
  it('mute values', () => {
    const now = Date.parse('2026-10-25T10:00:00Z');
    expect(muteUntilValue('off', now)).toBeNull();
    expect(muteUntilValue('always', now)).toBe('infinity');
    expect(muteUntilValue('8h', now)).toBe('2026-10-25T18:00:00.000Z');
  });
  it('label', () => {
    const now = Date.parse('2026-10-25T10:00:00Z');
    expect(muteLabel(null, now)).toBe('');
    expect(muteLabel('infinity', now)).toBe('Muted');
    expect(muteLabel('2026-10-25T11:00:00Z', now)).toBe('Muted until 16:30');
  });
});
describe('quiet hours', () => {
  it('parses HH:MM', () => {
    expect(parseHm('07:30')).toBe(450);
    expect(parseHm('7:30')).toBeNull();
    expect(parseHm('24:00')).toBeNull();
  });
  it('minutes of day in Colombo', () => {
    expect(minutesOfDay(at('2026-10-25T00:00:00Z'))).toBe(330);
  });
  it('wraps past midnight', () => {
    const dnd = { on: true, from: '22:00', to: '07:00' };
    expect(inQuietHours(dnd, at('2026-10-25T17:00:00Z'))).toBe(true); // 22:30 Colombo
    expect(inQuietHours(dnd, at('2026-10-25T21:00:00Z'))).toBe(true); // 02:30
    expect(inQuietHours(dnd, at('2026-10-25T06:00:00Z'))).toBe(false); // 11:30
  });
  it('same-day window, off and equal times', () => {
    expect(inQuietHours({ on: true, from: '13:00', to: '14:00' }, at('2026-10-25T08:00:00Z'))).toBe(true); // 13:30
    expect(inQuietHours({ on: false, from: '00:00', to: '23:59' }, at('2026-10-25T08:00:00Z'))).toBe(false);
    expect(inQuietHours({ on: true, from: '10:00', to: '10:00' }, at('2026-10-25T08:00:00Z'))).toBe(false);
    expect(inQuietHours(null)).toBe(false);
  });
  it('isQuiet combines both', () => {
    const now = at('2026-10-25T08:00:00Z'); // 13:30
    expect(isQuiet({ mutedUntil: 'infinity' }, null, now)).toBe(true);
    expect(isQuiet({ mutedUntil: null }, { on: true, from: '13:00', to: '14:00' }, now)).toBe(true);
    expect(isQuiet({ mutedUntil: null }, { on: false, from: '13:00', to: '14:00' }, now)).toBe(false);
  });
});
