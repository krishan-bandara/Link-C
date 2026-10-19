'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Camera, Check, CheckCheck, Smile } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { ConversationItem } from '@/lib/chat/types';
import { preview } from '../ConversationsContext';
import { when } from '../ConversationList';
import '../../home.css';

const TILT = 6; // degrees

/** One person on the home grid. The tilt and shine follow the mouse through CSS variables (no React state, no re-render). */
export default function PersonCard({
  c,
  idx,
  online,
  typing,
  mounted,
}: {
  c: ConversationItem;
  idx: number;
  online: boolean;
  typing: boolean;
  mounted: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const rect = useRef<DOMRect | null>(null);
  const raf = useRef(0);

  function enter(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    rect.current = ref.current?.getBoundingClientRect() ?? null;
  }
  function move(e: React.PointerEvent) {
    const el = ref.current;
    const r = rect.current;
    if (e.pointerType !== 'mouse' || !el || !r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      el.style.setProperty('--ry', `${((x / r.width - 0.5) * 2 * TILT).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - y / r.height) * 2 * TILT).toFixed(2)}deg`);
    });
  }
  function leave() {
    cancelAnimationFrame(raf.current);
    rect.current = null;
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }

  return (
    <li className="min-w-0">
      <Link
        ref={ref}
        href={`/c/${c.id}`}
        onPointerEnter={enter}
        onPointerMove={move}
        onPointerLeave={leave}
        className="hm-card glass"
        style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}
        aria-label={`${c.otherName}${online ? ', online' : ''}${c.unread ? `, ${c.unread} unread` : ''}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="hm-av" data-online={online}>
            <Avatar key={c.otherAvatar ?? 'none'} userId={c.otherId} name={c.otherName} assetId={c.otherAvatar} size={76} className="border-[3px] border-app" />
            {online && <span className="hm-dot" aria-hidden />}
          </span>
          {c.unread > 0 && (
            <span className="ui-badge pop flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold">{c.unread > 99 ? '99+' : c.unread}</span>
          )}
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-lg font-semibold leading-tight text-main">{c.otherName}</span>
          <span className="mt-0.5 block truncate text-sm text-muted">{c.otherAbout || ' '}</span>
        </span>
        <span className="hm-card-foot">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            {typing ? (
              <span className="hm-typing truncate">typing…</span>
            ) : (
              <>
                {c.lastMine && c.lastType !== 'system' && c.lastAt && (c.lastRead ? <CheckCheck className="h-4 w-4 shrink-0 text-tick" aria-label="Read" /> : <Check className="h-4 w-4 shrink-0 text-muted" aria-label="Sent" />)}
                {c.lastType === 'media' && <Camera className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                {c.lastType === 'sticker' && <Smile className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                <span className={`truncate ${c.unread ? 'font-medium text-main' : 'text-muted'}`}>{preview(c)}</span>
              </>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted">{mounted ? when(c.lastAt) : ''}</span>
        </span>
      </Link>
    </li>
  );
}
