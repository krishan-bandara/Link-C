import { handle, HttpError, requireUser } from '@/lib/auth';
import { readAsset } from '@/lib/assets';
import { parseId } from '@/lib/media';
import { adminClient } from '@/lib/supabase/admin';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  const { user, supabase } = await requireUser();
  const userId = parseId((await params).userId);
  // RLS only returns the caller's own profile and chat partners; own profile is read directly as a fallback.
  const client = userId === user.id ? adminClient() : supabase;
  const { data } = await client.from('profiles').select('avatar_asset_id').eq('id', userId).maybeSingle();
  if (!data?.avatar_asset_id) throw new HttpError(404, 'Not found');
  const { buffer, mime } = await readAsset(data.avatar_asset_id, { kind: 'avatar', ownerId: userId });
  return new Response(new Uint8Array(buffer), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  });
});
