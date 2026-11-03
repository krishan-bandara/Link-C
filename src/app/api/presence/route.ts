import { NextResponse } from 'next/server';
import { HttpError, handle, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

export const POST = handle(async () => {
  const { user } = await requireUser();
  if (!rateLimit(`presence:${user.id}`, 60, 60_000)) throw new HttpError(429, 'Too many requests');
  const db = adminClient();
  // Read the previous heartbeat first, to know whether this person is just coming back.
  const { data: prev, error: prevErr } = await db.from('presence_state').select('last_seen_at').eq('user_id', user.id).maybeSingle();
  if (prevErr) throw prevErr;
  const prevMs = prev?.last_seen_at ? new Date(prev.last_seen_at as string).getTime() : NaN;
  const cameBack = !prev || Number.isNaN(prevMs) || Date.now() - prevMs > 25_000;
  const { error } = await db
    .from('presence_state')
    .upsert({ user_id: user.id, last_seen_at: new Date().toISOString(), sms_sent_this_period: false, push_sent_this_period: false, sms_step: 0, sms_first_at: null, sms_last_sent_at: null, last_sms_at: null });
  if (error) throw error;
  // Back online: every chat starts a fresh round of (at most 3) SMS the next time this person goes offline.
  if (cameBack) {
    const { error: resetErr } = await db.from('sms_chat_state').delete().eq('user_id', user.id);
    if (resetErr) throw resetErr;
  }
  return NextResponse.json({ ok: true });
});
