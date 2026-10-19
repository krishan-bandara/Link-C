'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CheckCheck, Download, EyeOff, Plus, StickerIcon, Trash2, Timer } from 'lucide-react';
import type { Media, Msg } from '@/lib/chat/types';
import { isBigEmoji, QUICK_REACTIONS } from '@/lib/chat/emoji';
import { stickerSrc } from '@/lib/chat/stickers';
import Linkify from './Linkify';
import { buzz } from '@/lib/chat/haptics';
import { BUBBLE_SHADOW, FOCUS } from './ui';

function Ticks({ m }: { m: Msg }) {
  if (m.read_at) return <CheckCheck className="h-4 w-4 text-tick" aria-label="Read" />;
  if (m.delivered_at) return <CheckCheck className="h-4 w-4 text-muted" aria-label="Delivered" />;
  return <Check className="h-4 w-4 text-muted" aria-label="Sent" />;
}

function snapState(media: Media, mine: boolean): { label: string; sub?: string; open: boolean } {
  const timer = media.timer_seconds ? `${media.timer_seconds} s` : 'no limit';
  const expired = media.deleted_at || (media.expires_at && new Date(media.expires_at).getTime() < Date.now());
  if (media.viewed_at) return { label: 'Opened', open: false };
  if (expired) return { label: 'Expired', open: false };
  if (mine) return { label: 'Sent, not opened yet', sub: media.mode === 'once' ? 'View once' : timer, open: false };
  return { label: 'Tap to open', sub: media.mode === 'once' ? 'View once' : timer, open: true };
}

function MediaBody({
  media,
  mine,
  opening,
  onOpenSnap,
  onZoom,
  onSaveMedia,
  onMediaLoad,
}: {
  media: Media | undefined;
  mine: boolean;
  opening: boolean;
  onOpenSnap: (m: Media) => void;
  onZoom: (m: Media) => void;
  onSaveMedia: (m: Media) => void;
  onMediaLoad: () => void;
}) {
  const [loaded, setLoaded] = useState(false); // the grey placeholder box is only needed until the picture is there
  if (!media) return <div className="cv-media-ph h-48 w-64 max-w-full rounded-xl" role="status" aria-label="Loading media" />;
  if (media.mode === 'normal') {
    if (media.deleted_at)
      return (
        <p className="flex items-center gap-2 px-3 py-2 text-sm italic text-muted">
          <EyeOff className="h-4 w-4" /> Media removed
        </p>
      );
    const src = `/api/media/${media.id}/stream`;
    // The box has a reserved size, so the chat does not jump while the picture loads.
    return (
      <div className="group/media relative">
        {media.kind === 'image' ? (
          <button type="button" onClick={() => onZoom(media)} className={`relative block w-64 max-w-full overflow-hidden rounded-xl ${loaded ? '' : 'cv-media-ph min-h-48'} ${FOCUS}`} aria-label="View image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" onLoad={() => { setLoaded(true); onMediaLoad(); }} onError={() => setLoaded(true)} className={`max-h-72 w-full rounded-xl object-cover ${loaded ? 'cv-img-in' : 'opacity-0'}`} />
          </button>
        ) : (
          <video
            src={src}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={onMediaLoad}
            className="min-h-48 max-h-72 w-64 max-w-full rounded-xl bg-black"
          />
        )}
        <button
          type="button"
          onClick={() => onSaveMedia(media)}
          aria-label={media.kind === 'image' ? 'Save photo' : 'Save video'}
          title="Save"
          className={`absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity focus-visible:opacity-100 group-hover/media:opacity-100 pointer-coarse:opacity-100 ${FOCUS}`}
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    );
  }
  // snaps (once / timed): there is deliberately no save option here
  const s = snapState(media, mine);
  const Icon = s.open ? Camera : media.viewed_at ? EyeOff : media.deleted_at ? EyeOff : Timer;
  return (
    <button
      type="button"
      disabled={!s.open || opening}
      onClick={() => onOpenSnap(media)}
      className={`flex w-48 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${FOCUS} ${s.open ? 'bg-accent/20 hover:bg-accent/30' : 'bg-panel-2/60 text-muted'}`}
    >
      <Icon className={`h-6 w-6 shrink-0 ${s.open ? 'text-accent' : ''}`} />
      <span>
        <span className="block text-sm font-medium">{opening ? 'Opening...' : s.label}</span>
        {s.sub && <span className="block text-xs text-muted">{s.sub}</span>}
      </span>
    </button>
  );
}

