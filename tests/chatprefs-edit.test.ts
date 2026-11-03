import { describe, expect, it } from 'vitest';
import { inQuietHours, isQuiet, parseHm } from '@/lib/chatprefs';
import { EDIT_WINDOW_MS, canEdit } from '@/lib/chat/edit';

// Asia/Colombo is UTC+5:30 with no daylight saving.
const colombo = (hh: number, mm: number) => new Date(Date.UTC(2026, 0, 15, hh - 5, mm - 30));

describe('parseHm', () => {
  it('rejects malformed values', () => {
    for (const bad of ['', '7:00', '24:00', '12:60', 'ab:cd', null, undefined]) expect(parseHm(bad as string)).toBeNull();
    expect(parseHm('07:30')).toBe(450);
  });
});

describe('inQuietHours', () => {
  const dnd = { on: true, from: '22:00', to: '07:00' };
  it('wraps across midnight', () => {
    expect(inQuietHours(dnd, colombo(23, 0))).toBe(true);
    expect(inQuietHours(dnd, colombo(3, 0))).toBe(true);
    expect(inQuietHours(dnd, colombo(7, 0))).toBe(false);
    expect(inQuietHours(dnd, colombo(12, 0))).toBe(false);
  });
  it('same-day range', () => {
    const d = { on: true, from: '09:00', to: '17:00' };
    expect(inQuietHours(d, colombo(9, 0))).toBe(true);
    expect(inQuietHours(d, colombo(17, 0))).toBe(false);
  });
  it('equal from/to, off, null and invalid times mean never', () => {
    expect(inQuietHours({ on: true, from: '08:00', to: '08:00' }, colombo(8, 0))).toBe(false);
    expect(inQuietHours({ ...dnd, on: false }, colombo(23, 0))).toBe(false);
    expect(inQuietHours(null, colombo(23, 0))).toBe(false);
    expect(inQuietHours({ on: true, from: '25:00', to: '07:00' }, colombo(23, 0))).toBe(false);
    expect(inQuietHours({ on: true, from: '22:00', to: 'xx' }, colombo(23, 0))).toBe(false);
  });
});

describe('isQuiet', () => {
  const noon = colombo(12, 0);
  const dnd = { on: true, from: '22:00', to: '07:00' };
  it('infinite mute is quiet regardless of DND', () => {
    expect(isQuiet({ mutedUntil: 'infinity' }, null, noon)).toBe(true);
    expect(isQuiet({ mutedUntil: 'infinity' }, dnd, noon)).toBe(true);
  });
  it('DND alone makes it quiet; neither does not', () => {
    expect(isQuiet({ mutedUntil: null }, dnd, colombo(23, 0))).toBe(true);
    expect(isQuiet({ mutedUntil: null }, dnd, noon)).toBe(false);
    expect(isQuiet(null, null, noon)).toBe(false);
  });
  it('expired mute is not quiet', () => {
    expect(isQuiet({ mutedUntil: new Date(noon.getTime() - 1000).toISOString() }, null, noon)).toBe(false);
  });
});

describe('canEdit', () => {
  const sent = Date.parse('2026-01-15T10:00:00.000Z');
  const msg = { sender_id: 'me', type: 'text' as const, created_at: new Date(sent).toISOString() };
  it('allows 1 ms before the window ends, refuses at the edge', () => {
    expect(canEdit(msg, 'me', sent + EDIT_WINDOW_MS - 1)).toBe(true);
    expect(canEdit(msg, 'me', sent + EDIT_WINDOW_MS)).toBe(false);
  });
  it('refuses other senders, non-text and bad dates', () => {
    expect(canEdit(msg, 'you', sent)).toBe(false);
    expect(canEdit({ ...msg, type: 'image' as never }, 'me', sent)).toBe(false);
    expect(canEdit({ ...msg, created_at: 'nope' }, 'me', sent)).toBe(false);
  });
});
