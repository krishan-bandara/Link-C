import { describe, expect, it } from 'vitest';
import { capReached, diskUsedRatio, isQuietHours, monthStart, parseTime } from '../worker/helpers';

// Asia/Colombo is UTC+5:30, no DST.
const at = (utc: string) => new Date(utc);

describe('isQuietHours', () => {
  it('handles a same-day range', () => {
    expect(isQuietHours(at('2026-01-01T06:00:00Z'), '12:00:00', '14:00:00')).toBe(false); // 11:30 local
    expect(isQuietHours(at('2026-01-01T07:30:00Z'), '12:00:00', '14:00:00')).toBe(true); // 07:30Z = 13:00 local
  });
  it('same-day range inclusive of start, exclusive of end', () => {
    expect(isQuietHours(at('2026-01-01T07:30:00Z'), '13:00', '14:00')).toBe(true);
    expect(isQuietHours(at('2026-01-01T08:30:00Z'), '13:00', '14:00')).toBe(false); // 14:00 local
  });
  it('handles ranges crossing midnight', () => {
    expect(isQuietHours(at('2026-01-01T17:00:00Z'), '22:00:00', '07:00:00')).toBe(true); // 22:30 local
    expect(isQuietHours(at('2026-01-01T22:00:00Z'), '22:00:00', '07:00:00')).toBe(true); // 03:30 local
    expect(isQuietHours(at('2026-01-01T06:00:00Z'), '22:00:00', '07:00:00')).toBe(false); // 11:30 local
  });
  it('is off when unset or empty', () => {
    expect(isQuietHours(at('2026-01-01T17:00:00Z'), null, null)).toBe(false);
    expect(isQuietHours(at('2026-01-01T17:00:00Z'), '22:00', '22:00')).toBe(false);
  });
  it('respects the time zone', () => {
    expect(isQuietHours(at('2026-01-01T03:00:00Z'), '22:00', '07:00', 'UTC')).toBe(true);
    expect(isQuietHours(at('2026-01-01T03:00:00Z'), '22:00', '07:00', 'Asia/Colombo')).toBe(false); // 08:30
  });
});

describe('capReached', () => {
  const base = { dailyCap: 3, monthlyCap: 100 };
  it('allows below caps', () => expect(capReached({ ...base, sentToday: 2, sentThisMonth: 99 })).toBeNull());
  it('blocks at daily cap', () => expect(capReached({ ...base, sentToday: 3, sentThisMonth: 3 })).toBe('daily'));
  it('blocks at monthly cap', () => expect(capReached({ ...base, sentToday: 0, sentThisMonth: 100 })).toBe('monthly'));
});

describe('misc helpers', () => {
  it('parseTime', () => {
    expect(parseTime('07:30:00')).toBe(450);
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
  it('monthStart in Colombo', () => {
    expect(monthStart(at('2026-03-15T10:00:00Z'), 'Asia/Colombo')).toBe('2026-02-28T18:30:00.000Z');
  });
  it('diskUsedRatio', () => {
    expect(diskUsedRatio(100, 15)).toBeCloseTo(0.85);
    expect(diskUsedRatio(0, 0)).toBe(0);
  });
});