function ReactionChip({ emoji, n, own, animate, onToggle }: { emoji: string; n: number; own: boolean; animate: boolean; onToggle: () => void }) {
  const [pop] = useState(animate); // decided once at mount, so only newly added reactions bounce
  const cls = `cv-chip-react flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-sm leading-none shadow-sm ${pop ? 'pop' : ''} ${own ? 'border-accent bg-accent/15' : 'border-line'}`;
  const inner = (
    <>
      <span>{emoji}</span>
      {n > 1 && <span className="text-xs text-muted">{n}</span>}
    </>
  );
  return own ? (
    <button type="button" onClick={onToggle} aria-label={`Your reaction ${emoji}, tap to remove`} className={`${cls} ${FOCUS}`}>
      {inner}
    </button>
  ) : (
    <span className={cls} aria-label={`${n} reaction${n > 1 ? 's' : ''} ${emoji}`}>
      {inner}
    </span>
  );
}

export default function MessageBubble({
  msg,
  media,
  mine,
  me,
  firstOfRun,
  fresh = false,
  reactions,
  stickerSaved,
  opening,
  onDelete,
  onOpenSnap,
  onZoom,
  onSaveMedia,
  onReact,
  onMoreReactions,
  onStickerSave,
  onMediaLoad,
}: {
  msg: Msg;
  media: Media | undefined;
  mine: boolean;
  me: string;
  firstOfRun: boolean;
  fresh?: boolean; // arrived after the chat was opened: play the entrance animation
  reactions: Map<string, string> | undefined;
  stickerSaved: boolean;
  opening: boolean;
  onDelete: (id: string, scope: 'me' | 'all') => void;
  onOpenSnap: (m: Media) => void;
  onZoom: (m: Media) => void;
  onSaveMedia: (m: Media) => void;
  onReact: (messageId: string, emoji: string) => void;
  onMoreReactions: (messageId: string) => void;
  onStickerSave: (stickerId: string, save: boolean) => void;
  onMediaLoad: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false); // reaction chips added after mount bounce in; the ones loaded with the history do not
  const [flip, setFlip] = useState(false); // show the hover pill below the bubble when there is no room above it
  const wrapRef = useRef<HTMLDivElement>(null);
  const checkRoom = () => {
    const el = wrapRef.current;
    const list = el?.closest('[data-chat-list]');
    if (el && list) setFlip(el.getBoundingClientRect().top - list.getBoundingClientRect().top < 44);
  };
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  useEffect(() => () => clearTimeout(press.current), []);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Keyboard: opening the options menu moves focus into it; arrows move between items; Escape closes and gives focus back.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      setOpen(false);
      wrapRef.current?.querySelector<HTMLElement>('[aria-label="Message options"]')?.focus();
    }
  };
  if (msg.type === 'system') return <p className="my-1 text-center text-xs text-muted">{msg.body}</p>;

  const sticker = msg.type === 'sticker';
  const big = msg.type === 'text' && isBigEmoji(msg.body);
  const bare = sticker || big; // no bubble fill
  const snap = msg.type === 'media' && media && media.mode !== 'normal';
  const mineReaction = reactions?.get(me);
  const counts = new Map<string, number>();
  reactions?.forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1));

  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    longPressed.current = false;
    clearTimeout(press.current);
    press.current = setTimeout(() => {
      longPressed.current = true;
      buzz(10);
      setOpen(true);
    }, 400);
  };
  const cancelPress = () => clearTimeout(press.current);


  const meta = (
    <span className={`flex items-center gap-1 text-xs leading-none text-muted ${bare ? 'cv-meta-chip rounded-full px-2 py-1' : ''}`}>
      <span>{time}</span>
      {mine && <Ticks m={msg} />}
    </span>
  );

  const react = (emoji: string) => {
    setOpen(false);
    buzz(10);
    onReact(msg.id, emoji);
  };
  const menuItem = `flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-accent/10 ${FOCUS}`;
  const pill = (
    <div className="cv-pill flex items-center gap-0.5 rounded-full px-1.5 py-1" role="group" aria-label="React">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => react(e)}
          aria-label={`React ${e}`}
          aria-pressed={mineReaction === e}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xl cv-pill-btn ${mineReaction === e ? 'bg-accent/25' : ''} ${FOCUS}`}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onMoreReactions(msg.id);
        }}
        aria-label="More reactions"
        className={`cv-pill-btn flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-muted ${FOCUS}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div data-mid={msg.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'} ${firstOfRun ? 'mt-2.5' : 'mt-0.5'} ${fresh ? (mine ? 'cv-in-mine' : 'cv-in-theirs') : ''}`}>
      <div ref={wrapRef} onMouseEnter={checkRoom} className={`relative flex min-w-0 max-w-[85%] flex-col ${mine ? 'items-end' : 'items-start'} ${open ? 'z-20' : ''}`}>
        {open && <button type="button" tabIndex={-1} aria-label="Close menu" className="fixed inset-0 -z-10 cursor-default" onClick={() => setOpen(false)} />}
        {open && <div className={`absolute bottom-full z-10 mb-1 ${mine ? 'right-0' : 'left-0'}`}>{pill}</div>}
        {!open && (
          <div className={`absolute ${flip ? 'top-full mt-1' : '-top-8'} z-10 hidden pointer-fine:group-hover:block ${mine ? 'right-0' : 'left-0'} group-has-[:focus-visible]:block`}>{pill}</div>
        )}
        <div
          className={`relative select-none [-webkit-touch-callout:none] ${
            bare ? '' : `rounded-[18px] ${mine ? 'cv-out' : 'cv-in'} ${firstOfRun ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : ''}`
          } ${msg.type === 'media' && !snap ? 'p-1' : ''}`}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onPointerMove={cancelPress}
          onClickCapture={(e) => {
            if (longPressed.current) {
              longPressed.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {msg.type === 'media' ? (
            <>
              <MediaBody media={media} mine={mine} opening={opening} onOpenSnap={onOpenSnap} onZoom={onZoom} onSaveMedia={onSaveMedia} onMediaLoad={onMediaLoad} />
              <div className="flex justify-end px-2 pb-0.5 pt-1">{meta}</div>
            </>
          ) : sticker ? (
            <div className="flex flex-col items-end gap-0.5">
              {msg.sticker_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stickerSrc(msg.sticker_id)} alt="Sticker" width={160} height={160} loading="lazy" onLoad={onMediaLoad} draggable={false} className={`h-40 w-40 object-contain drop-shadow-md ${fresh ? 'cv-emoji-in' : ''}`} />
              ) : (
                <p className={`rounded-[18px] px-3 py-2 text-sm italic text-muted ${BUBBLE_SHADOW} ${mine ? 'cv-out' : 'cv-in'}`}>Sticker removed</p>
              )}
              {meta}
            </div>
          ) : big ? (
            <div className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
              <p className={`text-5xl leading-tight ${fresh ? 'cv-emoji-in' : ''}`}>{msg.body}</p>
              {meta}
            </div>
          ) : (
            <p className="flow-root select-text whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word] px-3 py-1.5 text-[15px] leading-snug">
              <Linkify text={msg.body} />
              <span className="float-right ml-3 mt-2.5">{meta}</span>
            </p>
          )}
          {(
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Message options"
              aria-expanded={open}
              className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full cv-opt-btn bg-panel/80 text-xs text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:hidden ${mine ? '-left-7' : '-right-7'} ${FOCUS}`}
            >
              <span aria-hidden>⋯</span>
            </button>
          )}
        </div>
        {open && (
          <div ref={menuRef} className={`cv-menu absolute top-full z-10 mt-1 overflow-hidden rounded-xl py-1 shadow-xl ${mine ? 'right-0' : 'left-0'}`} role="menu" onKeyDown={onMenuKey}>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              onClick={() => {
                setOpen(false);
                onMoreReactions(msg.id);
              }}
            >
              <Plus className="h-4 w-4" /> React
            </button>
            {sticker && msg.sticker_id && (
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  onStickerSave(msg.sticker_id!, !stickerSaved);
                }}
              >
                <StickerIcon className="h-4 w-4" /> {stickerSaved ? 'Remove from my stickers' : 'Add to my stickers'}
              </button>
            )}
            {media && media.mode === 'normal' && !media.deleted_at && (
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  onSaveMedia(media);
                }}
              >
                <Download className="h-4 w-4" /> Save
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              onClick={() => {
                setOpen(false);
                onDelete(msg.id, 'me');
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete for me
            </button>
            {mine && (
              <button
                type="button"
                role="menuitem"
                className={`${menuItem} text-danger`}
                onClick={() => {
                  setOpen(false);
                  onDelete(msg.id, 'all');
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete for everyone
              </button>
            )}
          </div>
        )}
        {counts.size > 0 && (
          <div className={`z-[1] -mt-2 flex flex-wrap gap-1 ${mine ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
            {[...counts].map(([emoji, n]) => (
              <ReactionChip key={emoji} emoji={emoji} n={n} own={mineReaction === emoji} animate={armed} onToggle={() => { buzz(10); onReact(msg.id, emoji); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
