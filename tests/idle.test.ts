import { beforeAll, describe, expect, it } from 'vitest';
import { checkActivityCookie, makeActivityCookie, SERVER_MAX_IDLE_MS } from '../src/lib/idle';

beforeAll(() => {
  process.env.SIGNING_KEY = 'test-signing-key-test-signing-key-test-signing-key=';
});

describe('activity cookie', () => {
  it('accepts a fresh cookie of the same user', async () => {
    const c = await makeActivityCookie('user-1');
    expect(await checkActivityCookie(c, 'user-1')).toBe(true);
  });
  it('rejects a cookie that belongs to another user', async () => {
    const c = await makeActivityCookie('user-1');
    expect(await checkActivityCookie(c, 'user-2')).toBe(false);
  });
  it('rejects an expired cookie', async () => {
    const now = Date.now();
    const c = await makeActivityCookie('user-1', now - SERVER_MAX_IDLE_MS - 1000);
    expect(await checkActivityCookie(c, 'user-1', now)).toBe(false);
  });
  it('accepts a cookie just inside the limit', async () => {
    const now = Date.now();
    const c = await makeActivityCookie('user-1', now - SERVER_MAX_IDLE_MS + 1000);
    expect(await checkActivityCookie(c, 'user-1', now)).toBe(true);
  });
  it('rejects tampering, a future timestamp, garbage and empty values', async () => {
    const now = Date.now();
    const c = await makeActivityCookie('user-1', now);
    const [ts, sig] = c.split('.');
    expect(await checkActivityCookie(`${Number(ts) + 1}.${sig}`, 'user-1', now)).toBe(false);
    expect(await checkActivityCookie(`${ts}.${sig.slice(0, -2)}xx`, 'user-1', now)).toBe(false);
    expect(await checkActivityCookie(await makeActivityCookie('user-1', now + 60_000), 'user-1', now)).toBe(false);
    for (const bad of ['', 'nope', '.', '123.', undefined, null]) expect(await checkActivityCookie(bad as string, 'user-1', now)).toBe(false);
  });
  it('fails closed when the signing key is missing', async () => {
    const c = await makeActivityCookie('user-1');
    const old = process.env.SIGNING_KEY;
    delete process.env.SIGNING_KEY;
    expect(await checkActivityCookie(c, 'user-1')).toBe(false);
    process.env.SIGNING_KEY = old;
  });
});
