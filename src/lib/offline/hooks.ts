'use client';
import { useEffect, useState } from 'react';
import { OUTBOX_EVENT, listOutbox, type OutboxItem } from './outbox';

/** The queued messages of this person (optionally one chat), live. */
export function useOutbox(userId: string, conversationId?: string): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => void listOutbox(userId, conversationId).then((l) => live && setItems(l));
    load();
    window.addEventListener(OUTBOX_EVENT, load);
    window.addEventListener('lc-offline-cleared', load);
    return () => {
      live = false;
      window.removeEventListener(OUTBOX_EVENT, load);
      window.removeEventListener('lc-offline-cleared', load);
    };
  }, [userId, conversationId]);
  return items;
}
