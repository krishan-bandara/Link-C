import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { ownedSession } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';
import { processUpload } from '@/lib/upload-process';

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  if (!rateLimit(`complete:${user.id}`, 30, 60_000)) throw new HttpError(429, 'Too many requests');
  const s = await ownedSession(user.id, (await params).id);
  if (s.status !== 'uploading') throw new HttpError(409, 'Upload already completed');
  if (new Date(s.expires_at).getTime() < Date.now()) throw new HttpError(410, 'Upload expired');
  const have = new Set(s.received);
  for (let i = 0; i < s.total_chunks; i++) if (!have.has(i)) throw new HttpError(400, 'Some chunks are missing');

  // Atomic flip so a double-click cannot start two workers.
  const { data } = await adminClient()
    .from('upload_sessions')
    .update({ status: 'processing' })
    .eq('id', s.id)
    .eq('status', 'uploading')
    .select('id');
  if (!data?.length) throw new HttpError(409, 'Upload already completed');

  void processUpload(s.id); // detached; errors are handled inside
  return NextResponse.json({ status: 'processing' }, { status: 202 });
});
