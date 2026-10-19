import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, handle, HttpError, requireUser } from '@/lib/auth';
import { deleteAsset, MAX_BYTES, readBodyCapped, storeAsset } from '@/lib/assets';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

const kindSchema = z.enum(['avatar', 'wallpaper']);
const kindOf = (req: Request) => kindSchema.parse(new URL(req.url).searchParams.get('kind'));

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  const kind = kindOf(req);
  if (!rateLimit(`assets:${user.id}`, 20, 3600_000)) throw new HttpError(429, 'Too many changes, try again later');
  const buffer = await readBodyCapped(req, MAX_BYTES[kind]);
  const { id } = await storeAsset({ ownerId: user.id, kind, buffer });
  const db = adminClient();
  let previous: string | null = null;
  if (kind === 'avatar') {
    const { data } = await db.from('profiles').select('avatar_asset_id').eq('id', user.id).single();
    previous = data?.avatar_asset_id ?? null;
    const { error } = await db.from('profiles').update({ avatar_asset_id: id }).eq('id', user.id);
    if (error) {
      await deleteAsset(id).catch(() => {});
      throw new Error('could not save avatar');
    }
  } else {
    const { data } = await db.from('user_prefs').select('wallpaper_asset_id').eq('user_id', user.id).maybeSingle();
    previous = data?.wallpaper_asset_id ?? null;
    const { error } = await db
      .from('user_prefs')
      .upsert({ user_id: user.id, wallpaper_asset_id: id, wallpaper_kind: 'custom', updated_at: new Date().toISOString() });
    if (error) {
      await deleteAsset(id).catch(() => {});
      throw new Error('could not save wallpaper');
    }
  }
  if (previous && previous !== id) await deleteAsset(previous).catch((e) => console.error('asset cleanup failed', e instanceof Error ? e.message : e));
  await audit(user.id, kind === 'avatar' ? 'avatar_changed' : 'wallpaper_changed');
  return NextResponse.json({ assetId: id });
});

export const DELETE = handle(async (req: Request) => {
  const { user } = await requireUser();
  const kind = kindOf(req);
  const db = adminClient();
  let previous: string | null = null;
  if (kind === 'avatar') {
    const { data } = await db.from('profiles').select('avatar_asset_id').eq('id', user.id).single();
    previous = data?.avatar_asset_id ?? null;
    await db.from('profiles').update({ avatar_asset_id: null }).eq('id', user.id);
  } else {
    const { data } = await db.from('user_prefs').select('wallpaper_asset_id').eq('user_id', user.id).maybeSingle();
    previous = data?.wallpaper_asset_id ?? null;
    await db
      .from('user_prefs')
      .upsert({ user_id: user.id, wallpaper_asset_id: null, wallpaper_kind: 'preset', updated_at: new Date().toISOString() });
  }
  if (previous) await deleteAsset(previous);
  await audit(user.id, kind === 'avatar' ? 'avatar_changed' : 'wallpaper_changed');
  return NextResponse.json({ ok: true });
});
