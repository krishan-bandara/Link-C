import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { PageHeader } from '../kit';
import { PacksBrowser } from './StickerForms';

export const metadata = { title: 'Stickers - Admin - Link-C' };

export default async function StickersPage() {
  await ownerOrRedirect();
  const db = adminClient();
  const [{ data: packs }, { data: stickers }] = await Promise.all([
    db.from('sticker_packs').select('id,name,created_at').order('created_at'),
    db.from('stickers').select('id,pack_id,emoji,created_at').not('pack_id', 'is', null).order('created_at'),
  ]);
  const byPack = new Map<string, { id: string; emoji: string | null }[]>();
  for (const s of stickers ?? []) {
    const list = byPack.get(s.pack_id as string) ?? [];
    list.push({ id: s.id as string, emoji: (s.emoji as string | null) ?? null });
    byPack.set(s.pack_id as string, list);
  }

  return (
    <>
      <PageHeader title="Sticker packs" subtitle="Official packs are visible to every member. Images: jpeg, png, webp or gif, up to 4 MB each." />
      <PacksBrowser packs={(packs ?? []).map((p) => ({ id: p.id as string, name: p.name as string, stickers: byPack.get(p.id as string) ?? [] }))} />
    </>
  );
}
