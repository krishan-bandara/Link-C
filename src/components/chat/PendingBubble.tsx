'use client';

import { Clock, RotateCw, Trash2 } from 'lucide-react';
import type { OutboxItem } from '@/lib/offline/logic';
import Linkify from './Linkify';
import { FOCUS } from './ui';

/** A text message that is waiting in the outbox: clock instead of ticks, or a red "Not sent" with retry / delete. */
export default function PendingBubble({ item, onRetry, onDelete }: { item: OutboxItem; onRetry: (id: string) => void; onDelete: (id: string) => void }) {
  const failed = item.status === 'failed';
  const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div data-pending={item.id} className="mt-0.5 flex justify-end">
      <div className="flex min-w-0 max-w-[85%] flex-col items-end">
        <p className={`cv-out flow-root select-text whitespace-pre-wrap rounded-[18px] px-3 py-1.5 text-[15px] leading-snug [overflow-wrap:anywhere] ${failed ? 'opacity-70 ring-1 ring-danger' : 'opacity-80'}`}>
          <Linkify text={item.body} />
          <span className="float-right ml-3 mt-2.5 flex items-center gap-1 text-xs leading-none text-muted">
            <span>{time}</span>
            {!failed && <Clock className="h-3.5 w-3.5" aria-label="Waiting to send" />}
          </span>
        </p>
        {failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-danger" role="alert">
            <span>{item.error ?? 'Not sent. Tap to retry or delete.'}</span>
            <button type="button" onClick={() => onRetry(item.id)} className={`flex items-center gap-1 rounded-full px-2 py-1 font-medium underline ${FOCUS}`}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden /> Retry
            </button>
            <button type="button" onClick={() => onDelete(item.id)} className={`flex items-center gap-1 rounded-full px-2 py-1 font-medium underline ${FOCUS}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
