import { NextResponse } from 'next/server';
import { HttpError, handle, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

export const POST = handle(async () => {
  const { user } = await requireUser();
  if (!rateLimit(`presence:${user.id}`, 20, 60_000)) throw new HttpError(429, 'Too many requests');
  const { error } = await adminClient()
    .from('presence_state')
    .upsert({ user_id: user.id, last_seen_at: new Date().toISOString(), sms_sent_this_period: false, push_sent_this_period: false, sms_step: 0, sms_first_at: null, sms_last_sent_at: null, last_sms_at: null });
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
