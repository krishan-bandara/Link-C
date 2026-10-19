import { describe, expect, it } from 'vitest';
import { checkPassword } from '../src/lib/password';

describe('checkPassword', () => {
  it('rejects short, common and keyboard-pattern passwords', () => {
    for (const p of ['short', 'password123', 'qwertyuiop12', 'Password1234', 'aaaaaaaaaaaa']) expect(checkPassword(p).ok, p).toBe(false);
  });
  it('rejects passwords that contain the name or the email', () => {
    expect(checkPassword('krishan-link-2026!', { name: 'Krishan', email: 'k@x.com' }).ok).toBe(false);
    expect(checkPassword('mysecretlinkchatsecure', { email: 'linkchatsecure@gmail.com' }).ok).toBe(false);
  });
  it('accepts long random passphrases and passwords', () => {
    for (const p of ['xk9#Qm2$vLp8@zRt', 'purple-tractor-orbit-lantern-9', 'Zq7!hD3^wN5&bV1*']) expect(checkPassword(p).ok, p).toBe(true);
  });
  it('explains what is wrong', () => {
    const r = checkPassword('abc');
    expect(r.problems.some((x) => /12 characters/.test(x))).toBe(true);
    expect(r.percent).toBeGreaterThanOrEqual(0);
  });
  it('never throws on odd input', () => {
    for (const p of ['', ' ', '😀😀😀😀😀😀😀😀😀😀😀😀', 'x'.repeat(500)]) expect(() => checkPassword(p)).not.toThrow();
  });
});
