import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { ownedSession } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';
import { processUpload } from '@/lib/upload-process';

// Process-wide limit: processing writes several temp copies and runs ffmpeg/sharp, so only a few run at once.
const MAX_CONCURRENT = 2;
const MAX_QUEUED = 20;
let running = 0;
const waiters: Array<() => void> = [];

async function runLimited(sessionId: string): Promise<void> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  else running++;
  try {
    await processUpload(sessionId);
  } catch {
    // processUpload normally handles its own errors; make sure the session still ends in a terminal state.
    await adminClient().from('upload_sessions').update({ status: 'failed' }).eq('id', sessionId).eq('status', 'processing');
  } finally {
    const next = waiters.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else running--;
  }
}

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  if (!rateLimit(`complete:${user.id}`, 30, 60_000)) throw new HttpError(429, 'Too many requests');
  const s = await ownedSession(user.id, (await params).id);
  if (s.status !== 'uploading') throw new HttpError(409, 'Upload already completed');
  if (new Date(s.expires_at).getTime() < Date.now()) throw new HttpError(410, 'Upload expired');
  const have = new Set(s.received);
  for (let i = 0; i < s.total_chunks; i++) if (!have.has(i)) throw new HttpError(400, 'Some chunks are missing');

  if (running >= MAX_CONCURRENT && waiters.length >= MAX_QUEUED) throw new HttpError(429, 'Server is busy processing uploads, try again shortly');

  // Atomic flip so a double-click cannot start two workers.
  const { data } = await adminClient()
    .from('upload_sessions')
    .update({ status: 'processing' })
    .eq('id', s.id)
    .eq('status', 'uploading')
    .select('id');
  if (!data?.length) throw new HttpError(409, 'Upload already completed');

  void runLimited(s.id); // detached; queued when 2 are already processing
  return NextResponse.json({ status: 'processing' }, { status: 202 });
});
