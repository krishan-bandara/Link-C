import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { audit, handle, HttpError } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { checkPassword } from '@/lib/password';
import { claimInviteToken, findInvite, releaseInviteToken } from '@/lib/invites';
import { clearFailures } from '@/lib/login-guard';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';
import { PASSWORD_MAX_LENGTH } from '@/lib/auth-policy';

const Body = z.object({
  token: z.string().max(5000), // any bad token (empty, too long, wrong) gets the same answer below
  // required for a new account (checked below), not sent for a password reset
  name: z.string().trim().max(40).optional(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

const EXPIRED = 'This link has expired or was already used.';

async function findAuthUserId(email: string): Promise<string | null> {
  const admin = adminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('lookup failed');
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

export const POST = handle(async (req: Request) => {
  const ip = clientIp(req);
  if (!rateLimit(`invite-accept:${ip}`, 10, 10 * 60_000)) throw new HttpError(429, 'Too many attempts. Try again later.');
  const { token, name: rawName, password } = Body.parse(await req.json());
  const name = rawName || undefined;

  const claimed = await claimInviteToken(token);
  if (!claimed) throw new HttpError(400, EXPIRED);
  const email = claimed.email.trim().toLowerCase();

  const fail = async (status: number, message: string, extra: Record<string, unknown> = {}) => {
    await releaseInviteToken(claimed.id).catch(() => {});
    return NextResponse.json({ error: message, ...extra }, { status });
  };

  try {
    if (claimed.purpose === 'invite' && !name) return await fail(400, 'Please enter your name.');
    const check = checkPassword(password, { email, name });
    if (!check.ok) return await fail(400, 'Choose a stronger password.', { problems: check.problems });

    const admin = adminClient();
    if (claimed.purpose === 'invite') {
      const inv = await findInvite(email);
      if (!inv) return await fail(400, EXPIRED);
      // The database only lets an account be created while the invite holds this one-time secret, so the public
      // sign-up endpoint cannot be used to take an invited email address (the trigger wipes it after use).
      const claim = randomBytes(32).toString('hex');
      const armed = await admin
        .from('invites')
        .update({ claim_secret: claim, claim_expires: new Date(Date.now() + 2 * 60_000).toISOString() })
        .eq('id', inv.id);
      if (armed.error) return await fail(500, 'Something went wrong');
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { claim } });
      if (error || !data.user) {
        await admin.from('invites').update({ claim_secret: null, claim_expires: null }).eq('id', inv.id);
        // an account for this email already exists: same answer as a used link
        if (error && /already|registered|exists/i.test(error.message)) return await fail(400, EXPIRED);
        return await fail(500, 'Something went wrong');
      }
      const uid = data.user.id;
      const p = await admin.from('profiles').update({ display_name: name as string }).eq('id', uid);
      if (p.error) {
        await admin.auth.admin.deleteUser(uid).catch(() => {}); // roll back so the link can be retried
        return await fail(500, 'Something went wrong');
      }
      await admin.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
      await audit(uid, 'invite_accepted', uid);
    } else {
      const uid = await findAuthUserId(email);
      if (!uid) return await fail(400, EXPIRED);
      const { error } = await admin.auth.admin.updateUserById(uid, { password });
      if (error) return await fail(500, 'Something went wrong');
      await admin.rpc('revoke_user_sessions', { p_user: uid });
      await clearFailures(email);
      await audit(uid, 'password_reset_done', uid);
    }
  } catch {
    return await fail(500, 'Something went wrong');
  }
  return NextResponse.json({ ok: true, email }, { headers: { 'Cache-Control': 'no-store' } });
});
