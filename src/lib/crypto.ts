import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';

const SEG = 1024 * 1024; // 1 MiB plaintext segments, so Range requests only decrypt what they need
const TAG = 16;
const HEADER = 20; // "LCE1" + 8 byte plaintext size + 8 byte nonce prefix
const MAGIC = Buffer.from('LCE1');

export function masterKey(): Buffer {
  const b64 = process.env.MASTER_KEY ?? '';
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('MASTER_KEY must be 32 bytes, base64 encoded');
  return key;
}

function signingKey(): Buffer {
  const b64 = process.env.SIGNING_KEY ?? '';
  const key = Buffer.from(b64, 'base64');
  if (key.length < 32) throw new Error('SIGNING_KEY must be at least 32 bytes, base64 encoded');
  return key;
}

// ---- small secrets (phone numbers, SMS credentials, per-file keys) wrapped with the master key
function seal(plain: Buffer, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

function open_(blob: Buffer, key: Buffer, aad: string): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - TAG);
  const ct = blob.subarray(12, blob.length - TAG);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

export function encryptText(plain: string): string {
  return 'v1:' + seal(Buffer.from(plain, 'utf8'), masterKey(), 'text').toString('base64');
}

export function decryptText(stored: string): string {
  if (!stored.startsWith('v1:')) throw new Error('unknown ciphertext version');
  return open_(Buffer.from(stored.slice(3), 'base64'), masterKey(), 'text').toString('utf8');
}

export function wrapKey(fileKey: Buffer): string {
  return seal(fileKey, masterKey(), 'filekey').toString('base64');
}

export function unwrapKey(wrapped: string): Buffer {
  return open_(Buffer.from(wrapped, 'base64'), masterKey(), 'filekey');
}

export function newFileKey(): Buffer {
  return randomBytes(32);
}

// ---- segmented file encryption (AES-256-GCM, one nonce per segment, random access)
function segNonce(prefix: Buffer, index: number): Buffer {
  const n = Buffer.alloc(12);
  prefix.copy(n, 0);
  n.writeUInt32BE(index, 8);
  return n;
}

export function encryptedSize(plainSize: number): number {
  return HEADER + plainSize + TAG * Math.ceil(plainSize / SEG);
}

export async function encryptFile(srcPath: string, dstPath: string, key: Buffer): Promise<number> {
  const src = await open(srcPath, 'r');
  const dst = await open(dstPath, 'w');
  try {
    const { size } = await src.stat();
    if (size <= 0) throw new Error('empty file');
    const prefix = randomBytes(8);
    const header = Buffer.alloc(HEADER);
    MAGIC.copy(header, 0);
    header.writeBigUInt64BE(BigInt(size), 4);
    prefix.copy(header, 12);
    await dst.write(header);
    const buf = Buffer.alloc(SEG);
    let index = 0;
    for (let pos = 0; pos < size; pos += SEG, index++) {
      const { bytesRead } = await src.read(buf, 0, Math.min(SEG, size - pos), pos);
      const c = createCipheriv('aes-256-gcm', key, segNonce(prefix, index));
      c.setAAD(header);
      const ct = Buffer.concat([c.update(buf.subarray(0, bytesRead)), c.final()]);
      await dst.write(Buffer.concat([ct, c.getAuthTag()]));
    }
    return size;
  } finally {
    await src.close();
    await dst.close();
  }
}

export type RangeReader = (start: number, endInclusive: number) => Promise<Buffer>;

/** Yields decrypted bytes [start, end] (inclusive) of a segmented encrypted object. */
export async function* decryptRange(
  read: RangeReader,
  key: Buffer,
  plainSize: number,
  start: number,
  end: number,
): AsyncGenerator<Buffer> {
  if (start < 0 || end >= plainSize || start > end) throw new Error('bad range');
  const header = await read(0, HEADER - 1);
  if (header.length !== HEADER || !header.subarray(0, 4).equals(MAGIC)) throw new Error('bad header');
  if (Number(header.readBigUInt64BE(4)) !== plainSize) throw new Error('size mismatch');
  const prefix = header.subarray(12, 20);

  const firstSeg = Math.floor(start / SEG);
  const lastSeg = Math.floor(end / SEG);
  const BATCH = 4;
  for (let s = firstSeg; s <= lastSeg; s += BATCH) {
    const e = Math.min(lastSeg, s + BATCH - 1);
    const encStart = HEADER + s * (SEG + TAG);
    const lastPlainLen = e === Math.ceil(plainSize / SEG) - 1 ? plainSize - e * SEG : SEG;
    const encEnd = HEADER + e * (SEG + TAG) + lastPlainLen + TAG - 1;
    const chunk = await read(encStart, encEnd);
    let off = 0;
    for (let i = s; i <= e; i++) {
      const plainLen = i === Math.ceil(plainSize / SEG) - 1 ? plainSize - i * SEG : SEG;
      const seg = chunk.subarray(off, off + plainLen + TAG);
      off += plainLen + TAG;
      const d = createDecipheriv('aes-256-gcm', key, segNonce(prefix, i));
      d.setAAD(header);
      d.setAuthTag(seg.subarray(plainLen));
      const plain = Buffer.concat([d.update(seg.subarray(0, plainLen)), d.final()]);
      const from = i === firstSeg ? start - i * SEG : 0;
      const to = i === lastSeg ? end - i * SEG + 1 : plainLen;
      yield plain.subarray(from, to);
    }
  }
}

// ---- upload chunk encryption (temp area): iv | ciphertext | tag
export function encryptChunk(data: Buffer, key: Buffer, aad: string): Buffer {
  return seal(data, key, aad);
}
export function decryptChunk(blob: Buffer, key: Buffer, aad: string): Buffer {
  return open_(blob, key, aad);
}

// ---- short-lived signed tokens (snap viewing)
export function signToken(payload: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${payload}.${exp}`;
  const sig = createHmac('sha256', signingKey()).update(body).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  const expected = createHmac('sha256', signingKey()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const idx = body.lastIndexOf('.');
  const exp = Number(body.slice(idx + 1));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return body.slice(0, idx);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export type { FileHandle };
