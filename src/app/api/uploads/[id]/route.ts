import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/auth';
import { getFailure, ownedSession } from '@/lib/media';
import { adminClient } from '@/lib/supabase/admin';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const s = await ownedSession(user.id, (await params).id);
  const out: Record<string, unknown> = { status: s.status, received: s.received, totalChunks: s.total_chunks };
  if (s.status === 'done') {
    // the session id is also the media_items id
    const { data } = await adminClient().from('media_items').select('message_id').eq('id', s.id).maybeSingle();
    if (data) out.messageId = data.message_id;
  }
  if (s.status === 'failed') out.error = getFailure(s.id) ?? 'Upload failed';
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
});
