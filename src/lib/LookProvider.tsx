'use client';

import { createContext, useEffect, useState } from 'react';
import { LOOK_EVENT, parseLook, type Look } from '@/lib/look';

export const LookContext = createContext<Look | null>(null);

/** Seeds the look from the server-parsed prefs so first paint is right, and keeps it live via the look event. */
export default function LookProvider({ initial, children }: { initial: Look; children: React.ReactNode }) {
  const [look, setLook] = useState<Look>(initial);
  useEffect(() => setLook(initial), [initial]);
  useEffect(() => {
    const on = (e: Event) => setLook(parseLook((e as CustomEvent).detail));
    window.addEventListener(LOOK_EVENT, on);
    return () => window.removeEventListener(LOOK_EVENT, on);
  }, []);
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>;
}
