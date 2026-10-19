import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, HttpError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { GENERIC_LOGIN_ERROR } from '@/lib/auth-policy';
import { clearFailures, reserveAttempt } from '@/lib/login-guard';
import { ACTIVITY_COOKIE, makeActivityCookie } from '@/lib/idle';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) });

const DISABLED = 'This account has been disabled. Contact the administrator.';
const noStore = { 'Cache-Control': 'no-store' };

export const POST = handle(async (req: Request) => {
  // Login must come from our own pages (blocks cross-site login forgery).
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== (process.env.APP_URL ?? '')) {
    throw new HttpError(403, 'Not allowed');
  }
  if (!rateLimit(`login:${clientIp(req)}`, 20, 10 * 60_000)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 10 minutes.', retryAfterSeconds: 600 },
      { status: 429, headers: { ...noStore, 'Retry-After': '600' } },
    );
  }
  const { email, password } = Body.parse(await req.json());

  const lock = await reserveAttempt(email);
  if (!lock.allowed) {
    const mins = Math.max(1, Math.ceil(lock.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfterSeconds: lock.retryAfterSeconds },
      { status: 429, headers: { ...noStore, 'Retry-After': String(lock.retryAfterSeconds) } },
    );
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // GoTrue may report a ban before it checks the password, so a banned account must look exactly like a wrong
    // password here; otherwise anyone could find out which accounts are disabled. (The attempt is already counted.)
    if (error && error.status && error.status >= 500) throw new Error('auth service unavailable');
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 401, headers: noStore });
  }

  const { data: profile } = await adminClient().from('profiles').select('login_disabled').eq('id', data.user.id).maybeSingle();
  if (!profile || profile.login_disabled) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    return NextResponse.json({ error: DISABLED }, { status: 403, headers: noStore });
  }

  await clearFailures(email);
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(ACTIVITY_COOKIE, await makeActivityCookie(data.user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.headers.get('x-forwarded-proto') === 'https' || new URL(req.url).protocol === 'https:',
    path: '/',
    maxAge: 24 * 3600,
  });
  return res;
});
