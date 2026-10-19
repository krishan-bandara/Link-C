import { handle, HttpError, requireUser } from '@/lib/auth';
import { canViewSticker, readAsset } from '@/lib/assets';
import { parseId } from '@/lib/media';
import { adminClient } from '@/lib/supabase/admin';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser();
  const id = parseId((await params).id);
  if (!(await canViewSticker(user.id, id))) throw new HttpError(404, 'Not found');
  const { data } = await adminClient().from('stickers').select('asset_id').eq('id', id).maybeSingle();
  if (!data) throw new HttpError(404, 'Not found');
  const { buffer, mime } = await readAsset(data.asset_id, { kind: 'sticker' });
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
});
