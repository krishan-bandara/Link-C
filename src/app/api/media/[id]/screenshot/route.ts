import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { parseId } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, supabase } = await requireUser();
  const id = parseId((await params).id);
  if (!rateLimit(`shot:${user.id}`, 10, 60_000)) throw new HttpError(429, 'Too many requests');

  const { data: item, error: itemErr } = await supabase
    .from('media_items')
    .select('id,sender_id,conversation_id,mode,viewed_at')
    .eq('id', id)
    .maybeSingle();
  if (itemErr) {
    console.error('media screenshot: item read failed', itemErr.message);
    throw new HttpError(500, 'Could not load snap');
  }
  if (!item || item.mode === 'normal') throw new HttpError(404, 'Not found');
  if (item.sender_id === user.id) throw new HttpError(403, 'Not allowed');

  const db = adminClient();
  const { data: ev, error: evErr } = await db
    .from('view_events')
    .select('id,screenshot_flag')
    .eq('media_id', id)
    .eq('viewer_id', user.id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (evErr) {
    console.error('media screenshot: event read failed', evErr.message);
    throw new HttpError(500, 'Could not load snap');
  }
  if (!ev) throw new HttpError(403, 'Not allowed');
  if (ev.screenshot_flag) return NextResponse.json({ ok: true }); // already reported: one notice per view

  // The snap view must be active: opened, and within the longest viewing window (video 10 min) plus slack.
  const openedAt = item.viewed_at ? new Date(item.viewed_at as string).getTime() : 0;
  if (!openedAt || Date.now() - openedAt > 11 * 60_000) throw new HttpError(403, 'Not allowed');

  // Atomic flag: only the request that flips false -> true posts the notice.
  const { data: flipped } = await db
    .from('view_events')
    .update({ screenshot_flag: true })
    .eq('id', ev.id)
    .eq('screenshot_flag', false)
    .select('id');
  if (!flipped?.length) return NextResponse.json({ ok: true });
  await db.from('messages').insert({
    conversation_id: item.conversation_id,
    sender_id: user.id,
    type: 'system',
    body: 'Screenshot or screen recording may have been taken',
  });
  return NextResponse.json({ ok: true });
});
