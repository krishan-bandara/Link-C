import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { audit, handle, HttpError, requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { checkPassword } from '@/lib/password';
import { PASSWORD_MAX_LENGTH } from '@/lib/auth-policy';
import { getLock, registerFailure, clearFailures } from '@/lib/login-guard';
import { rateLimit } from '@/lib/rate-limit';

const Body = z.object({
  current: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  next: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** Change your own password. The current password is checked again, so a stolen open session cannot change it. */
export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  if (!user.email) throw new HttpError(400, 'Invalid request');
  if (!rateLimit(`chpw:${user.id}`, 5, 10 * 60_000)) throw new HttpError(429, 'Too many attempts. Try again later.');
  const { current, next } = Body.parse(await req.json());

  const lock = await getLock(user.email);
  if (lock.locked) throw new HttpError(429, 'Too many wrong passwords. Try again later.');

  // Verify with a throwaway client so the person's own session is not touched.
  const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email: user.email, password: current });
  if (error) {
    await registerFailure(user.email);
    throw new HttpError(400, 'Your current password is not correct.');
  }
  await probe.auth.signOut({ scope: 'local' }).catch(() => {});
  await clearFailures(user.email);

  if (next === current) throw new HttpError(400, 'Choose a password you have not used before.');
  const { data: profile } = await adminClient().from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const check = checkPassword(next, { email: user.email, name: profile?.display_name });
  if (!check.ok) {
    return NextResponse.json({ error: 'Choose a stronger password.', problems: check.problems }, { status: 400 });
  }

  const { error: upd } = await adminClient().auth.admin.updateUserById(user.id, { password: next });
  if (upd) throw new Error('password update failed');
  // Changing the password ends every session. Sign this browser straight back in, then end all the others.
  const supabase = await supabaseServer();
  const { data: again } = await supabase.auth.signInWithPassword({ email: user.email, password: next });
  const token = again?.session?.access_token;
  if (token) {
    const sid = (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { session_id?: string }).session_id;
    if (sid) await adminClient().rpc('revoke_other_sessions', { p_user: user.id, p_keep: sid });
  }
  await audit(user.id, 'password_changed', user.id);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});
