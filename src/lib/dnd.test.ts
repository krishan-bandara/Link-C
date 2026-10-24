import { describe, expect, it } from 'vitest';
import { checkDnd } from './dnd';
import { dndFromRow } from './prefs';

describe('dnd helpers', () => {
  it('validates times', () => {
    expect(checkDnd({ from: '22:00', to: '07:00' })).toEqual({ ok: true, warn: '' });
    expect(checkDnd({ from: '', to: '07:00' }).ok).toBe(false);
    expect(checkDnd({ from: '25:00', to: '07:00' }).ok).toBe(false);
    const eq = checkDnd({ from: '08:00', to: '08:00' });
    expect(eq.ok).toBe(true);
    expect(eq.warn).not.toBe('');
  });
  it('parses rows with fallbacks', () => {
    expect(dndFromRow(null)).toEqual({ on: false, from: '22:00', to: '07:00' });
    expect(dndFromRow({ dnd_on: true, dnd_from: '23:30', dnd_to: 'x' })).toEqual({ on: true, from: '23:30', to: '07:00' });
  });
});
