import { describe, expect, it } from 'vitest';
import { CREDITS } from '@/lib/credits';

describe('credits', () => {
  it('every credit has name, by, license and an https url', () => {
    expect(CREDITS.length).toBeGreaterThan(0);
    for (const c of CREDITS) {
      expect(c.name).toBeTruthy();
      expect(c.by).toBeTruthy();
      expect(c.license).toBeTruthy();
      expect(c.url).toMatch(/^https:\/\//);
    }
  });

  it('includes Fluent Emoji under MIT', () => {
    expect(CREDITS.find((c) => c.name === 'Fluent Emoji')?.license).toBe('MIT');
  });
});
