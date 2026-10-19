import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { signToken } from '@/lib/crypto';
import { parseId } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

const GONE = 'This snap is no longer available';

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, supabase } = await requireUser();
  const id = parseId((await params).id);
  if (!rateLimit(`open:${user.id}`, 60, 60_000)) throw new HttpError(429, 'Too many requests');

  // RLS: only conversation participants can see the row
  const { data: item } = await supabase
    .from('media_items')
    .select('id,sender_id,mode')
    .eq('id', id)
    .maybeSingle();
  if (!item) throw new HttpError(404, 'Not found');
  if (item.mode === 'normal') throw new HttpError(400, 'Not a snap');
  if (item.sender_id === user.id) throw new HttpError(403, 'You cannot open your own snap');

  // Atomic claim: only one caller can flip viewed_at from null.
  const db = adminClient();
  const { data: won } = await db
    .from('media_items')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', id)
    .is('viewed_at', null)
    .is('deleted_at', null)
    .in('mode', ['once', 'timed'])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .select('kind,mime,timer_seconds');
  if (!won?.length) throw new HttpError(409, GONE);

  await db.from('view_events').insert({ media_id: id, viewer_id: user.id });
  const m = won[0];
  return NextResponse.json({
    // Images load once, so 30 s is plenty; videos need a longer window for Range requests while playing.
    token: signToken(`${id}:${user.id}`, m.kind === 'video' ? 600 : 30),
    kind: m.kind,
    mime: m.mime,
    timerSeconds: m.timer_seconds ?? null,
  });
});
