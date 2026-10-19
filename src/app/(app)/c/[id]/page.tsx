import { notFound } from 'next/navigation';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import ChatView from '@/components/chat/ChatView';
import { MEDIA_COLS, MSG_COLS, SHARE_COLS, type LocationShare, type Media, type Msg } from '@/lib/chat/types';

export const metadata = { title: 'Chat - Link-C' };

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound(); // the (app) layout already redirects signed-out users

  const { data: conv } = await supabase.from('conversations').select('id,user_a,user_b').eq('id', id).maybeSingle();
  if (!conv) notFound();
  const otherId = (conv.user_a === user.id ? conv.user_b : conv.user_a) as string;

  const [{ data: profs }, { data: msgs }, { data: shares }, { data: prefs }] = await Promise.all([
    supabase.from('profiles').select('id,display_name,role,avatar_asset_id,about').in('id', [user.id, otherId]),
    supabase.from('messages').select(MSG_COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(50),
    supabase
      .from('location_shares')
      .select(SHARE_COLS)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('user_prefs').select('wallpaper_kind,wallpaper_preset,wallpaper_asset_id').eq('user_id', user.id).maybeSingle(),
  ]);
  const messages = ((msgs ?? []) as Msg[]).reverse();
  const ids = messages.filter((m) => m.type === 'media').map((m) => m.id);
  const { data: media } = ids.length
    ? await supabase.from('media_items').select(MEDIA_COLS).in('message_id', ids)
    : { data: [] as Media[] };

  const me = profs?.find((p) => p.id === user.id);
  const other = profs?.find((p) => p.id === otherId);

  return (
    <ChatView
      key={id}
      conversationId={id}
      me={user.id}
      isOwner={me?.role === 'owner'}
      other={{
        id: otherId,
        name: other?.display_name ?? 'Member',
        avatarAssetId: (other?.avatar_asset_id as string | null) ?? null,
        about: (other?.about as string | null) ?? null,
      }}
      wallpaper={{
        kind: (prefs?.wallpaper_kind as string | null) ?? null,
        preset: (prefs?.wallpaper_preset as string | null) ?? null,
        assetId: (prefs?.wallpaper_asset_id as string | null) ?? null,
      }}
      initialMessages={messages}
      initialMedia={(media ?? []) as Media[]}
      initialShare={((shares ?? [])[0] as LocationShare | undefined) ?? null}
    />
  );
}
