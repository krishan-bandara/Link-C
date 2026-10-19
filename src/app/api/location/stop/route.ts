import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, handle, HttpError, requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({ shareId: z.string().uuid() });

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  const { shareId } = Body.parse(await req.json().catch(() => ({})));
  const db = adminClient();
  const { data: share } = await db
    .from('location_shares')
    .select('id,sharer_id,requested_by,status')
    .eq('id', shareId)
    .maybeSingle();
  if (!share || (share.sharer_id !== user.id && share.requested_by !== user.id)) throw new HttpError(404, 'Not found');
  if (share.status !== 'requested' && share.status !== 'active') return NextResponse.json({ ok: true });
  const { error } = await db
    .from('location_shares')
    .update({ status: 'stopped', last_lat: null, last_lng: null, last_accuracy: null })
    .eq('id', share.id);
  if (error) throw new Error('location update failed');
  await audit(user.id, 'location_stopped', share.id);
  return NextResponse.json({ ok: true });
});
