import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { deleteAsset } from '@/lib/assets';
import { parseId } from '@/lib/media';
import { adminClient } from '@/lib/supabase/admin';

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const id = parseId((await params).id);
  const db = adminClient();
  const { data: s } = await db.from('stickers').select('creator_id,pack_id,asset_id').eq('id', id).maybeSingle();
  if (!s) throw new HttpError(404, 'Not found');
  const { data: me } = await db.from('profiles').select('role').eq('id', user.id).single();
  const isOwner = me?.role === 'owner';
  // Official pack stickers are managed by the owner only.
  if (!isOwner && (s.creator_id !== user.id || s.pack_id)) throw new HttpError(404, 'Not found');
  await deleteAsset(s.asset_id as string); // cascades to the sticker and collections; messages keep a null sticker_id
  return NextResponse.json({ ok: true });
});
