import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationItem } from './types';

/** Conversation list with other person's name, last message and unread count. Works with the server or browser client (RLS applies). */
export async function loadConversations(supabase: SupabaseClient, me: string): Promise<ConversationItem[]> {
  const { data: convs, error } = await supabase.from('conversations').select('id,user_a,user_b');
  if (error) throw error; // a failed read must not look like "no conversations"
  if (!convs?.length) return [];
  const otherIds = convs.map((c) => (c.user_a === me ? c.user_b : c.user_a) as string);
  const { data: profs } = await supabase.from('profiles').select('id,display_name,avatar_asset_id,about').in('id', otherIds);
  const people = new Map((profs ?? []).map((p) => [p.id as string, p]));

  const items = await Promise.all(
    convs.map(async (c): Promise<ConversationItem> => {
      const otherId = (c.user_a === me ? c.user_b : c.user_a) as string;
      const [last, unread] = await Promise.all([
        supabase
          .from('messages')
          .select('body,type,created_at,sender_id,read_at')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .neq('sender_id', me)
          .is('read_at', null),
      ]);
      return {
        id: c.id as string,
        otherId,
        otherName: (people.get(otherId)?.display_name as string | undefined) ?? 'Member',
        otherAvatar: (people.get(otherId)?.avatar_asset_id as string | null | undefined) ?? null,
        otherAbout: (people.get(otherId)?.about as string | null | undefined) ?? null,
        lastBody: (last.data?.body as string | undefined) ?? null,
        lastType: (last.data?.type as string | undefined) ?? null,
        lastAt: (last.data?.created_at as string | undefined) ?? null,
        lastMine: last.data?.sender_id === me,
        lastRead: !!last.data?.read_at,
        unread: unread.count ?? 0,
      };
    }),
  );
  return items.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}
