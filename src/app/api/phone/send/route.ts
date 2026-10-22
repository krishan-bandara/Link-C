import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { HttpError, handle, requireUser } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';
import { readPhone } from '@/lib/phone';
import { rateLimit } from '@/lib/rate-limit';
import { sendSms } from '@/lib/sms';
import { adminClient } from '@/lib/supabase/admin';

export const POST = handle(async () => {
  const { user } = await requireUser();
  if (!rateLimit(`phone-send:${user.id}`, 3, 60 * 60_000)) throw new HttpError(429, 'Too many requests, try again later');

  const db = adminClient();
  const { data: profile } = await db.from('profiles').select('phone_enc').eq('id', user.id).maybeSingle();
  if (!profile?.phone_enc) throw new HttpError(400, 'No phone number on file');
  const to = readPhone(profile.phone_enc);
  if (!to) throw new HttpError(400, 'No phone number on file');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await db.from('phone_verifications').upsert({
    user_id: user.id,
    code_hash: sha256(code),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    attempts: 0,
  });
  if (error) throw error;

  const res = await sendSms({ to, text: `Your verification code is ${code}`, userId: user.id, kind: 'verify' });
  if (!res.ok) {
    // No code was delivered, so do not keep one that could be guessed.
    await db.from('phone_verifications').delete().eq('user_id', user.id);
    throw new HttpError(502, 'Could not send the code right now');
  }
  return NextResponse.json({ ok: true });
});
