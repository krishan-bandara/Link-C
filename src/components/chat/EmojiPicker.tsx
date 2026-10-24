'use client';

import { useEffect, useRef, useState } from 'react';
import { useIsDark } from '@/lib/chat/useIsDark';

/** emoji-mart web component, lazy loaded on first use (local data only, so it works under the strict CSP). */
export default function EmojiPicker({ onSelect }: { onSelect: (native: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef(onSelect);
  const dark = useIsDark();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pick.current = onSelect;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let picker: HTMLElement | null = null;
    void (async () => {
      const [{ Picker }, data] = await Promise.all([import('emoji-mart'), import('@emoji-mart/data')]);
      if (cancelled) return;
      picker = new Picker({
        data: data.default,
        theme: dark ? 'dark' : 'light',
        set: 'native',
        previewPosition: 'none',
        skinTonePosition: 'search',
        // on phones a focused search box would pop the keyboard up over the emoji; desktop keeps the autofocus
        autoFocus: !window.matchMedia('(pointer: coarse)').matches,
        dynamicWidth: true,
        onEmojiSelect: (e: { native?: string }) => e.native && pick.current(e.native),
      }) as unknown as HTMLElement;
      picker.style.width = '100%';
      picker.style.height = '100%';
      el.appendChild(picker);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, [dark]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full [&_em-emoji-picker]:h-full [&_em-emoji-picker]:max-h-none" />
      {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading emoji...</p>}
    </div>
  );
}
