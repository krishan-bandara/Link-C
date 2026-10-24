'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, BellOff, Eraser, ImageIcon, MapPin, MoreVertical, Phone, Star, Video } from 'lucide-react';
import { useConversations } from '@/app/(app)/components/ConversationsContext';
import MuteSheet from './MuteSheet';
import { isMuted, muteLabel } from '@/lib/chatprefs';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { effectiveWallpaper, wallpaperStyle } from '@/lib/wallpapers';
import ChatWallpaperSheet, { type ChatWallpaper } from './ChatWallpaperSheet';
import Avatar from '@/components/ui/Avatar';
import AvatarViewer from '@/components/ui/AvatarViewer';
import { MEDIA_COLS, MSG_COLS, SHARE_COLS, type LocationShare, type Media, type Msg } from '@/lib/chat/types';
import { cancelUploadOnServer, uploadFile, UploadError, type UploadOpts } from '@/lib/chat/uploader';
import { listPending } from '@/lib/chat/pending-uploads';
import { useConvChannel, type ChannelEvent } from '@/lib/chat/useConvChannel';
import { useCall } from '@/lib/chat/useCall';
import { useIsDark } from '@/lib/chat/useIsDark';
import { useReactions } from '@/lib/chat/useReactions';
import { saveMedia } from '@/lib/chat/save';
import { loadStickers, saveSticker, sendSticker } from '@/lib/chat/stickers';
import MessageBubble from './MessageBubble';
import { FOCUS } from './ui';
import Composer from './Composer';
import { quoteKind, quoteLabel } from '@/lib/chat/reply';
import { canEdit, editErrorText, validEditText } from '@/lib/chat/edit';
import type { Quote } from './ReplyQuote';
import AttachSheet, { type AttachChoice } from './AttachSheet';
import UploadBubble, { type UploadItem } from './UploadBubble';
import SnapViewer, { type OpenedSnap } from './SnapViewer';
import Lightbox from './Lightbox';
import ConfirmDialog from './ConfirmDialog';
import DeleteDialog from './DeleteDialog';
import { playSent } from '@/lib/sound';
import CallOverlay from './CallOverlay';
import LocationPanel from './LocationPanel';
import EmojiSheet from './EmojiSheet';
import { holdAlive } from '@/lib/idle-client';
import { buzz, prefersReducedMotion } from '@/lib/chat/haptics';
import EmptyChat from './EmptyChat';
import PendingBubble from './PendingBubble';
import { saveMessages } from '@/lib/offline/cache';
import { OUTBOX_SENT_EVENT, deleteItem, enqueue, flushOutbox, retryItem } from '@/lib/offline/outbox';
import { useOutbox } from '@/lib/offline/hooks';
import { classifyError } from '@/lib/offline/logic';
import { reportNetworkFailure } from '@/lib/offline/status';
import type { ComposerHandle } from './Composer';
import './chat.css';

const PAGE = 50;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const byTime = (a: Msg, b: Msg) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

