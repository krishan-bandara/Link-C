import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { MAX_BYTES, MAX_OWN_STICKERS, deleteAsset, parseEmoji, readBodyCapped, storeAsset } from '@/lib/assets';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

type S = { id: string; emoji: string | null };

export const GET = handle(async () => {
  const { user } = await requireUser();
  const db = adminClient();
  const { data: saved } = await db
    .from('user_stickers')
    .select('sticker_id,added_at')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });
  const ids = (saved ?? []).map((r) => r.sticker_id as string);
  const { data: rows } = ids.length ? await db.from('stickers').select('id,emoji').in('id', ids) : { data: [] as S[] };
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r as S]));
  const mine = ids.flatMap((id) => (byId.has(id) ? [{ id, emoji: byId.get(id)!.emoji }] : []));

  const { data: packs } = await db.from('sticker_packs').select('id,name').order('created_at');
  const { data: ps } = await db.from('stickers').select('id,emoji,pack_id').not('pack_id', 'is', null).order('created_at');
  return NextResponse.json(
    {
      mine,
      packs: (packs ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        stickers: (ps ?? []).filter((s) => s.pack_id === p.id).map((s) => ({ id: s.id as string, emoji: s.emoji as string | null })),
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});

export const POST = handle(async (req: Request) => {
  const { user } = await requireUser();
  if (!rateLimit(`sticker:${user.id}`, 30, 3600_000)) throw new HttpError(429, 'Too many stickers, try again later');
  const emoji = parseEmoji(new URL(req.url).searchParams.get('emoji'));
  const db = adminClient();
  const { count } = await db
    .from('stickers')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', user.id)
    .is('pack_id', null);
  if ((count ?? 0) >= MAX_OWN_STICKERS) throw new HttpError(409, `You can create up to ${MAX_OWN_STICKERS} stickers. Delete one first.`);
  const buffer = await readBodyCapped(req, MAX_BYTES.sticker);
  const asset = await storeAsset({ ownerId: user.id, kind: 'sticker', buffer });
  const { data, error } = await db
    .from('stickers')
    .insert({ pack_id: null, creator_id: user.id, asset_id: asset.id, emoji })
    .select('id')
    .single();
  if (error || !data) {
    await deleteAsset(asset.id).catch(() => {});
    throw new Error('could not create sticker');
  }
  await db.from('user_stickers').insert({ user_id: user.id, sticker_id: data.id });
  return NextResponse.json({ id: data.id });
});
