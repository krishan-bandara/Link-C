import { describe, expect, it } from 'vitest';
import { alertLevel, b2UsedPct, formatBytes, formatPct, freePct, pct, shouldNotify } from '../src/lib/storageStats';

const GB = 1024 ** 3;
const base = { diskTotalBytes: 100 * GB, diskFreeBytes: 50 * GB, b2UsedBytes: 0, diskFreeAlertPct: 15, b2BudgetGb: 10, b2AlertPct: 80 };

describe('percentages', () => {
  it('pct clamps and handles bad input', () => {
    expect(pct(50, 200)).toBe(25);
    expect(pct(300, 200)).toBe(100);
    expect(pct(5, 0)).toBe(0);
    expect(pct(null, 10)).toBe(0);
    expect(pct(-1, 10)).toBe(0);
  });
  it('freePct is 100 when unknown', () => {
    expect(freePct(null, null)).toBe(100);
    expect(freePct(100, 25)).toBe(25);
    expect(freePct(100, 500)).toBe(100);
  });
  it('b2UsedPct', () => {
    expect(b2UsedPct(5 * GB, 10)).toBe(50);
    expect(b2UsedPct(5, 0)).toBe(0);
    expect(b2UsedPct(20 * GB, 10)).toBe(200);
  });
});

describe('alertLevel', () => {
  it('ok when plenty is free', () => expect(alertLevel(base)).toBe('ok'));
  it('warn below the disk threshold', () => expect(alertLevel({ ...base, diskFreeBytes: 14 * GB })).toBe('warn'));
  it('boundary: exactly the threshold is ok', () => expect(alertLevel({ ...base, diskFreeBytes: 15 * GB })).toBe('ok'));
  it('critical below half the threshold', () => expect(alertLevel({ ...base, diskFreeBytes: 7 * GB })).toBe('critical'));
  it('warn at the b2 threshold', () => expect(alertLevel({ ...base, b2UsedBytes: 8 * GB })).toBe('warn'));
  it('critical at 95% of the b2 budget', () => expect(alertLevel({ ...base, b2UsedBytes: 9.5 * GB })).toBe('critical'));
  it('unknown disk reading does not alarm', () => expect(alertLevel({ ...base, diskTotalBytes: null, diskFreeBytes: null })).toBe('ok'));
});

describe('shouldNotify', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  it('never when ok', () => expect(shouldNotify('warn', 'ok', null, now)).toBe(false));
  it('when it worsens', () => {
    expect(shouldNotify('ok', 'warn', '2026-10-25T11:59:00Z', now)).toBe(true);
    expect(shouldNotify('warn', 'critical', '2026-10-25T11:59:00Z', now)).toBe(true);
  });
  it('not again within 24 h at the same level', () => {
    expect(shouldNotify('warn', 'warn', '2026-10-25T00:00:00Z', now)).toBe(false);
    expect(shouldNotify('critical', 'warn', '2026-10-25T00:00:00Z', now)).toBe(false);
  });
  it('again after 24 h or if never sent', () => {
    expect(shouldNotify('warn', 'warn', '2026-10-24T11:00:00Z', now)).toBe(true);
    expect(shouldNotify('warn', 'warn', null, now)).toBe(true);
  });
});

describe('formatting', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * GB)).toBe('5.0 GB');
    expect(formatBytes(null)).toBe('unknown');
    expect(formatBytes(-5)).toBe('unknown');
  });
  it('formatPct', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(4.26)).toBe('4.3%');
    expect(formatPct(55.4)).toBe('55%');
  });
});