export default function ChatView({
  conversationId,
  me,
  isOwner,
  other,
  wallpaper,
  chatWallpaper,
  initialMessages,
  initialMedia,
  initialShare,
}: {
  conversationId: string;
  me: string;
  isOwner: boolean;
  other: { id: string; name: string; avatarAssetId: string | null; about: string | null };
  wallpaper: { kind: string | null; preset: string | null; assetId: string | null };
  chatWallpaper: ChatWallpaper;
  initialMessages: Msg[];
  initialMedia: Media[];
  initialShare: LocationShare | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [media, setMedia] = useState<Record<string, Media>>(() => Object.fromEntries(initialMedia.map((m) => [m.message_id, m])));
  const [hasMore, setHasMore] = useState(initialMessages.length >= PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewAvatar, setViewAvatar] = useState(false);
  const [confirmId, setConfirmId] = useState<{ id: string; scope: 'me' | 'all'; mine: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);
  const [wpOpen, setWpOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const { prefs, setMute, toggleStar } = useConversations();
  const chatPref = prefs[conversationId];
  const muted = isMuted(chatPref?.mutedUntil);
  const starred = !!chatPref?.starred;
  const [chatWp, setChatWp] = useState<ChatWallpaper>(chatWallpaper);
  const [clearing, setClearing] = useState(false);
  const [zoom, setZoom] = useState<Media | null>(null);
  const [reactTarget, setReactTarget] = useState<string | null>(null);
  const [mySet, setMySet] = useState<Set<string>>(new Set());
  const [snap, setSnap] = useState<OpenedSnap | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [share, setShare] = useState<LocationShare | null>(initialShare);
  const [locBusy, setLocBusy] = useState(false);
  const [away, setAway] = useState(false); // scrolled up, away from the newest message
  const [unread, setUnread] = useState(0); // messages from the other person that arrived while scrolled up
  // Entrance animation is only for messages that arrive after the chat was opened, never for the loaded history.
  const [initialIds] = useState(() => new Set(initialMessages.map((m) => m.id)));
  const [historyStart] = useState(() => initialMessages[0]?.created_at ?? '');
  const composerRef = useRef<ComposerHandle>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const lastId = useRef<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const seenTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback((m: string) => {
    setToast(m);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- channel (typing, presence, call signalling) and calls
  const callEvent = useRef<(ev: ChannelEvent, p: Record<string, unknown>) => void>(() => {});
  const { send, sendTyping, stopTyping, clearTyping, online, typing } = useConvChannel(conversationId, me, (ev, p) => callEvent.current(ev, p));
  const call = useCall(conversationId, send);
  useEffect(() => {
    callEvent.current = call.onEvent;
  });
  useEffect(() => {
    if (call.notice) {
      flash(call.notice);
      call.clearNotice();
    }
  }, [call, flash]);

  // ---- offline: queued text messages of this chat, and the read cache for the offline viewer
  const pending = useOutbox(me, conversationId);
  useEffect(() => {
    const t = setTimeout(() => void saveMessages(conversationId, messages), 1500);
    return () => clearTimeout(t);
  }, [conversationId, messages]);

  const dark = useIsDark();
  const wp = effectiveWallpaper(chatWp, wallpaper);
  const { reactions, react } = useReactions(supabase, me, messages.map((m) => m.id));

  // which stickers are in my collection (decides between 'Add' and 'Remove')
  const hasStickers = messages.some((m) => m.type === 'sticker');
  const refreshSet = useCallback(
    (force = false) => {
      loadStickers(force)
        .then((l) => setMySet(new Set(l.mine.map((s) => s.id))))
        .catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (hasStickers) refreshSet();
  }, [hasStickers, refreshSet]);

  async function toggleSticker(id: string, save: boolean) {
    const err = await saveSticker(id, save);
    if (err) return flash(err);
    flash(save ? 'Added to your stickers.' : 'Removed from your stickers.');
    refreshSet(true);
  }

  async function sendStickerMsg(id: string) {
    const err = await sendSticker(conversationId, id, replyTo?.id ?? null);
    if (!err) setReplyTo(null);
    stopTyping();
    return err;
  }

  async function doReact(messageId: string, emoji: string) {
    const err = await react(messageId, emoji);
    if (err) flash(err);
  }

  // ---- delivery / read receipts
  const markSeen = useCallback(() => {
    clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(async () => {
      if (document.visibilityState !== 'visible') return;
      await supabase.rpc('mark_delivered', { conv: conversationId });
      await supabase.rpc('mark_read', { conv: conversationId });
    }, 150);
  }, [supabase, conversationId]);

  // ---- state merging helpers
  const upsertMsg = useCallback((m: Msg) => {
    setMessages((cur) => {
      const i = cur.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const next = cur.slice();
        next[i] = { ...cur[i], ...m };
        return next;
      }
      return [...cur, m].sort(byTime);
    });
  }, []);

  // a queued message was delivered (or found already delivered): show the real one in place of the pending bubble
  useEffect(() => {
    const onSent = (e: Event) => {
      const d = (e as CustomEvent<{ item: { conversationId: string }; msg: Msg }>).detail;
      if (d.item.conversationId === conversationId) upsertMsg(d.msg);
    };
    window.addEventListener(OUTBOX_SENT_EVENT, onSent);
    return () => window.removeEventListener(OUTBOX_SENT_EVENT, onSent);
  }, [conversationId, upsertMsg]);

  // removes a message and its media entry from the open chat
  const dropMessage = useCallback((id: string) => {
    setMessages((cur) => cur.filter((m) => m.id !== id));
    setMedia((cur) => {
      if (!cur[id]) return cur;
      const next = { ...cur };
      delete next[id];
      return next;
    });
  }, []);

  const fetchMedia = useCallback(
    async (messageIds: string[]) => {
      if (!messageIds.length) return;
      const { data } = await supabase.from('media_items').select(MEDIA_COLS).in('message_id', messageIds);
      if (data?.length) setMedia((cur) => ({ ...cur, ...Object.fromEntries((data as Media[]).map((m) => [m.message_id, m])) }));
    },
    [supabase],
  );

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select(MSG_COLS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (!data) return;
    const rows = data as Msg[];
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      for (const r of rows) map.set(r.id, r);
      return [...map.values()].sort(byTime);
    });
    await fetchMedia(rows.filter((r) => r.type === 'media').map((r) => r.id));
  }, [supabase, conversationId, fetchMedia]);

  // ---- realtime: messages, media, location
  useEffect(() => {
    const filter = `conversation_id=eq.${conversationId}`;
    let first = true;
    let cancelled = false;
    let ch: ReturnType<typeof supabase.channel> | undefined;
    void (async () => {
      // Realtime must know who we are before subscribing, otherwise row level security treats us as anonymous.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      ch = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) => {
        const m = p.new as Msg;
        upsertMsg(m);
        if (m.sender_id !== me) clearTyping();
        if (m.type === 'media') setTimeout(() => void fetchMedia([m.id]), 800);
        if (m.sender_id !== me) markSeen();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p) => upsertMsg(p.new as Msg))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) dropMessage(id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_items', filter }, (p) => {
        const row = p.new as Media;
        if (row?.message_id) setMedia((cur) => ({ ...cur, [row.message_id]: { ...cur[row.message_id], ...row } }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_shares', filter }, (p) => {
        const row = p.new as LocationShare;
        if (row?.id) setShare(row);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (!first) void refetch(); // catch up after a reconnect
          first = false;
        }
      });
    })();
    return () => {
      cancelled = true;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [supabase, conversationId, me, upsertMsg, dropMessage, fetchMedia, markSeen, refetch, clearTyping]);

  // mark seen on open, focus and when the tab becomes visible
  useEffect(() => {
    markSeen();
    const vis = () => {
      if (document.visibilityState === 'visible') {
        markSeen();
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', markSeen);
    return () => {
      clearTimeout(seenTimer.current);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', markSeen);
    };
  }, [markSeen, refetch]);

  // an upload in progress is activity: do not sign out in the middle of it
  const uploading = uploads.some((u) => u.phase === 'uploading' || u.phase === 'processing');
  useEffect(() => (uploading ? holdAlive() : undefined), [uploading]);

  // abort in-flight uploads on unmount
  useEffect(() => {
    const map = controllers.current;
    return () => {
      for (const c of map.values()) c.abort();
    };
  }, []);

  // ---- scrolling
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    const newLast = !!last && last.id !== lastId.current;
    lastId.current = last?.id ?? null;
    if (stick.current || (newLast && last?.sender_id === me)) el.scrollTop = el.scrollHeight;
    else if (newLast && last && last.sender_id !== me && !initialIds.has(last.id)) setUnread((n) => n + 1);
  }, [messages, uploads, media, share, me, typing, initialIds, pending.length]);

  // When the list changes size (emoji panel, on-screen keyboard) stay glued to the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Images and videos change height when they finish loading: stay at the newest message if we were there.
  function keepAtBottom() {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }

  function onListScroll(el: HTMLDivElement) {
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    const far = el.scrollHeight - el.scrollTop - el.clientHeight > 240;
    if (far) setAway(true);
    else if (near) setAway(false);
    if (near) setUnread((n) => (n ? 0 : n));
  }

  // The on-screen keyboard takes a moment to open: keep the newest message in view while it does.
  function keyboardScroll() {
    stick.current = true;
    [50, 250, 500].forEach((ms) =>
      setTimeout(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, ms),
    );
  }

  const quoteOf = (id: string | null | undefined): Quote | null => {
    if (!id) return null;
    const m = messages.find((x) => x.id === id);
    if (!m) return { id, name: '', label: 'Earlier message' };
    return { id, name: m.sender_id === me ? 'You' : other.name, label: quoteLabel(m, media[m.id]), kind: quoteKind(m, media[m.id]) };
  };

  function startReply(id: string) {
    const m = messages.find((x) => x.id === id);
    if (!m || m.type === 'system') return;
    setEditingId(null);
    setReplyTo(m);
    composerRef.current?.focusBox();
  }

  function startEdit(id: string) {
    const m = messages.find((x) => x.id === id);
    if (!m || !canEdit(m, me)) return flash(editErrorText('edit window closed'));
    setReplyTo(null);
    setEditingId(id);
  }

  async function saveEdit(id: string, body: string): Promise<void> {
    const m = messages.find((x) => x.id === id);
    setEditingId(null); // leave edit mode and clear the box either way
    if (!m || validEditText(body, m.body) === null) return; // unchanged: nothing to save
    const { data, error } = await supabase.rpc('edit_message', { msg: id, new_body: body.trim() });
    if (error) return flash(editErrorText(error.message));
    upsertMsg({ ...m, body: body.trim(), edited_at: typeof data === 'string' ? data : new Date().toISOString() });
  }

  function jumpTo(id: string) {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) return flash('That message is further back in the chat.');
    stick.current = false;
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    el.classList.add('cv-flash');
    setTimeout(() => el.classList.remove('cv-flash'), 1400);
  }

  function scrollToLatest() {
    const el = listRef.current;
    if (!el) return;
    buzz(10);
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setUnread(0);
  }

  async function loadEarlier() {
    const first = messages[0];
    if (!first || loadingMore) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from('messages')
      .select(MSG_COLS)
      .eq('conversation_id', conversationId)
      .lt('created_at', first.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const rows = ((data ?? []) as Msg[]).reverse();
    setHasMore(rows.length >= PAGE);
    prevHeight.current = listRef.current?.scrollHeight ?? null;
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      for (const r of rows) if (!map.has(r.id)) map.set(r.id, r);
      return [...map.values()].sort(byTime);
    });
    await fetchMedia(rows.filter((r) => r.type === 'media').map((r) => r.id));
    setLoadingMore(false);
  }

  // ---- actions
  // Offline: the text goes to the outbox (shown as a pending bubble, sent in order when the connection is back).
  async function queueText(body: string, ambiguous: boolean): Promise<string | null> {
    const item = await enqueue({ userId: me, conversationId, body, replyTo: replyTo?.id ?? null, ambiguous });
    if (!item) return 'Message not saved. Too many unsent messages, or storage is unavailable.';
    setReplyTo(null);
    return null;
  }

  async function sendText(body: string): Promise<string | null> {
    // behind an unsent message, or with no signal: queue (keeps the order, nothing is lost)
    if (!navigator.onLine || pending.length > 0) {
      const err = await queueText(body, false);
      if (!err && navigator.onLine) void flushOutbox(supabase, me);
      return err;
    }
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: me, body, ...(replyTo ? { reply_to: replyTo.id } : {}) })
      .select(MSG_COLS)
      .single();
    if (error && classifyError(error, true) === 'network') {
      reportNetworkFailure();
      return queueText(body, true); // the request may have arrived: the outbox checks for a copy before resending
    }
    if (error) {
      return /rate limit/i.test(error.message)
        ? 'You are sending messages too fast. Please wait a moment and try again.'
        : 'Message not sent. Please try again.';
    }
    upsertMsg(data as Msg);
    setReplyTo(null);
    playSent();
    return null;
  }

  function onFile(f: File) {
    if (!/^(image|video)\//.test(f.type)) return flash('Only photos and videos can be sent.');
    setSheetFile(f);
  }

  function startUpload(file: File, c: AttachChoice) {
    setSheetFile(null);
    const o: UploadOpts = { conversationId, mode: c.mode, timerSeconds: c.timerSeconds, replyTo: replyTo?.id ?? null };
    setReplyTo(null);
    launchUpload(file, file.name, o);
  }

  function sendVoice(file: File) {
    const o: UploadOpts = { conversationId, mode: 'normal', timerSeconds: null, replyTo: replyTo?.id ?? null };
    setReplyTo(null);
    launchUpload(file, file.name, o);
  }

  function launchUpload(file: Blob, name: string, o: UploadOpts, resumeId?: string) {
    const key = crypto.randomUUID();
    const ctl = new AbortController();
    controllers.current.set(key, ctl);
    const patch = (p: Partial<UploadItem>) => setUploads((cur) => cur.map((u) => (u.key === key ? { ...u, ...p } : u)));
    setUploads((cur) => [...cur, { key, name, phase: 'uploading', sent: 0, total: file.size }]);
    uploadFile(file, o, (p) => patch(p), ctl.signal, {
      resume: resumeId ? { uploadId: resumeId } : undefined,
      onCreated: (id) => patch({ serverId: id }),
    })
      .then(({ uploadId }) => {
        patch({ phase: 'done', uploadId });
        setTimeout(() => setUploads((cur) => cur.filter((u) => u.key !== key)), 8000);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return setUploads((cur) => cur.filter((u) => u.key !== key));
        patch({ phase: 'error', error: e instanceof UploadError ? e.message : 'Upload failed. Please try again.' });
      })
      .finally(() => controllers.current.delete(key));
  }

  // Uploads that were interrupted (app closed, phone switched away) continue when the chat is opened again.
  const resumedIds = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    const seen = resumedIds.current;
    void listPending(conversationId).then((items) => {
      if (!live) return;
      for (const p of items) {
        if (seen.has(p.uploadId)) continue;
        seen.add(p.uploadId);
        launchUpload(p.file, p.name, { conversationId, mode: p.mode, timerSeconds: p.timerSeconds, replyTo: p.replyTo }, p.uploadId);
      }
    });
    return () => {
      live = false;
      seen.clear();
    };
  }, [conversationId]);

  function cancelUpload(key: string) {
    controllers.current.get(key)?.abort();
    const sid = uploads.find((u) => u.key === key)?.serverId;
    if (sid) void cancelUploadOnServer(sid);
    setUploads((cur) => cur.filter((u) => u.key !== key));
  }

  async function openSnap(m: Media) {
    if (opening) return;
    setOpening(m.id);
    try {
      const res = await fetch(`/api/media/${m.id}/open`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { token?: string; kind?: 'image' | 'video'; mime?: string; timerSeconds?: number | null; error?: string };
      if (res.status === 409) {
        setMedia((cur) => ({ ...cur, [m.message_id]: { ...m, deleted_at: m.deleted_at ?? new Date().toISOString() } }));
        flash('This snap is no longer available.');
      } else if (!res.ok || !data.token || !data.kind) flash(data.error ?? 'Could not open this snap.');
      else setSnap({ id: m.id, token: data.token, kind: data.kind, mime: data.mime ?? m.mime, timerSeconds: data.timerSeconds ?? null });
    } catch {
      flash('Could not open this snap. Check your connection.');
    } finally {
      setOpening(null);
    }
  }

  const closeSnap = useCallback(() => {
    setSnap((s) => {
      if (s) {
        const now = new Date().toISOString();
        setMedia((cur) => {
          const entry = Object.values(cur).find((m) => m.id === s.id);
          return entry ? { ...cur, [entry.message_id]: { ...entry, viewed_at: entry.viewed_at ?? now } } : cur;
        });
      }
      return null;
    });
  }, []);

  // Clear chat: hides the history for me only (the other person keeps theirs). Enforced in the database.
  async function clearChat() {
    setClearing(true);
    const { error } = await supabase.rpc('clear_chat', { conv: conversationId });
    setClearing(false);
    setClearAsk(false);
    if (error) return;
    setMessages([]);
    setMedia({});
    setHasMore(false);
  }

  // 'me': hides it for me only (database function). 'all': sender only, also removes the media files.
  async function confirmDelete(scope: 'me' | 'all') {
    if (!confirmId) return;
    const id = confirmId.id;
    setDeleting(true);
    let ok = false;
    if (scope === 'me') {
      const { error } = await supabase.rpc('hide_message', { msg: id });
      ok = !error;
    } else {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' }).catch(() => null);
      ok = !!res?.ok;
    }
    setDeleting(false);
    if (ok) dropMessage(id);
    else flash('Could not delete. Try again.');
    setConfirmId(null);
  }

  async function requestLocation() {
    setLocBusy(true);
    const res = await fetch('/api/location/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }).catch(() => null);
    setLocBusy(false);
    if (!res?.ok) return flash('Could not send the location request.');
    const { data } = await supabase.from('location_shares').select(SHARE_COLS).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(1);
    if (data?.[0]) setShare(data[0] as LocationShare);
    flash(`Location request sent to ${other.name}.`);
  }

  async function stopShare(id: string) {
    await fetch('/api/location/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shareId: id }),
    }).catch(() => {});
    setShare((s) => (s && s.id === id ? { ...s, status: 'stopped', last_lat: null, last_lng: null } : s));
  }

  // ---- render
  const mediaIds = new Set(Object.values(media).map((m) => m.id));
  const visibleUploads = uploads.filter((u) => !(u.uploadId && mediaIds.has(u.uploadId)));
  const iAmRequester = share?.requested_by === me;

  const rows: React.ReactNode[] = [];
  let lastDay = '';
  let prev: Msg | null = null;
  for (const m of messages) {
    const day = new Date(m.created_at).toDateString();
    const newDay = day !== lastDay;
    if (newDay) {
      lastDay = day;
      rows.push(
        <div key={`d-${day}`} className="flex justify-center pb-1 pt-3">
          <span className="cv-datechip rounded-full px-3 py-1 text-xs font-medium text-muted shadow-sm">{dayLabel(m.created_at)}</span>
        </div>,
      );
    }
    const firstOfRun = newDay || !prev || prev.sender_id !== m.sender_id || prev.type === 'system';
    prev = m;
    rows.push(
      <MessageBubble
        key={m.id}
        msg={m}
        media={media[m.id]}
        mine={m.sender_id === me}
        me={me}
        firstOfRun={firstOfRun}
        fresh={!initialIds.has(m.id) && (!historyStart || m.created_at > historyStart)}
        reactions={reactions.get(m.id)}
        stickerSaved={!!m.sticker_id && mySet.has(m.sticker_id)}
        opening={!!media[m.id] && opening === media[m.id].id}
        onDelete={(id, scope) => setConfirmId({ id, scope, mine: m.sender_id === me })}
        onOpenSnap={openSnap}
        onZoom={setZoom}
        onSaveMedia={(md) => void saveMedia(md.id, md.mime, flash)}
        onReact={(id, e) => void doReact(id, e)}
        onMoreReactions={setReactTarget}
        onStickerSave={(id, save) => void toggleSticker(id, save)}
        onMediaLoad={keepAtBottom}
        quote={quoteOf(m.reply_to)}
        onReply={startReply}
        onEdit={startEdit}
        onJump={jumpTo}
      />,
    );
  }

  const iconBtn = `cv-iconbtn flex h-10 w-10 items-center justify-center rounded-full text-muted disabled:opacity-40 ${FOCUS}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app">
      <header className="glass cv-header safe-top flex items-center gap-2 px-2 py-2">
        <Link href="/" className={`cv-iconbtn flex h-11 w-11 items-center justify-center rounded-full text-muted md:hidden ${FOCUS}`} aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <button type="button" onClick={() => setViewAvatar(true)} className={`relative shrink-0 rounded-full ${FOCUS}`} aria-label={`View ${other.name}'s profile picture`}>
          <Avatar userId={other.id} name={other.name} assetId={other.avatarAssetId} size={40} className={online ? 'ring-2 ring-accent/60' : ''} />
          {online && <span className="cv-online-dot absolute -bottom-0.5 -right-0.5 border-2 border-panel" aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold leading-tight">
            <span className="truncate">{other.name}</span>
            {muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted" role="img" aria-label={muteLabel(chatPref?.mutedUntil) || 'Muted'} />}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs leading-tight text-muted" aria-live="polite">
            {typing ? (
              <span className="text-grad font-medium">typing…</span>
            ) : online ? (
              <>
                <span className="cv-online-dot" aria-hidden />
                <span>online</span>
              </>
            ) : (
              <span className="truncate">{other.about ?? ''}</span>
            )}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={requestLocation}
            disabled={locBusy || share?.status === 'requested' || share?.status === 'active'}
            className={iconBtn}
            aria-label="Request location"
            title="Request location"
          >
            <MapPin className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={() => void call.start(false)} disabled={call.phase !== 'idle'} className={iconBtn} aria-label="Voice call">
          <Phone className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => void call.start(true)} disabled={call.phase !== 'idle'} className={iconBtn} aria-label="Video call">
          <Video className="h-5 w-5" />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className={iconBtn} aria-label="Chat options" aria-haspopup="menu" aria-expanded={menuOpen}>
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden />
              <div role="menu" className="glass ring-glow absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-2xl py-1 shadow-2xl">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setWpOpen(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-main outline-none hover:bg-panel-2 focus-visible:bg-panel-2"
                >
                  <ImageIcon className="h-4 w-4 text-accent" /> Wallpaper
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setMuteOpen(true);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-main outline-none hover:bg-panel-2 focus-visible:bg-panel-2"
                >
                  <BellOff className="h-4 w-4 shrink-0 text-accent" /> <span className="min-w-0">Mute notifications{muted && <span className="block truncate text-xs text-muted">{muteLabel(chatPref?.mutedUntil)}</span>}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false);
                    if (!(await toggleStar(conversationId))) flash('Could not update favourites');
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-main outline-none hover:bg-panel-2 focus-visible:bg-panel-2"
                >
                  <Star className="h-4 w-4 text-accent" fill={starred ? 'currentColor' : 'none'} /> {starred ? 'Remove from favourites' : 'Add to favourites'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setClearAsk(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-main outline-none hover:bg-panel-2 focus-visible:bg-panel-2"
                >
                  <Eraser className="h-4 w-4 text-accent" /> Clear chat
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {iAmRequester && <LocationPanel share={share} otherName={other.name} onStop={stopShare} />}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {toast && (
          <p className="cv-toast absolute left-1/2 top-2 z-10 max-w-[92%] -translate-x-1/2 rounded-full px-4 py-2 text-center text-sm text-main" role="status">
            {toast}
          </p>
        )}

        <div
          ref={listRef}
          data-chat-list
          onScroll={(e) => onListScroll(e.currentTarget)}
          style={wallpaperStyle(wp.kind, wp.preset, dark, wp.assetId, wp.own ? conversationId : null)}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        >
          {hasMore && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={() => void loadEarlier()}
                disabled={loadingMore}
                className={`cv-datechip rounded-full px-4 py-1.5 text-xs text-muted transition-colors hover:text-main disabled:opacity-70 ${loadingMore ? 'skeleton' : ''} ${FOCUS}`}
              >
                {loadingMore ? 'Loading...' : 'Load earlier messages'}
              </button>
            </div>
          )}
          {!messages.length && !visibleUploads.length && <EmptyChat name={other.name} onPick={(t) => composerRef.current?.fill(t)} />}
          {rows}
          {pending.map((p) => (
            <PendingBubble key={p.id} item={p} onRetry={(id) => void retryItem(id).then(() => flushOutbox(supabase, me))} onDelete={(id) => void deleteItem(id)} />
          ))}
          {typing && (
            <div className="cv-typing mt-2 flex justify-start" role="status" aria-label={`${other.name} is typing`}>
              <div className="cv-in flex items-center gap-1 rounded-[18px] rounded-tl-md px-3.5 py-3.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
          {visibleUploads.map((u) => (
            <UploadBubble
              key={u.key}
              item={u}
              onCancel={() => cancelUpload(u.key)}
              onDismiss={() => cancelUpload(u.key)}
            />
          ))}
        </div>

        {away && (
          <button
            type="button"
            onClick={scrollToLatest}
            className={`cv-latest absolute bottom-3 right-4 z-10 flex items-center gap-1.5 rounded-full py-2 pl-3 pr-3.5 text-sm font-semibold ${FOCUS}`}
            aria-label={unread ? `Scroll to latest, ${unread} new message${unread > 1 ? 's' : ''}` : 'Scroll to latest'}
          >
            <ArrowDown className="h-4 w-4" />
            {unread > 0 ? (
              <>
                <span>New</span>
                <span key={unread} className="cv-badge min-w-5 rounded-full px-1.5 text-center text-xs leading-5">
                  {unread > 99 ? '99+' : unread}
                </span>
              </>
            ) : (
              <span>Latest</span>
            )}
          </button>
        )}
      </div>

      <Composer handleRef={composerRef} onSend={sendText} onFile={onFile} onTyping={sendTyping} onStopTyping={stopTyping} onSticker={sendStickerMsg} onVoice={sendVoice} onFocusInput={keyboardScroll} reply={replyTo ? quoteOf(replyTo.id) : null} onCancelReply={() => setReplyTo(null)} editing={editingId ? { id: editingId, body: messages.find((x) => x.id === editingId)?.body ?? '' } : null} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} />

      {sheetFile && <AttachSheet file={sheetFile} onSend={(c) => startUpload(sheetFile, c)} onCancel={() => setSheetFile(null)} />}
      {zoom && <Lightbox src={`/api/media/${zoom.id}/stream`} onSave={() => void saveMedia(zoom.id, zoom.mime, flash)} onClose={() => setZoom(null)} />}
      {reactTarget && (
        <EmojiSheet
          onSelect={(e) => {
            void doReact(reactTarget, e);
            setReactTarget(null);
          }}
          onClose={() => setReactTarget(null)}
        />
      )}
      {snap && <SnapViewer snap={snap} onClose={closeSnap} />}
      {muteOpen && (
        <MuteSheet
          mutedUntil={chatPref?.mutedUntil ?? null}
          onClose={() => setMuteOpen(false)}
          onPick={async (o) => {
            setMuteOpen(false);
            if (!(await setMute(conversationId, o))) flash('Could not change mute');
          }}
        />
      )}
      {wpOpen && (
        <ChatWallpaperSheet
          supabase={supabase}
          me={me}
          conversationId={conversationId}
          current={chatWp}
          dark={dark}
          onChange={setChatWp}
          onClose={() => setWpOpen(false)}
          onError={flash}
        />
      )}
      {clearAsk && (
        <ConfirmDialog
          title="Clear this chat?"
          body={`All messages so far will be removed for you only. ${other.name} keeps their copy.`}
          confirmLabel="Clear chat"
          busy={clearing}
          onConfirm={() => void clearChat()}
          onCancel={() => setClearAsk(false)}
        />
      )}
      {confirmId && (
        <DeleteDialog
          mine={confirmId.mine}
          scope={confirmId.scope}
          name={other.name}
          busy={deleting}
          onDelete={(s) => void confirmDelete(s)}
          onCancel={() => {
            // give keyboard focus back to the message's options button (the menu item that opened this is gone)
            const id = confirmId.id;
            setConfirmId(null);
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-mid="${id}"] [aria-label="Message options"]`)?.focus());
          }}
        />
      )}
      {viewAvatar && <AvatarViewer userId={other.id} name={other.name} assetId={other.avatarAssetId} onClose={() => setViewAvatar(false)} />}
      <CallOverlay call={call} name={other.name} userId={other.id} avatarAssetId={other.avatarAssetId} />
    </div>
  );
}
