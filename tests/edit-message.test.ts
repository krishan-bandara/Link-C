import { describe, expect, it } from 'vitest';
import { EDIT_WINDOW_MS, canEdit, editErrorText, validEditText } from '@/lib/chat/edit';

const now = Date.parse('2026-10-25T12:00:00Z');
const base = { sender_id: 'me', type: 'text' as const, created_at: new Date(now - 60_000).toISOString() };

describe('canEdit', () => {
  it('allows own text inside the window', () => expect(canEdit(base, 'me', now)).toBe(true));
  it('blocks at and after the window', () => {
    expect(canEdit({ ...base, created_at: new Date(now - EDIT_WINDOW_MS).toISOString() }, 'me', now)).toBe(false);
    expect(canEdit({ ...base, created_at: new Date(now - EDIT_WINDOW_MS + 1000).toISOString() }, 'me', now)).toBe(true);
  });
  it('blocks other people and non-text', () => {
    expect(canEdit(base, 'you', now)).toBe(false);
    expect(canEdit({ ...base, type: 'media' }, 'me', now)).toBe(false);
    expect(canEdit({ ...base, type: 'sticker' }, 'me', now)).toBe(false);
  });
  it('blocks a bad date', () => expect(canEdit({ ...base, created_at: 'x' }, 'me', now)).toBe(false));
});

describe('validEditText', () => {
  it('trims and accepts a change', () => expect(validEditText('  hi  ', 'hello')).toBe('hi'));
  it('rejects empty, unchanged and too long', () => {
    expect(validEditText('   ', 'a')).toBeNull();
    expect(validEditText('a', 'a')).toBeNull();
    expect(validEditText('x'.repeat(4001), 'a')).toBeNull();
  });
});

describe('editErrorText', () => {
  it('maps server errors', () => {
    expect(editErrorText('edit window closed')).toMatch(/15 minutes/);
    expect(editErrorText('not allowed')).toMatch(/cannot edit/);
    expect(editErrorText('invalid text')).toMatch(/4000/);
    expect(editErrorText(undefined)).toMatch(/Could not/);
  });
});
