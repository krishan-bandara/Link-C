import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, handle, requireUser } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({ displayName: z.string().trim().min(1).max(40).optional() });

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  const { displayName } = Body.parse(await req.json().catch(() => ({})));
  const db = adminClient();
  const now = new Date().toISOString();

  const patch: Record<string, string> = { notice_accepted_at: now };
  if (displayName) patch.display_name = displayName;
  const { error } = await db.from('profiles').update(patch).eq('id', user.id);
  if (error) throw error;

  if (user.email) {
    await db.from('invites').update({ accepted_at: now }).ilike('email', user.email.replace(/[\\%_]/g, '\\$&')).is('accepted_at', null);
  }
  await audit(user.id, 'notice_accepted');
  return NextResponse.json({ ok: true });
});
