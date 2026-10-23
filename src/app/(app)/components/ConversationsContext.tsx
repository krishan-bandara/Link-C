'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { loadConversations } from '@/lib/chat/conversations';
import { joinConv } from '@/lib/chat/convChannels';
import type { ConversationItem } from '@/lib/chat/types';
import { playInChat, playReceive, unlockAudioOnFirstTouch } from '@/lib/sound';

export type Me = { id: string; name: string; isOwner: boolean; avatar: string | null };

type Flags = Record<string, true>;
type Ctx = {
  me: Me;
  items: ConversationItem[];
  /** conversation ids where the other person is typing right now */
  typing: Flags;
  /** conversation ids where the other person is in the app right now */
  online: Flags;
  /** false until the first client side check of an empty list has finished (drives skeletons) */
  loaded: boolean;
};

const ConversationsCtx = createContext<Ctx | null>(null);

export function useConversations(): Ctx {
  const c = useContext(ConversationsCtx);
  if (!c) throw new Error('useConversations must be used inside ConversationsProvider');
  return c;
}

export const MEDIA_LABELS = ['Photo', 'Video', 'Voice message', 'Snap'];

export function preview(c: ConversationItem) {
  if (c.lastType === 'media') return c.lastBody && MEDIA_LABELS.includes(c.lastBody) ? c.lastBody : 'Photo or video';
  if (c.lastType === 'sticker') return 'Sticker';
  return c.lastBody ?? 'No messages yet';
}

const TYPING_MS = 4000;

/**
 * Owns the conversation list for the whole signed-in shell: realtime message updates (list + counts),
 * typing and online presence (shared channels, see convChannels.ts). The left list and the home grid both read it.
 */
export function ConversationsProvider({ me, initial, children }: { me: Me; initial: ConversationItem[]; children: React.ReactNode }) {
  const [items, setItems] = useState(initial);
  const [typing, setTyping] = useState<Flags>({});
  const [online, setOnline] = useState<Flags>({});
  const [loaded, setLoaded] = useState(initial.length > 0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const meId = me.id;

  const refresh = useCallback(async () => {
    const next = await loadConversations(supabaseBrowser(), meId).catch(() => null);
    if (next) setItems(next);
    setLoaded(true);
  }, [meId]);

  useEffect(() => unlockAudioOnFirstTouch(), []);

  // The server render already gave us the list; for an empty one double check once on the client.
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 600);
    };
    let ch: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    void (async () => {
      // Realtime must know who we are before subscribing, otherwise row level security treats us as anonymous.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase
        .channel(`list:${meId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
          const m = p.new as { conversation_id?: string; body?: string; type?: string; sender_id?: string; created_at?: string } | undefined;
          if (p.eventType === 'INSERT' && m?.conversation_id) {
            if (m.sender_id !== meId && m.type !== 'system') {
              const looking = document.visibilityState === 'visible' && window.location.pathname === `/c/${m.conversation_id}`;
              if (looking) playInChat();
              else playReceive();
            }
            // show the new message in the list at once; the full reload below only corrects counts
            setItems((cur) =>
              cur
                .map((c) =>
                  c.id === m.conversation_id
                    ? { ...c, lastBody: m.body ?? null, lastType: m.type ?? null, lastAt: m.created_at ?? c.lastAt, lastMine: m.sender_id === meId, lastRead: false, unread: m.sender_id === meId ? c.unread : c.unread + 1 }
                    : c,
                )
                .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '')),
            );
          }
          schedule();
        })
        .subscribe();
    })();
    const vis = () => document.visibilityState === 'visible' && schedule();
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', vis);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [meId, refresh]);

  // Typing + presence: one private broadcast channel per conversation, shared with the open chat.
  // The key is sorted so that a reorder (new message moves a row up) does not tear the channels down.
  const convKey = useMemo(
    () =>
      items
        .map((c) => c.id)
        .sort()
        .join(','),
    [items],
  );
  useEffect(() => {
    if (!convKey) return;
    const supabase = supabaseBrowser();
    const leaves: (() => void)[] = [];
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const flag = (setter: React.Dispatch<React.SetStateAction<Flags>>, id: string, on: boolean) =>
      setter((t) => {
        if (on === !!t[id]) return t;
        const n = { ...t };
        if (on) n[id] = true;
        else delete n[id];
        return n;
      });
    for (const id of convKey.split(',')) {
      const conn = joinConv(supabase, id, meId, {
        typing: (p) => {
          clearTimeout(timers.get(id));
          flag(setTyping, id, p.typing !== false);
          if (p.typing !== false) timers.set(id, setTimeout(() => flag(setTyping, id, false), TYPING_MS));
        },
        online: (o) => flag(setOnline, id, o),
      });
      leaves.push(conn.leave);
    }
    return () => {
      timers.forEach(clearTimeout);
      leaves.forEach((leave) => leave());
    };
  }, [convKey, meId]);

  const value = useMemo(() => ({ me, items, typing, online, loaded }), [me, items, typing, online, loaded]);
  return <ConversationsCtx.Provider value={value}>{children}</ConversationsCtx.Provider>;
}
