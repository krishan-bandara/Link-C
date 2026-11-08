import { NextResponse } from 'next/server';
import { HttpError, handle, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { heartbeatResetAllowed } from '@/lib/sms';
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
  // Back online: every chat starts a fresh round of (at most 3) SMS the next time this person goes offline - but only if
  // enough time has passed since this person's SMS state last changed. Without this cooldown, a member could call this
  // endpoint every ~31-35 s (still within the rate limit above) to keep tripping "came back" and wipe sms_chat_state on every
  // call, re-triggering SMS 1 the moment they go offline again and burning the shared daily pool. A real return to the app
  // after any normal break is far longer than the cooldown, so the legitimate "opening the app resets the round" behaviour
  // is unaffected; at worst a reset is briefly delayed, never skipped outright.
  if (cameBack) {
    const { data: chatRows, error: chatErr } = await db
      .from('sms_chat_state')
      .select('first_at,last_sent_at,last_attempt_at')
      .eq('user_id', user.id);
    if (chatErr) throw chatErr;
    if (heartbeatResetAllowed(chatRows ?? [], Date.now())) {
      const { error: resetErr } = await db.from('sms_chat_state').delete().eq('user_id', user.id);
      if (resetErr) throw resetErr;
    }
  }
  return NextResponse.json({ ok: true });
});
