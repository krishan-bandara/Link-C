import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { canViewSticker } from '@/lib/assets';
import { parseId } from '@/lib/media';
import { adminClient } from '@/lib/supabase/admin';

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const id = parseId((await params).id);
  if (!(await canViewSticker(user.id, id))) throw new HttpError(404, 'Not found');
  const { error } = await adminClient()
    .from('user_stickers')
    .upsert({ user_id: user.id, sticker_id: id }, { onConflict: 'user_id,sticker_id', ignoreDuplicates: true });
  if (error) throw new Error('could not save sticker');
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const id = parseId((await params).id);
  await adminClient().from('user_stickers').delete().eq('user_id', user.id).eq('sticker_id', id);
  return NextResponse.json({ ok: true });
});
