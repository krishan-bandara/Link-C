import { describe, expect, it } from 'vitest';
import { lockState, nextFailure, emailKey } from '../src/lib/login-guard';
import { buildInviteLink, hashToken, isTokenShape } from '../src/lib/invites';
import { LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILS } from '../src/lib/auth-policy';

describe('login lockout decisions', () => {
  const t0 = Date.parse('2026-10-19T10:00:00Z');
  it('counts failures and locks at the limit', () => {
    let row: { fails: number; locked_until: string | null } | null = null;
    for (let i = 1; i < LOGIN_MAX_FAILS; i++) {
      row = nextFailure(row, t0);
      expect(row.locked_until).toBeNull();
      expect(row.fails).toBe(i);
    }
    row = nextFailure(row, t0);
    expect(row.fails).toBe(LOGIN_MAX_FAILS);
    expect(row.locked_until).not.toBeNull();
    expect(lockState(row, t0 + 1000)).toEqual({ locked: true, retryAfterSeconds: LOGIN_LOCK_MINUTES * 60 - 1 });
  });
  it('unlocks after the lock time and starts again at 1', () => {
    const locked = nextFailure({ fails: LOGIN_MAX_FAILS - 1, locked_until: null }, t0);
    const later = t0 + (LOGIN_LOCK_MINUTES * 60 + 1) * 1000;
    expect(lockState(locked, later).locked).toBe(false);
    expect(nextFailure(locked, later).fails).toBe(1);
  });
  it('treats missing rows as not locked and keys emails case-insensitively', () => {
    expect(lockState(null)).toEqual({ locked: false, retryAfterSeconds: 0 });
    expect(emailKey(' Foo@Bar.com ')).toBe(emailKey('foo@bar.com'));
    expect(emailKey('a@b.com')).not.toBe(emailKey('c@d.com'));
  });
});

describe('invite tokens', () => {
  it('only accepts well-formed 43 character base64url tokens', () => {
    expect(isTokenShape('A'.repeat(43))).toBe(true);
    for (const bad of ['', 'short', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '!', "'; drop table--", 42, null, undefined]) {
      expect(isTokenShape(bad)).toBe(false);
    }
  });
  it('hashes deterministically and never returns the token', () => {
    const h = hashToken('abc');
    expect(h).toBe(hashToken('abc'));
    expect(h).not.toContain('abc');
    expect(h).toHaveLength(64);
  });
  it('builds links without double slashes', () => {
    expect(buildInviteLink('T', 'https://x.example/')).toBe('https://x.example/invite/T');
    expect(buildInviteLink('T', 'https://x.example')).toBe('https://x.example/invite/T');
  });
});

describe('invite accept body', () => {
  it('a password reset sends no name and must still be valid', async () => {
    const { z } = await import('zod');
    const Body = z.object({ token: z.string().min(1).max(200), name: z.string().trim().max(40).optional(), password: z.string().min(1).max(128) });
    expect(Body.safeParse({ token: 'x', password: 'abc' }).success).toBe(true);
    expect(Body.safeParse({ token: 'x', name: 'A'.repeat(41), password: 'abc' }).success).toBe(false);
  });
});
