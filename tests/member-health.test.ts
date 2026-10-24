import { describe, expect, it } from 'vitest';
import { activeToday, classify, colomboExact, daysSince, lastActivityMs, needsAttention, relativeAgo, statusLabel, toMs } from '@/lib/memberHealth';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number, extraH = 0) => new Date(NOW - days * DAY - extraH * 3_600_000).toISOString();
const EPOCH = '1970-01-01T00:00:00Z';

describe('toMs', () => {
  it('treats null, junk and the epoch as no value', () => {
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs('')).toBeNull();
    expect(toMs('nonsense')).toBeNull();
    expect(toMs(EPOCH)).toBeNull();
    expect(toMs('1970-01-01')).toBeNull();
  });
  it('parses real dates', () => {
    expect(toMs('2026-10-25T12:00:00Z')).toBe(NOW);
  });
});

describe('lastActivityMs', () => {
  it('takes the later of the two', () => {
    expect(lastActivityMs(ago(5), ago(1))).toBe(NOW - DAY);
    expect(lastActivityMs(ago(1), ago(5))).toBe(NOW - DAY);
  });
  it('ignores the epoch and nulls', () => {
    expect(lastActivityMs(EPOCH, ago(2))).toBe(NOW - 2 * DAY);
    expect(lastActivityMs(ago(2), null)).toBe(NOW - 2 * DAY);
    expect(lastActivityMs(EPOCH, null)).toBeNull();
  });
});

describe('classify', () => {
  it('active under 3 days', () => {
    expect(classify(ago(0), null, NOW).status).toBe('active');
    expect(classify(ago(2, 23), null, NOW).status).toBe('active');
  });
  it('quiet from 3 days up to 7', () => {
    expect(classify(ago(3), null, NOW)).toMatchObject({ status: 'quiet', daysSince: 3 });
    expect(classify(ago(6, 23), null, NOW)).toMatchObject({ status: 'quiet', daysSince: 6 });
  });
  it('inactive from 7 days', () => {
    expect(classify(ago(7), null, NOW)).toMatchObject({ status: 'inactive', daysSince: 7 });
    expect(classify(ago(90), ago(80), NOW).status).toBe('inactive');
  });
  it('uses the later of seen and sign-in', () => {
    expect(classify(ago(20), ago(1), NOW).status).toBe('active');
    expect(classify(ago(1), ago(20), NOW).status).toBe('active');
  });
  it('never when nothing happened (epoch counts as never)', () => {
    expect(classify(null, null, NOW)).toEqual({ status: 'never', daysSince: null, lastActivity: null });
    expect(classify(EPOCH, null, NOW).status).toBe('never');
  });
  it('epoch seen but a sign-in exists', () => {
    expect(classify(EPOCH, ago(4), NOW).status).toBe('quiet');
  });
  it('future timestamps (clock skew) do not go negative', () => {
    const r = classify(new Date(NOW + 60_000).toISOString(), null, NOW);
    expect(r.status).toBe('active');
    expect(r.daysSince).toBe(0);
  });
});

describe('helpers', () => {
  it('daysSince', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(NOW - DAY * 2.5, NOW)).toBe(2);
  });
  it('needsAttention ignores active and disabled', () => {
    expect(needsAttention('active')).toBe(false);
    expect(needsAttention('quiet')).toBe(true);
    expect(needsAttention('never')).toBe(true);
    expect(needsAttention('inactive', true)).toBe(false);
  });
  it('activeToday', () => {
    expect(activeToday(NOW - 3_600_000, NOW)).toBe(true);
    expect(activeToday(NOW - 25 * 3_600_000, NOW)).toBe(false);
    expect(activeToday(null, NOW)).toBe(false);
  });
  it('statusLabel', () => {
    expect(statusLabel('active', 0)).toBe('Active');
    expect(statusLabel('quiet', 4)).toBe('Quiet 4d');
    expect(statusLabel('inactive', 9)).toBe('Inactive 7d+');
    expect(statusLabel('never', null)).toBe('Never signed in');
  });
  it('relativeAgo', () => {
    expect(relativeAgo(null, NOW)).toBe('never');
    expect(relativeAgo(NOW - 5_000, NOW)).toBe('just now');
    expect(relativeAgo(NOW - 2 * 3_600_000, NOW)).toBe('2 hours ago');
    expect(relativeAgo(NOW - 3_600_000, NOW)).toBe('1 hour ago');
    expect(relativeAgo(NOW - 3 * DAY, NOW)).toBe('3 days ago');
    expect(relativeAgo(NOW - 10 * 60_000, NOW)).toBe('10 minutes ago');
  });
  it('colomboExact uses UTC+5:30', () => {
    expect(colomboExact(NOW)).toContain('17:30');
    expect(colomboExact(null)).toBe('Never');
  });
});
