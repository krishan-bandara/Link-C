import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, handle, HttpError, requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({
  shareId: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
  minutes: z.union([z.literal(15), z.literal(60), z.literal(480)]).optional(),
});

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  const b = Body.parse(await req.json().catch(() => ({})));
  const db = adminClient();
  const { data: share } = await db
    .from('location_shares')
    .select('id,sharer_id,status')
    .eq('id', b.shareId)
    .maybeSingle();
  if (!share || share.sharer_id !== user.id) throw new HttpError(404, 'Not found');
  if (share.status !== 'requested') throw new HttpError(409, 'This request is no longer open');

  if (b.action === 'accept') {
    if (!b.minutes) throw new HttpError(400, 'Choose a duration');
    const expiresAt = new Date(Date.now() + b.minutes * 60_000).toISOString();
    const { error } = await db
      .from('location_shares')
      .update({ status: 'active', duration_minutes: b.minutes, expires_at: expiresAt })
      .eq('id', share.id)
      .eq('status', 'requested');
    if (error) throw new Error('location update failed');
    await audit(user.id, 'location_accepted', share.id);
    return NextResponse.json({ ok: true, expiresAt });
  }
  const { error } = await db
    .from('location_shares')
    .update({ status: 'declined' })
    .eq('id', share.id)
    .eq('status', 'requested');
  if (error) throw new Error('location update failed');
  await audit(user.id, 'location_declined', share.id);
  return NextResponse.json({ ok: true });
});
