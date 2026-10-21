import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { cleanupUploadSession, getFailure, ownedSession } from '@/lib/media';
import { adminClient } from '@/lib/supabase/admin';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const s = await ownedSession(user.id, (await params).id);
  const out: Record<string, unknown> = { status: s.status, received: s.received, totalChunks: s.total_chunks, chunkSize: s.chunk_size };
  if (s.status === 'done') {
    // the session id is also the media_items id
    const { data } = await adminClient().from('media_items').select('message_id').eq('id', s.id).maybeSingle();
    if (data) out.messageId = data.message_id;
  }
  if (s.status === 'failed') out.error = getFailure(s.id) ?? 'Upload failed';
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
});

/** Cancel on purpose: drops the pieces already received. An upload that is being assembled cannot be cancelled. */
export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const s = await ownedSession(user.id, (await params).id);
  if (s.status === 'processing') throw new HttpError(409, 'Already being processed');
  if (s.status === 'done') return NextResponse.json({ ok: true });
  await cleanupUploadSession(s.id);
  await adminClient().from('upload_sessions').delete().eq('id', s.id);
  return NextResponse.json({ ok: true });
});
