'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, CheckCheck, Search, Smile, X } from 'lucide-react';
import '@/components/ui/ui.css';
import '../home.css';
import type { ConversationItem } from '@/lib/chat/types';
import Avatar from '@/components/ui/Avatar';
import AvatarViewer from '@/components/ui/AvatarViewer';
import Skeleton from '@/components/ui/Skeleton';
import { useMounted } from '@/components/ui/useMounted';
import { preview, useConversations } from './ConversationsContext';

export { preview };

export function when(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function Skeletons() {
  return (
    <ul aria-label="Loading conversations" className="px-1">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-3" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton round className="h-12 w-12 shrink-0" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({ c, idx, active, typing, online, mounted, onAvatar }: { c: ConversationItem; idx: number; active: boolean; typing: boolean; online: boolean; mounted: boolean; onAvatar: (c: ConversationItem) => void }) {
  return (
    <li data-id={c.id} className="hm-li" style={{ animationDelay: `${Math.min(idx, 8) * 35}ms` }}>
      <Link
        href={`/c/${c.id}`}
        aria-current={active ? 'page' : undefined}
        className="ui-row hm-row flex items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span
          className="hm-av-sm cursor-zoom-in"
          data-online={online}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAvatar(c);
          }}
        >
          <Avatar key={c.otherAvatar ?? 'none'} userId={c.otherId} name={c.otherName} assetId={c.otherAvatar} size={46} className="border-2 border-app" />
          {online && <span className="hm-dot hm-dot-sm" role="img" aria-label="Online" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium text-main">{c.otherName}</span>
            <span className={`shrink-0 text-xs ${c.unread ? 'font-semibold text-accent' : 'text-muted'}`}>{mounted ? when(c.lastAt) : ''}</span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-sm text-muted">
              {typing ? (
                <span className="hm-typing truncate text-sm">typing…</span>
              ) : (
                <>
                  {c.lastMine && c.lastType !== 'system' && c.lastAt && (
                    c.lastRead ? <CheckCheck className="h-4 w-4 shrink-0 text-tick" aria-label="Read" /> : <Check className="h-4 w-4 shrink-0 text-muted" aria-label="Sent" />
                  )}
                  {c.lastType === 'media' && <Camera className="h-4 w-4 shrink-0" aria-hidden />}
                  {c.lastType === 'sticker' && <Smile className="h-4 w-4 shrink-0" aria-hidden />}
                  <span className="truncate">{preview(c)}</span>
                </>
              )}
            </span>
            {c.unread > 0 && (
              <span className="ui-badge pop flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold" aria-label={`${c.unread} unread`}>
                {c.unread > 99 ? '99+' : c.unread}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function ConversationList({ activePath }: { activePath: string }) {
  const { items, typing, online, loaded } = useConversations();
  const mounted = useMounted();
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState<ConversationItem | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const prevTops = useRef<Map<string, number>>(new Map());

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? items.filter((c) => c.otherName.toLowerCase().includes(n)) : items;
  }, [items, q]);
  const order = shown.map((c) => c.id).join(',');

  // FLIP: when a new message moves a row to the top, slide the rows from where they were to where they are.
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    const lis = Array.from(ul.children) as HTMLElement[];
    const moves: { li: HTMLElement; dy: number }[] = [];
    for (const li of lis) {
      const id = li.dataset.id;
      if (!id) continue;
      const top = li.offsetTop;
      next.set(id, top);
      const was = prevTops.current.get(id);
      if (!reduce && was !== undefined && was !== top) moves.push({ li, dy: was - top });
    }
    prevTops.current = next;
    if (!moves.length) return;
    for (const { li, dy } of moves) {
      li.style.transition = 'none';
      li.style.transform = `translateY(${dy}px)`;
    }
    void ul.offsetHeight; // commit the starting positions
    for (const { li } of moves) {
      li.style.transition = 'transform 0.45s var(--ease)';
      li.style.transform = '';
      li.addEventListener('transitionend', () => (li.style.transition = ''), { once: true });
    }
  }, [order]);

  if (!loaded) return <Skeletons />;

  if (!items.length)
    return (
      <div className="rise flex flex-col items-center gap-2 p-8 text-center">
        <Smile className="h-8 w-8 text-accent" aria-hidden />
        <p className="text-sm text-main">No conversations yet.</p>
        <p className="ui-step">{'// ask the owner for an invite'}</p>
      </div>
    );

  return (
    <div>
      <div className="sticky top-0 z-10 bg-app/70 px-3 pb-2 pt-3 backdrop-blur-md">
        <div className="hm-search">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            aria-label="Search conversations by name"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-main outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="ui-icon-btn ui-icon-btn-sm">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted">No one called &ldquo;{q.trim()}&rdquo;.</p>
      ) : (
        <ul ref={listRef} className="relative">
          {shown.map((c, idx) => (
            <Row key={c.id} c={c} idx={idx} active={activePath === `/c/${c.id}`} typing={!!typing[c.id]} online={!!online[c.id]} mounted={mounted} onAvatar={setViewing} />
          ))}
        </ul>
      )}
      {viewing && <AvatarViewer userId={viewing.otherId} name={viewing.otherName} assetId={viewing.otherAvatar} onClose={() => setViewing(null)} />}
    </div>
  );
}
