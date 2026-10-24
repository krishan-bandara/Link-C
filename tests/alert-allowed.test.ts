import { describe, expect, it } from 'vitest';
import { alertAllowed } from '../worker/helpers';

const NOW = new Date('2026-10-15T06:00:00Z'); // 11:30 Colombo
const dnd = (from: string, to: string, on = true) => ({ on, from, to });

describe('alertAllowed', () => {
  it('allows when there is no mute and DND is off or missing', () => {
    expect(alertAllowed({ dnd: undefined, now: NOW })).toBe(true);
    expect(alertAllowed({ dnd: dnd('11:00', '12:00', false), now: NOW })).toBe(true);
    expect(alertAllowed({ unreadMutedUntil: [null], dnd: null, now: NOW })).toBe(true);
  });
  it('blocks inside DND hours, including ranges across midnight', () => {
    expect(alertAllowed({ dnd: dnd('11:00', '12:00'), now: NOW })).toBe(false);
    expect(alertAllowed({ dnd: dnd('22:00', '07:00'), now: NOW })).toBe(true);
    expect(alertAllowed({ dnd: dnd('22:00', '07:00'), now: new Date('2026-10-15T17:30:00Z') })).toBe(false);
  });
  it('needs at least one unread chat that is not muted', () => {
    const past = '2026-10-01T00:00:00Z';
    const future = '2026-10-16T00:00:00Z';
    expect(alertAllowed({ unreadMutedUntil: ['infinity', future], dnd: null, now: NOW })).toBe(false);
    expect(alertAllowed({ unreadMutedUntil: ['infinity', past], dnd: null, now: NOW })).toBe(true);
    expect(alertAllowed({ unreadMutedUntil: ['infinity', null], dnd: null, now: NOW })).toBe(true);
    expect(alertAllowed({ unreadMutedUntil: [], dnd: null, now: NOW })).toBe(false);
  });
  it('DND wins over an unmuted chat', () => {
    expect(alertAllowed({ unreadMutedUntil: [null], dnd: dnd('11:00', '12:00'), now: NOW })).toBe(false);
  });
});
