import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { ACTIVITY_COOKIE, checkActivityCookie, makeActivityCookie } from '@/lib/idle';
import { rateLimit } from '@/lib/rate-limit';

const base = (req: Request) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: req.headers.get('x-forwarded-proto') === 'https' || new URL(req.url).protocol === 'https:',
  path: '/',
});

/**
 * The user did something: refresh the signed activity cookie. The first call is only accepted right after a
 * sign-in (or while a recent cookie exists), so a stolen, long-idle session cookie cannot start its own clock.
 */
export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  if (!rateLimit(`activity:${user.id}`, 60, 60_000)) throw new HttpError(429, 'Too many requests');
  const current = (await cookies()).get(ACTIVITY_COOKIE)?.value;
  const recentSignIn = !!user.last_sign_in_at && Date.now() - new Date(user.last_sign_in_at).getTime() < 120_000;
  if (!recentSignIn && !(await checkActivityCookie(current, user.id))) throw new HttpError(401, 'Signed out after inactivity');
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(ACTIVITY_COOKIE, await makeActivityCookie(user.id), { ...base(req), maxAge: 24 * 3600 });
  return res;
});

/** Called when signing out: forget the activity clock. */
export const DELETE = handle(async (req: Request) => {
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(ACTIVITY_COOKIE, '', { ...base(req), maxAge: 0 });
  return res;
});
