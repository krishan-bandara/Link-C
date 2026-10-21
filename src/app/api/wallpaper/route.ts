import { handle, HttpError, requireUser } from '@/lib/auth';
import { parseConversationParam, readAsset, requireParticipant } from '@/lib/assets';
import { adminClient } from '@/lib/supabase/admin';

/** The caller's own picture: their default one, or with ?conversation=<uuid> that chat's own picture. Never anyone else's. */
export const GET = handle(async (req: Request) => {
  const { user } = await requireUser();
  const conv = parseConversationParam(req.url);
  const db = adminClient();
  let assetId: string | null | undefined;
  let kind: 'wallpaper' | 'chat_wallpaper';
  if (conv) {
    await requireParticipant(user.id, conv);
    const { data } = await db.from('chat_wallpapers').select('asset_id').eq('user_id', user.id).eq('conversation_id', conv).maybeSingle();
    assetId = data?.asset_id as string | null | undefined;
    kind = 'chat_wallpaper';
  } else {
    const { data } = await db.from('user_prefs').select('wallpaper_asset_id').eq('user_id', user.id).maybeSingle();
    assetId = data?.wallpaper_asset_id as string | null | undefined;
    kind = 'wallpaper';
  }
  if (!assetId) throw new HttpError(404, 'Not found');
  const { buffer, mime } = await readAsset(assetId, { kind, ownerId: user.id });
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  });
});
