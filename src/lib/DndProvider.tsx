'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Dnd } from '@/lib/chatprefs';

export const DND_EVENT = 'linkc:dnd';
const OFF: Dnd = { on: false, from: '22:00', to: '07:00' };
const DndContext = createContext<Dnd>(OFF);

/** Call after the member changes quiet hours so every listener (sounds) updates at once. */
export function announceDnd(d: Dnd) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DND_EVENT, { detail: d }));
}

/** Seeds quiet hours from the server prefs and keeps them live via DND_EVENT. */
export default function DndProvider({ initial, children }: { initial: Dnd; children: React.ReactNode }) {
  const [dnd, setDnd] = useState<Dnd>(initial);
  const { on, from, to } = initial;
  useEffect(() => setDnd({ on, from, to }), [on, from, to]);
  useEffect(() => {
    const h = (e: Event) => setDnd((e as CustomEvent<Dnd>).detail);
    window.addEventListener(DND_EVENT, h);
    return () => window.removeEventListener(DND_EVENT, h);
  }, []);
  return <DndContext.Provider value={dnd}>{children}</DndContext.Provider>;
}

/** The member's quiet-hours setting (use with inQuietHours from chatprefs). */
export function useDnd(): Dnd {
  return useContext(DndContext);
}
