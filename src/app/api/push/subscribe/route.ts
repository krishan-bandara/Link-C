import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { allowedEndpoint } from '@/lib/push';
import { rateLimit } from '@/lib/rate-limit';

const Sub = z.object({
  endpoint: z.string().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Save this phone's push address. */
export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  if (!rateLimit(`push:${user.id}`, 20, 60_000)) throw new HttpError(429, 'Too many requests');
  const s = Sub.parse(await req.json());
  if (!allowedEndpoint(s.endpoint)) throw new HttpError(400, 'Unsupported push service');
  const db = adminClient();
  // an address that already belongs to someone else is never re-assigned (a phone shared by two logins keeps its first owner until it is removed)
  const { data: existing } = await db.from('push_subscriptions').select('user_id').eq('endpoint', s.endpoint).maybeSingle();
  if (existing && existing.user_id !== user.id) throw new HttpError(409, 'This device is already registered to another account. Turn notifications off there first.');
  // keep a person to a handful of devices
  const { count } = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if ((count ?? 0) >= 10) throw new HttpError(400, 'Too many devices. Turn notifications off on another one first.');
  const { error } = await db
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});

/** Forget this phone. */
export const DELETE = handle(async (req: Request) => {
  const { user } = await requireUser();
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await req.json());
  await adminClient().from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});
