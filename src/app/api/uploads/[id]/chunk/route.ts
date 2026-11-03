import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { encryptChunk, unwrapKey } from '@/lib/crypto';
import { ownedSession, uploadDir } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

async function readExact(req: Request, expected: number): Promise<Buffer> {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'Empty body');
  const parts: Buffer[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > expected) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'Chunk too large');
    }
    parts.push(Buffer.from(value));
  }
  if (n !== expected) throw new HttpError(400, 'Chunk size mismatch');
  return Buffer.concat(parts, n);
}

const MAX_CONCURRENT_PER_USER = 4;
const inflight = new Map<string, number>();

export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  if (!rateLimit(`chunk:${user.id}`, 200, 60_000)) throw new HttpError(429, 'Too many requests');
  const n = inflight.get(user.id) ?? 0;
  if (n >= MAX_CONCURRENT_PER_USER) throw new HttpError(429, 'Too many chunks at once, retry shortly');
  inflight.set(user.id, n + 1);
  try {
    return await putChunk(req, ctx, user.id);
  } finally {
    const left = (inflight.get(user.id) ?? 1) - 1;
    if (left <= 0) inflight.delete(user.id);
    else inflight.set(user.id, left);
  }
});

async function putChunk(req: Request, { params }: { params: Promise<{ id: string }> }, userId: string) {
  const user = { id: userId };
  const s = await ownedSession(user.id, (await params).id);
  if (s.status !== 'uploading') throw new HttpError(409, 'Upload is not accepting chunks');
  if (new Date(s.expires_at).getTime() < Date.now()) throw new HttpError(410, 'Upload expired');

  const raw = new URL(req.url).searchParams.get('i') ?? '';
  const i = /^\d{1,6}$/.test(raw) ? Number(raw) : -1;
  if (i < 0 || i >= s.total_chunks) throw new HttpError(400, 'Bad chunk index');
  const expected = i === s.total_chunks - 1 ? Number(s.total_size) - s.chunk_size * i : s.chunk_size;

  const len = req.headers.get('content-length');
  if (len === null) throw new HttpError(411, 'Content-Length required');
  if (Number(len) !== expected) throw new HttpError(Number(len) > expected ? 413 : 400, 'Chunk size mismatch');

  const plain = await readExact(req, expected);
  const enc = encryptChunk(plain, unwrapKey(s.temp_key_wrapped), `${s.id}:${i}`);
  const dir = uploadDir(s.id);
  await mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, `${i}.part`);
  const tmpPath = path.join(dir, `${i}.part.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmpPath, enc);
  await rename(tmpPath, finalPath);

  // The session may have moved on (completed, failed, cleaned up) while we were writing: do not leave an orphan chunk.
  const { data: cur } = await adminClient().from('upload_sessions').select('status').eq('id', s.id).maybeSingle();
  if (!cur || cur.status !== 'uploading') {
    await rm(finalPath, { force: true }).catch(() => {});
    throw new HttpError(409, 'Upload is not accepting chunks');
  }

  const { data, error } = await adminClient().rpc('append_chunk', { p_session: s.id, p_idx: i });
  if (error) throw new Error('could not record chunk');
  return NextResponse.json({ received: (data as number[]) ?? [] });
}
