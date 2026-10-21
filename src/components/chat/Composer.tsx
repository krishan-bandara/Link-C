'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, ImageIcon, Paperclip, Send, Smile } from 'lucide-react';
import dynamic from 'next/dynamic';
import StickerTray from './StickerTray';
import CreateStickerDialog from './CreateStickerDialog';
import { buzz } from '@/lib/chat/haptics';
import { FOCUS } from './ui';
import { ReplyBar, type Quote } from './ReplyQuote';
import './chat.css';

const EmojiPicker = dynamic(() => import('./EmojiPicker'), { ssr: false });

const MAX = 4000;

export type ComposerHandle = {
  /** Put text into the box (used by the conversation starters) and focus it. */
  fill: (text: string) => void;
  /** Focus the box (used when a reply is started). */
  focusBox: () => void;
};

export default function Composer({
  onSend,
  onFile,
  onTyping,
  onStopTyping,
  onSticker,
  onFocusInput,
  reply,
  onCancelReply,
  handleRef,
}: {
  onSend: (body: string) => Promise<string | null>;
  onFile: (f: File) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  onSticker: (stickerId: string) => Promise<string | null>;
  onFocusInput?: () => void;
  reply?: Quote | null;
  onCancelReply?: () => void;
  handleRef?: React.Ref<ComposerHandle>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'stickers'>('emoji');
  const [creating, setCreating] = useState(false);
  const [ghost, setGhost] = useState<{ key: number; text: string } | null>(null); // the little flight of the sent text
  const area = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null); // the textarea loses focus while the emoji picker is used

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const ghostKey = useRef(0);

  const closePanel = useCallback(() => {
    setPanel(false);
    area.current?.focus();
  }, []);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  useImperativeHandle(
    handleRef,
    () => ({
      focusBox() {
        area.current?.focus();
      },
      fill(t: string) {
        setText(t.slice(0, MAX));
        onTyping();
        requestAnimationFrame(() => {
          const el = area.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(t.length, t.length);
          resize(el);
        });
      },
    }),
    [onTyping],
  );

  useEffect(() => {
    if (!panel) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closePanel();
    const down = (e: Event) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !toggleRef.current?.contains(t)) setPanel(false);
    };
    document.addEventListener('keydown', esc, true); // capture: emoji-mart swallows Escape in its search box
    document.addEventListener('pointerdown', down);
    return () => {
      document.removeEventListener('keydown', esc, true);
      document.removeEventListener('pointerdown', down);
    };
  }, [panel, closePanel]);

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    onStopTyping();
    buzz(10);
    // Clear the box at once so anything typed while the send is in flight is a NEW message; put the text back if it fails.
    setText('');
    if (area.current) area.current.style.height = 'auto';
    const err = await onSend(body);
    setBusy(false);
    if (err) {
      setError(err);
      setText((cur) => cur || body);
    } else {
      ghostKey.current += 1;
      setGhost({ key: ghostKey.current, text: body.length > 60 ? `${body.slice(0, 60)}…` : body });
    }
    area.current?.focus();
  }

  function insertEmoji(emoji: string) {
    const el = area.current;
    const focused = !!el && document.activeElement === el;
    const start = focused ? (el?.selectionStart ?? text.length) : (caretRef.current ?? text.length);
    const end = focused ? (el?.selectionEnd ?? text.length) : start;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MAX);
    setText(next);
    onTyping();
    const caret = Math.min(start + emoji.length, next.length);
    caretRef.current = caret;
    requestAnimationFrame(() => {
      if (!el) return;
      el.setSelectionRange(caret, caret);
      resize(el);
    });
  }

  async function pickSticker(id: string) {
    setPanel(false);
    setError(null);
    buzz(10);
    const err = await onSticker(id);
    if (err) setError(err);
    area.current?.focus();
  }

  const tabCls = (on: boolean) => `cv-tab flex-1 py-2.5 text-sm font-medium ${FOCUS} ${on ? '' : 'text-muted'}`;
  const hasText = !!text.trim();
  const near = text.length > MAX - 300;
  const iconBtn = `cv-iconbtn mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted ${FOCUS}`;

  return (
    <div className="cv-composer safe-bottom relative px-2 py-2">
      {panel && (
        <div
          ref={panelRef}
          className="cv-panel flex h-[min(340px,45dvh)] flex-col overflow-hidden border-line max-md:-mx-2 max-md:mb-2 max-md:border-b md:absolute md:bottom-full md:left-2 md:z-20 md:mb-2 md:h-[420px] md:w-[352px] md:rounded-2xl md:border md:shadow-2xl"
        >
          <div className="cv-tabs border-b border-line" data-tab={tab} role="tablist" aria-label="Emoji or stickers">
            <button type="button" role="tab" aria-selected={tab === 'emoji'} className={tabCls(tab === 'emoji')} onClick={() => setTab('emoji')}>
              Emoji
            </button>
            <button type="button" role="tab" aria-selected={tab === 'stickers'} className={tabCls(tab === 'stickers')} onClick={() => setTab('stickers')}>
              Stickers
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'emoji' ? (
              <EmojiPicker onSelect={insertEmoji} />
            ) : (
              <StickerTray
                onPick={(id) => void pickSticker(id)}
                onCreate={() => {
                  setPanel(false);
                  setCreating(true);
                }}
              />
            )}
          </div>
        </div>
      )}
      {reply && onCancelReply && <ReplyBar q={reply} onCancel={onCancelReply} />}
      {error && (
        <p className="px-2 pb-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="relative flex items-end gap-1.5">
        {ghost && (
          <span
            key={ghost.key}
            aria-hidden
            onAnimationEnd={() => setGhost(null)}
            className="cv-ghost absolute bottom-3 left-24 right-14 z-10 truncate rounded-2xl bg-grad px-3 py-1.5 text-sm text-accent-ink"
          >
            {ghost.text}
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Take a photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setPanel((v) => !v)}
          className={`${iconBtn} ${panel ? 'text-accent' : ''}`}
          aria-label="Emoji and stickers"
          aria-expanded={panel}
        >
          <Smile className="h-6 w-6" />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setAttachMenu((v) => !v)} className={iconBtn} aria-label="Attach photo or video" aria-expanded={attachMenu}>
            <Paperclip className="h-5 w-5" />
          </button>
          {attachMenu && (
            <>
              <button type="button" tabIndex={-1} aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setAttachMenu(false)} />
              <div className="cv-surface absolute bottom-full left-0 z-30 mb-2 w-44 overflow-hidden rounded-2xl border border-line py-1 shadow-xl" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent/10 ${FOCUS}`}
                  onClick={() => {
                    setAttachMenu(false);
                    camRef.current?.click();
                  }}
                >
                  <Camera className="h-5 w-5 text-accent" aria-hidden /> Camera
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent/10 ${FOCUS}`}
                  onClick={() => {
                    setAttachMenu(false);
                    fileRef.current?.click();
                  }}
                >
                  <ImageIcon className="h-5 w-5 text-accent" aria-hidden /> Gallery
                </button>
              </div>
            </>
          )}
        </div>
        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={MAX}
          placeholder="Message"
          aria-label="Message"
          enterKeyHint="send"
          onFocus={() => onFocusInput?.()}
          onSelect={(e) => {
            caretRef.current = e.currentTarget.selectionStart;
          }}
          onChange={(e) => {
            setText(e.target.value);
            resize(e.target);
            if (e.target.value) onTyping();
            else onStopTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          className="cv-field max-h-36 min-h-11 flex-1 resize-none rounded-3xl px-4 py-2.5 text-base text-main outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!hasText || busy}
          data-on={hasText}
          data-flying={busy}
          tabIndex={hasText ? 0 : -1}
          aria-hidden={!hasText}
          className={`cv-send mb-0.5 flex h-11 shrink-0 items-center justify-center rounded-full text-accent-ink ${FOCUS}`}
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
      {near && (
        <p className={`px-2 pt-1 text-right text-xs ${text.length >= MAX - 50 ? 'text-danger' : 'text-muted'}`} aria-live="polite">
          {text.length}/{MAX}
        </p>
      )}
      {creating && (
        <CreateStickerDialog
          onClose={() => {
            setCreating(false);
            area.current?.focus();
          }}
          onCreated={() => {
            setCreating(false);
            setTab('stickers');
            setPanel(true);
          }}
        />
      )}
    </div>
  );
}
