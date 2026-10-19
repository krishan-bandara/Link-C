'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { joinConv } from './convChannels';

export type ChannelEvent = 'call-invite' | 'call-accept' | 'call-decline' | 'call-end';

/** Private realtime channel `conv:<id>` (shared with the chat list): typing, online presence and call signalling. */
export function useConvChannel(
  conversationId: string,
  me: string,
  onEvent: (event: ChannelEvent, payload: Record<string, unknown>) => void,
) {
  const sendRef = useRef<((event: string, payload?: Record<string, unknown>) => void) | null>(null);
  const handler = useRef(onEvent);
  const lastTyping = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    const conn = joinConv(supabaseBrowser(), conversationId, me, {
      typing: (p) => {
        clearTimeout(typingTimer.current);
        if (p.typing === false) return setTyping(false);
        setTyping(true);
        typingTimer.current = setTimeout(() => setTyping(false), 4000);
      },
      event: (ev, payload) => handler.current(ev as ChannelEvent, payload),
      online: setOnline,
    });
    sendRef.current = conn.send;
    return () => {
      clearTimeout(typingTimer.current);
      sendRef.current = null;
      setOnline(false);
      conn.leave();
    };
  }, [conversationId, me]);

  const send = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    sendRef.current?.(event, payload);
  }, []);

  // typing:true at most once per 2 s while the member types
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTyping.current < 2000) return;
    lastTyping.current = now;
    send('typing', { userId: me, typing: true });
  }, [send, me]);

  // typing:false when the composer is emptied or a message is sent
  const stopTyping = useCallback(() => {
    if (!lastTyping.current) return;
    lastTyping.current = 0;
    send('typing', { userId: me, typing: false });
  }, [send, me]);

  const clearTyping = useCallback(() => {
    clearTimeout(typingTimer.current);
    setTyping(false);
  }, []);

  return { send, sendTyping, stopTyping, clearTyping, online, typing };
}
