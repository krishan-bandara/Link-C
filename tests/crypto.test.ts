import { randomBytes } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.MASTER_KEY = randomBytes(32).toString('base64');
process.env.SIGNING_KEY = randomBytes(32).toString('base64');

const { decryptRange, encryptFile, newFileKey, signToken, unwrapKey, verifyToken, wrapKey, decryptText, encryptText } =
  await import('@/lib/crypto');

const SIZE = Math.floor(3.5 * 1024 * 1024);
let dir: string;
let plain: Buffer;
let enc: string;
const key = newFileKey();

const reader = (file: string) => async (s: number, e: number) => {
  const fh = await open(file, 'r');
  try {
    const b = Buffer.alloc(e - s + 1);
    const { bytesRead } = await fh.read(b, 0, b.length, s);
    return b.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
};

async function collect(file: string, k: Buffer, start: number, end: number) {
  const parts: Buffer[] = [];
  for await (const c of decryptRange(reader(file), k, SIZE, start, end)) parts.push(c);
  return Buffer.concat(parts);
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'linkc-'));
  plain = randomBytes(SIZE);
  const src = path.join(dir, 'plain.bin');
  enc = path.join(dir, 'enc.bin');
  await writeFile(src, plain);
  expect(await encryptFile(src, enc, key)).toBe(SIZE);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('segmented file encryption', () => {
  it('round-trips the whole file', async () => {
    expect((await collect(enc, key, 0, SIZE - 1)).equals(plain)).toBe(true);
  });

  it('returns correct bytes for random ranges, including across segment boundaries', async () => {
    const M = 1024 * 1024;
    const fixed: [number, number][] = [[M - 1, M], [M - 10, 2 * M + 10], [0, 0], [SIZE - 1, SIZE - 1], [3 * M - 5, SIZE - 1]];
    const random: [number, number][] = Array.from({ length: 25 }, () => {
      const a = Math.floor(Math.random() * SIZE);
      const b = a + Math.floor(Math.random() * (SIZE - a));
      return [a, b];
    });
    for (const [s, e] of [...fixed, ...random]) {
      expect((await collect(enc, key, s, e)).equals(plain.subarray(s, e + 1))).toBe(true);
    }
  });

  it('rejects the wrong key and tampered ciphertext', async () => {
    await expect(collect(enc, newFileKey(), 0, 100)).rejects.toThrow();
    const bad = path.join(dir, 'bad.bin');
    const copy = Buffer.from(await (await reader(enc)(0, SIZE + 1000))); // header + data
    copy[500] ^= 0xff;
    await writeFile(bad, copy);
    await expect(collect(bad, key, 0, 1000)).rejects.toThrow();
  });

  it('rejects bad ranges', async () => {
    await expect(collect(enc, key, 5, 4)).rejects.toThrow('bad range');
    await expect(collect(enc, key, 0, SIZE)).rejects.toThrow('bad range');
  });
});

describe('key wrapping and text sealing', () => {
  it('wrapKey/unwrapKey round-trip and detect tampering', () => {
    const w = wrapKey(key);
    expect(unwrapKey(w).equals(key)).toBe(true);
    const raw = Buffer.from(w, 'base64');
    raw[20] ^= 1;
    expect(() => unwrapKey(raw.toString('base64'))).toThrow();
  });
  it('encryptText/decryptText round-trip', () => {
    expect(decryptText(encryptText('+94771234567'))).toBe('+94771234567');
  });
});

describe('signed tokens', () => {
  it('verifies a fresh token', () => {
    expect(verifyToken(signToken('snap:123', 30))).toBe('snap:123');
  });
  it('rejects tampered payload and signature', () => {
    const t = signToken('snap:123', 30);
    const [b, s] = t.split('.');
    const forged = Buffer.from(Buffer.from(b, 'base64url').toString().replace('123', '999')).toString('base64url');
    expect(verifyToken(`${forged}.${s}`)).toBeNull();
    expect(verifyToken(`${b}.${s.slice(0, -2)}xx`)).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
  });
  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    const t = signToken('x', 10);
    vi.advanceTimersByTime(11_000);
    expect(verifyToken(t)).toBeNull();
    vi.useRealTimers();
  });
});
