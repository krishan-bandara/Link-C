import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CachedStore } from '@/lib/storage';

const K = 'abcdefghijklmnop1234';
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cs-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fake(size: number, opts: { short?: boolean } = {}) {
  const calls = { download: 0, range: 0 };
  const data = Buffer.alloc(size, 7);
  return {
    calls,
    put: async () => {},
    delete: async () => {},
    getRange: async (_k: string, s: number, e: number) => {
      calls.range++;
      return data.subarray(s, e + 1);
    },
    downloadTo: async (_k: string, dest: string, max: number) => {
      calls.download++;
      if (size > max) return false;
      await writeFile(dest, data);
      return true;
    },
  };
}

describe('CachedStore', () => {
  it('remembers too-big keys and skips downloadTo afterwards', async () => {
    const inner = fake(100);
    const s = new CachedStore(inner, dir, 1000, 10);
    await s.getRange(K, 0, 3);
    await s.getRange(K, 0, 3);
    await s.getRange(K, 0, 3);
    expect(inner.calls.download).toBe(1);
    expect(inner.calls.range).toBe(3);
  });

  it('serves small objects from the cache', async () => {
    const inner = fake(20);
    const s = new CachedStore(inner, dir, 1000, 100);
    expect((await s.getRange(K, 0, 4)).length).toBe(5);
    await s.getRange(K, 0, 4);
    expect(inner.calls.download).toBe(1);
    expect(inner.calls.range).toBe(0);
  });

  it('sweeps stale tmp files during eviction', async () => {
    const stale = path.join(dir, 'x.tmp');
    await writeFile(stale, 'a');
    const old = new Date(Date.now() - 2 * 3_600_000);
    await utimes(stale, old, old);
    const fresh = path.join(dir, 'y.tmp');
    await writeFile(fresh, 'a');
    const s = new CachedStore(fake(20), dir, 1000, 100);
    await s.getRange(K, 0, 1);
    const names = await readdir(dir);
    expect(names).not.toContain('x.tmp');
    expect(names).toContain('y.tmp');
  });

  it('does not throw when eviction fails after a good download', async () => {
    const s = new CachedStore(fake(20), dir, 1000, 100);
    (s as unknown as { evict: () => Promise<void> }).evict = async () => {
      throw new Error('boom');
    };
    await expect(s.getRange(K, 0, 1)).resolves.toBeTruthy();
  });
});
