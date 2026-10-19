import { handle, HttpError, requireUser } from '@/lib/auth';
import { readAsset } from '@/lib/assets';
import { adminClient } from '@/lib/supabase/admin';

export const GET = handle(async () => {
  const { user } = await requireUser();
  const { data } = await adminClient().from('user_prefs').select('wallpaper_asset_id').eq('user_id', user.id).maybeSingle();
  if (!data?.wallpaper_asset_id) throw new HttpError(404, 'Not found');
  const { buffer, mime } = await readAsset(data.wallpaper_asset_id, { kind: 'wallpaper', ownerId: user.id });
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  });
});
