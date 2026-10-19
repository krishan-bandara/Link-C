import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, open, readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Small adapter so the storage provider can be swapped without touching the app. */
export interface BlobStore {
  readonly name: 'b2' | 'local';
  put(key: string, localPath: string): Promise<void>;
  getRange(key: string, start: number, endInclusive: number): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), 'data');

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(key)) throw new Error('bad object key');
  return key;
}

export class LocalStore implements BlobStore {
  readonly name = 'local' as const;
  constructor(private dir: string) {}
  private p(key: string) {
    return path.join(this.dir, safeKey(key));
  }
  async put(key: string, localPath: string) {
    await mkdir(this.dir, { recursive: true });
    await copyFile(localPath, this.p(key));
  }
  async getRange(key: string, start: number, endInclusive: number) {
    const fh = await open(this.p(key), 'r');
    try {
      const len = endInclusive - start + 1;
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }
  async delete(key: string) {
    await rm(this.p(key), { force: true });
  }
  async list() {
    await mkdir(this.dir, { recursive: true });
    return readdir(this.dir);
  }
  async usedBytes() {
    let total = 0;
    for (const f of await this.list()) total += (await stat(path.join(this.dir, f))).size;
    return total;
  }
}

export class B2Store implements BlobStore {
  readonly name = 'b2' as const;
  private s3: S3Client;
  constructor(
    private bucket: string,
    endpoint: string,
    region: string,
    keyId: string,
    appKey: string,
  ) {
    this.s3 = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: appKey },
      forcePathStyle: true,
      maxAttempts: 3,
      requestHandler: {
        connectionTimeout: 15_000,
        requestTimeout: 120_000,
        httpsAgent: { keepAlive: true, maxSockets: 25 },
      },
    });
  }
  /** Downloads the whole (encrypted) object to destPath unless it is larger than maxBytes. Returns false if skipped. */
  async downloadTo(key: string, destPath: string, maxBytes: number): Promise<boolean> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    const body = res.Body as Readable;
    if ((res.ContentLength ?? Infinity) > maxBytes) {
      body.destroy();
      return false;
    }
    await pipeline(body, createWriteStream(destPath));
    return true;
  }
  async put(key: string, localPath: string) {
    const { size } = await stat(localPath);
    // A file stream cannot be replayed by the SDK, so retry here with a fresh stream each time.
    // B2 over a home link sometimes resets idle keep-alive sockets or is slow to connect.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: safeKey(key),
            Body: createReadStream(localPath),
            ContentLength: size,
            ContentType: 'application/octet-stream',
            ServerSideEncryption: 'AES256',
          }),
        );
        return;
      } catch (e) {
        lastErr = e;
        const err = e as { name?: string; code?: string };
        console.error(`b2 put attempt ${attempt} failed: ${err.name ?? 'Error'} ${err.code ?? ''}`.trim());
        if (attempt < 6) await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    throw lastErr;
  }
  async getRange(key: string, start: number, endInclusive: number) {
    const res = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        Range: `bytes=${start}-${endInclusive}`,
      }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  /** Deletes every version so the file is really gone (B2 keeps old versions by default). */
  async delete(key: string) {
    safeKey(key);
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionMarker,
        }),
      );
      const all = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].filter((v) => v.Key === key);
      for (const v of all) {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key, VersionId: v.VersionId }));
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
  }
}

/**
 * Encrypted read cache in front of B2. The first view downloads the whole (still encrypted) file once,
 * later views and Range requests are served from local disk. Big files (videos) bypass it.
 * The cache holds only ciphertext, so it adds no new exposure; it is capped and evicts the oldest first.
 */
export class CachedStore implements BlobStore {
  readonly name = 'b2' as const;
  private inflight = new Map<string, Promise<string | null>>();
  constructor(
    private inner: B2Store,
    private dir: string,
    private maxTotal = 2 * 1024 ** 3,
    private maxObject = 64 * 1024 ** 2,
  ) {}
  private p(key: string) {
    return path.join(this.dir, safeKey(key));
  }
  async put(key: string, localPath: string) {
    await this.inner.put(key, localPath);
    // The file was just uploaded, so the next view is already warm.
    await mkdir(this.dir, { recursive: true });
    const size = (await stat(localPath)).size;
    if (size <= this.maxObject) await copyFile(localPath, this.p(key)).catch(() => {});
    await this.evict();
  }
  private async cached(key: string): Promise<string | null> {
    const file = this.p(key);
    try {
      await stat(file);
      void utimes(file, new Date(), new Date()).catch(() => {});
      return file;
    } catch {
      /* not cached */
    }
    let job = this.inflight.get(key);
    if (!job) {
      job = (async () => {
        await mkdir(this.dir, { recursive: true });
        const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
        try {
          if (!(await this.inner.downloadTo(key, tmp, this.maxObject))) return null;
          await rename(tmp, file);
          await this.evict();
          return file;
        } catch (e) {
          await rm(tmp, { force: true });
          throw e;
        } finally {
          this.inflight.delete(key);
        }
      })();
      this.inflight.set(key, job);
    }
    return job;
  }
  async getRange(key: string, start: number, endInclusive: number) {
    const file = await this.cached(key);
    if (!file) return this.inner.getRange(key, start, endInclusive);
    const fh = await open(file, 'r');
    try {
      const len = endInclusive - start + 1;
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }
  async delete(key: string) {
    await rm(this.p(key), { force: true });
    await this.inner.delete(key);
  }
  private async evict() {
    const names = (await readdir(this.dir).catch(() => [])).filter((n) => !n.endsWith('.tmp'));
    const files = await Promise.all(
      names.map(async (n) => {
        const s = await stat(path.join(this.dir, n)).catch(() => null);
        return s ? { n, size: s.size, t: s.mtimeMs } : null;
      }),
    );
    const list = files.filter((f): f is { n: string; size: number; t: number } => !!f).sort((a, b) => a.t - b.t);
    let total = list.reduce((s, f) => s + f.size, 0);
    for (const f of list) {
      if (total <= this.maxTotal) break;
      await rm(path.join(this.dir, f.n), { force: true });
      total -= f.size;
    }
  }
}

let snaps: LocalStore | undefined;
let media: BlobStore | undefined;

/** Snaps and one-time media: VM disk only, never B2. */
export function snapStore(): LocalStore {
  return (snaps ??= new LocalStore(path.join(dataDir(), 'snaps')));
}

/** Normal media: Backblaze B2 when configured, otherwise local disk (development, or before B2 is set up). */
export function mediaStore(): BlobStore {
  if (media) return media;
  if ((process.env.STORAGE_DRIVER ?? 'local') === 'b2') {
    const { B2_BUCKET, B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APP_KEY } = process.env;
    if (!B2_BUCKET || !B2_ENDPOINT || !B2_KEY_ID || !B2_APP_KEY) throw new Error('B2 is not fully configured');
    media = new CachedStore(
      new B2Store(B2_BUCKET, B2_ENDPOINT, B2_REGION || 'us-west-004', B2_KEY_ID, B2_APP_KEY),
      path.join(dataDir(), 'cache'),
    );
  } else {
    media = new LocalStore(path.join(dataDir(), 'media'));
  }
  return media;
}

export function storeFor(name: 'b2' | 'local', mode: 'normal' | 'once' | 'timed'): BlobStore {
  if (mode !== 'normal') return snapStore();
  const s = mediaStore();
  if (s.name !== name) {
    throw new Error(`media was stored in ${name} but the app is configured for ${s.name}`);
  }
  return s;
}

export { mkdir, rm };
