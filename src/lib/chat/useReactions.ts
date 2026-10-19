'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reaction } from './types';

/** message id -> (user id -> emoji). One reaction per person per message. */
export type ReactionMap = Map<string, Map<string, string>>;

function put(map: ReactionMap, r: Reaction | null, remove?: Reaction) {
  const next = new Map(map);
  const del = remove ?? null;
  if (del) {
    const cur = next.get(del.message_id);
    if (cur) {
      const c = new Map(cur);
      c.delete(del.user_id);
      next.set(del.message_id, c);
    }
  }
  if (r) {
    const c = new Map(next.get(r.message_id) ?? []);
    c.set(r.user_id, r.emoji);
    next.set(r.message_id, c);
  }
  return next;
}

export function useReactions(supabase: SupabaseClient, me: string, messageIds: string[]) {
  const [map, setMap] = useState<ReactionMap>(() => new Map());
  const loaded = useRef(new Set<string>());
  const key = messageIds.join(',');

  const load = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const { data } = await supabase.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids);
      if (!data) return;
      for (const id of ids) loaded.current.add(id);
      setMap((cur) => {
        let next = new Map(cur);
        for (const id of ids) next.set(id, new Map());
        for (const r of data as Reaction[]) next = put(next, r);
        return next;
      });
    },
    [supabase],
  );

  // load reactions for messages we have not asked about yet
  useEffect(() => {
    const ids = key ? key.split(',').filter((id) => !loaded.current.has(id)) : [];
    for (let i = 0; i < ids.length; i += 100) void load(ids.slice(i, i + 100));
  }, [key, load]);

  // realtime (RLS limits what arrives to our own conversations)
  useEffect(() => {
    let cancelled = false;
    let first = true;
    let ch: ReturnType<typeof supabase.channel> | undefined;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase
        .channel(`reactions:${me}:${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => {
          if (p.eventType === 'DELETE') {
            const old = p.old as Partial<Reaction>;
            if (old.message_id && old.user_id) setMap((cur) => put(cur, null, old as Reaction));
          } else {
            const row = p.new as Partial<Reaction>;
            if (row.message_id && row.user_id && row.emoji) setMap((cur) => put(cur, row as Reaction));
          }
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          if (!first) void load([...loaded.current].slice(-100)); // catch up after a reconnect
          first = false;
        });
    })();
    return () => {
      cancelled = true;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [supabase, me, load]);

  /** Sets my reaction; choosing the same emoji again removes it. Returns an error message or null. */
  const react = useCallback(
    async (messageId: string, emoji: string): Promise<string | null> => {
      const mine = map.get(messageId)?.get(me);
      if (mine === emoji) {
        setMap((cur) => put(cur, null, { message_id: messageId, user_id: me, emoji }));
        const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me);
        if (error) {
          setMap((cur) => put(cur, { message_id: messageId, user_id: me, emoji }));
          return 'Could not remove the reaction.';
        }
        return null;
      }
      setMap((cur) => put(cur, { message_id: messageId, user_id: me, emoji }));
      // Insert first; if this person already reacted to the message, change the emoji instead.
      // (A single upsert would also try to rewrite message_id/user_id, which the database rightly forbids.)
      // Already reacted: change the emoji directly (no failing insert, no 409 in the console).
      let { error } = mine
        ? await supabase.from('message_reactions').update({ emoji }).eq('message_id', messageId).eq('user_id', me)
        : await supabase.from('message_reactions').insert({ message_id: messageId, user_id: me, emoji });
      if (!mine && error && (error.code === '23505' || /duplicate/i.test(error.message))) {
        ({ error } = await supabase.from('message_reactions').update({ emoji }).eq('message_id', messageId).eq('user_id', me));
      }
      if (error) {
        setMap((cur) => (mine ? put(cur, { message_id: messageId, user_id: me, emoji: mine }) : put(cur, null, { message_id: messageId, user_id: me, emoji })));
        return 'Could not add the reaction.';
      }
      return null;
    },
    [supabase, me, map],
  );

  return { reactions: map, react };
}
