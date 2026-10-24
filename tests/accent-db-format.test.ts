import { describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, isHex } from '@/lib/theme';

// The database check on user_prefs.accent only accepts lowercase hex (^#[0-9a-f]{6}$), so a colour the app offers
// in any other form is rejected on save ("Could not save").
describe('accent colours match the database format', () => {
  it('default accent', () => {
    expect(DEFAULT_ACCENT).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('every picker colour and partner is lowercase hex', () => {
    for (const a of ACCENTS) {
      expect(a.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(a.second).toMatch(/^#[0-9a-f]{6}$/);
      expect(isHex(a.hex)).toBe(true);
    }
  });
});
