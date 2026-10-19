import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({
  shareId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(),
});

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  const b = Body.parse(await req.json().catch(() => ({})));
  if (!rateLimit(`loc-update:${user.id}`, 12, 60_000)) throw new HttpError(429, 'Too many requests');
  const db = adminClient();
  const { data: share } = await db
    .from('location_shares')
    .select('id,sharer_id,status,expires_at')
    .eq('id', b.shareId)
    .maybeSingle();
  if (!share || share.sharer_id !== user.id) throw new HttpError(404, 'Not found');
  if (share.status === 'requested') throw new HttpError(409, 'Sharing has not been accepted yet');
  if (share.status !== 'active' || !share.expires_at || new Date(share.expires_at).getTime() <= Date.now()) {
    if (share.status === 'active') {
      await db.from('location_shares').update({ status: 'expired', last_lat: null, last_lng: null, last_accuracy: null }).eq('id', share.id);
    }
    throw new HttpError(410, 'Sharing has ended');
  }
  const { error } = await db
    .from('location_shares')
    .update({ last_lat: b.lat, last_lng: b.lng, last_accuracy: b.accuracy ?? null, last_at: new Date().toISOString() })
    .eq('id', share.id);
  if (error) throw new Error('location update failed');
  return NextResponse.json({ ok: true });
});
