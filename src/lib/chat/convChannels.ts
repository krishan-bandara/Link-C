'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * One private realtime channel `conv:<id>` per conversation, shared by everything on the page.
 * supabase-js returns the SAME channel object for the same name, and handlers cannot be added after it has
 * joined, so the chat list (typing) and the open chat (typing, online, calls) must not each create their own.
 */
export type ConvListener = {
  typing?: (p: { userId?: string; from?: string; typing?: boolean }) => void;
  event?: (event: string, payload: Record<string, unknown>) => void;
  online?: (online: boolean) => void;
};

const CALL_EVENTS = ['call-invite', 'call-accept', 'call-decline', 'call-end'];

type Entry = { ch: RealtimeChannel; refs: number; listeners: Set<ConvListener>; online: boolean };
const registry = new Map<string, Entry>();

export function joinConv(
  supabase: SupabaseClient,
  conversationId: string,
  me: string,
  listener: ConvListener,
): { send: (event: string, payload?: Record<string, unknown>) => void; leave: () => void } {
  let entry = registry.get(conversationId);
  if (!entry) {
    const listeners = new Set<ConvListener>();
    const ch = supabase.channel(`conv:${conversationId}`, { config: { private: true, presence: { key: me } } });
    const e: Entry = { ch, refs: 0, listeners, online: false };
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = (payload ?? {}) as { userId?: string; from?: string; typing?: boolean };
      if (p.from === me || p.userId === me) return;
      listeners.forEach((l) => l.typing?.(p));
    });
    for (const ev of CALL_EVENTS) {
      ch.on('broadcast', { event: ev }, ({ payload }) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        if (p.from === me) return;
        listeners.forEach((l) => l.event?.(ev, p));
      });
    }
    ch.on('presence', { event: 'sync' }, () => {
      e.online = Object.keys(ch.presenceState()).some((k) => k !== me);
      listeners.forEach((l) => l.online?.(e.online));
    });
    registry.set(conversationId, e);
    entry = e;
    // Realtime must know who we are before joining, otherwise row level security treats us as anonymous.
    void supabase.realtime.setAuth().then(() => {
      if (registry.get(conversationId) !== e) return; // everyone already left
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() });
      });
    });
  }
  const e = entry;
  e.refs++;
  e.listeners.add(listener);
  if (e.online) listener.online?.(true);

  return {
    send: (event, payload = {}) => {
      void e.ch.send({ type: 'broadcast', event, payload: { ...payload, from: me } });
    },
    leave: () => {
      e.listeners.delete(listener);
      e.refs--;
      // Grace period: a quick leave + re-join (list refresh) must reuse the live channel, not a half-closed one.
      if (e.refs <= 0) {
        setTimeout(() => {
          if (e.refs <= 0 && registry.get(conversationId) === e) {
            registry.delete(conversationId);
            void supabase.removeChannel(e.ch);
          }
        }, 1500);
      }
    },
  };
}
