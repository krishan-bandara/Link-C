import { NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { ACTIVITY_COOKIE } from '@/lib/idle';

// Ends this browser's session (used when the person confirms a page refresh or close).
export const POST = handle(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== (process.env.APP_URL ?? '')) {
    throw new HttpError(403, 'Not allowed');
  }
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(ACTIVITY_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
});
