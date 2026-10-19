import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError, audit, handle, requireUser } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({ code: z.string().regex(/^\d{6}$/) });

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  if (!rateLimit(`phone-verify:${user.id}`, 20, 10 * 60_000)) throw new HttpError(429, 'Too many requests, try again later');
  const { code } = Body.parse(await req.json().catch(() => ({})));
  const db = adminClient();

  const { data: row } = await db
    .from('phone_verifications')
    .select('code_hash,expires_at,attempts')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) throw new HttpError(400, 'Request a new code first');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from('phone_verifications').delete().eq('user_id', user.id);
    throw new HttpError(400, 'That code has expired. Request a new one.');
  }

  const attempts = row.attempts + 1;
  // Optimistic lock: parallel guesses cannot all read the same attempt count.
  const { data: bumped } = await db
    .from('phone_verifications')
    .update({ attempts })
    .eq('user_id', user.id)
    .eq('attempts', row.attempts)
    .select('user_id');
  if (!bumped?.length) throw new HttpError(429, 'Please try again');
  if (attempts >= 5) await db.from('phone_verifications').delete().eq('user_id', user.id);

  const a = Buffer.from(sha256(code), 'hex');
  const b = Buffer.from(row.code_hash, 'hex');
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    throw new HttpError(400, attempts >= 5 ? 'Too many attempts. Request a new code.' : 'That code did not match');
  }

  await db.from('profiles').update({ phone_verified_at: new Date().toISOString() }).eq('id', user.id);
  await db.from('phone_verifications').delete().eq('user_id', user.id);
  await audit(user.id, 'phone_verified');
  return NextResponse.json({ ok: true });
});
