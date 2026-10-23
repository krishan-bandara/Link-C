'use client';

import { Eye, Image as ImageIcon, Mic, Smile, Video, X } from 'lucide-react';
import type { QuoteKind } from '@/lib/chat/reply';
import { FOCUS } from './ui';

export type Quote = { id: string; name: string; label: string; kind?: QuoteKind };

function QuoteIcon({ kind }: { kind?: QuoteKind }) {
  const c = 'mr-1 inline h-3.5 w-3.5 shrink-0 align-[-2px]';
  if (kind === 'image') return <ImageIcon className={c} aria-hidden />;
  if (kind === 'video') return <Video className={c} aria-hidden />;
  if (kind === 'audio') return <Mic className={c} aria-hidden />;
  if (kind === 'snap') return <Eye className={c} aria-hidden />;
  if (kind === 'sticker') return <Smile className={c} aria-hidden />;
  return null;
}

/** The quoted message shown inside a bubble. Tap to jump to the original. */
export function QuoteInBubble({ q, mine, onJump }: { q: Quote | null; mine: boolean; onJump: (id: string) => void }) {
  if (!q) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(q.id);
      }}
      className={`mx-1 mb-1 mt-1 block w-[calc(100%-0.5rem)] min-w-[9rem] rounded-lg border-l-4 border-accent bg-black/10 px-2 py-1 text-left ${FOCUS}`}
      aria-label={`Reply to ${q.name}: ${q.label}. Tap to see the original`}
    >
      <span className={`block truncate text-xs font-semibold ${mine ? 'text-accent-ink' : 'text-accent'}`}>{q.name}</span>
      <span className="line-clamp-2 block text-xs opacity-80"><QuoteIcon kind={q.kind} />{q.label}</span>
    </button>
  );
}

/** The bar above the box while you are writing a reply. */
export function ReplyBar({ q, onCancel }: { q: Quote; onCancel: () => void }) {
  return (
    <div className="mx-2 mb-1 flex items-center gap-2 rounded-xl border-l-4 border-accent bg-panel-2 px-3 py-2" role="status">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-accent">Replying to {q.name}</p>
        <p className="truncate text-xs text-muted"><QuoteIcon kind={q.kind} />{q.label}</p>
      </div>
      <button type="button" onClick={onCancel} aria-label="Cancel reply" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel ${FOCUS}`}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
