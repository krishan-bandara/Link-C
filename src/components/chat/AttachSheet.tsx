'use client';

import { useEffect, useState } from 'react';
import { Clock, Eye, ImageIcon, X } from 'lucide-react';
import type { UploadMode } from '@/lib/chat/uploader';
import { FOCUS } from './ui';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

export type AttachChoice = { mode: UploadMode; timerSeconds: number | null; hd: boolean };

const TIMES: (number | null)[] = [1, 2, 3, 5, 10, null];

export default function AttachSheet({
  file,
  onSend,
  onCancel,
}: {
  file: File;
  onSend: (c: AttachChoice) => void;
  onCancel: () => void;
}) {
  const dlg = useDialogFocus<HTMLDivElement>();
  const [mode, setMode] = useState<UploadMode>('normal');
  const [timer, setTimer] = useState<number | null>(5);
  const [hd, setHd] = useState(false);
  // HD only applies to ordinary photos kept in the chat (not snaps, not GIFs or video).
  const canHd = mode === 'normal' && (file.type === 'image/jpeg' || file.type === 'image/png');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  const opt = (m: UploadMode, icon: React.ReactNode, title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`cv-option flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${FOCUS} ${
        mode === m ? '' : 'border-line hover:bg-panel-2'
      }`}
    >
      <span className="text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </button>
  );

  return (
    <div className="cv-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onCancel}>
      <div
        ref={dlg}
        role="dialog"
        aria-modal="true"
        aria-label="Send media"
        className="cv-surface safe-bottom w-full max-w-md space-y-3 rounded-t-3xl p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Send media</h2>
            <p className="truncate text-xs text-muted">{file.name}</p>
          </div>
          <button type="button" onClick={onCancel} className={`flex h-9 w-9 items-center justify-center rounded-xl hover:bg-panel-2 ${FOCUS}`} aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>
        {opt('normal', <ImageIcon className="h-5 w-5" />, 'Keep in chat', 'Stays in the conversation')}
        {opt('once', <Eye className="h-5 w-5" />, 'View once', 'Disappears after it is opened')}
        {opt('timed', <Clock className="h-5 w-5" />, 'Timed snap', 'Disappears after the time you choose')}
        {mode === 'timed' && (
          <div className="flex flex-wrap gap-2 pl-1" role="group" aria-label="Time limit">
            {TIMES.map((t) => (
              <button
                key={String(t)}
                type="button"
                onClick={() => setTimer(t)}
                aria-pressed={timer === t}
                className={`cv-option rounded-full border px-3 py-1.5 text-sm ${FOCUS} ${
                  timer === t ? 'text-accent' : 'border-line text-muted'
                }`}
              >
                {t === null ? 'No time limit' : `${t} s`}
              </button>
            ))}
          </div>
        )}
        {canHd && (
          <button
            type="button"
            onClick={() => setHd(!hd)}
            aria-pressed={hd}
            className={`cv-option flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${FOCUS} ${hd ? '' : 'border-line hover:bg-panel-2'}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded border border-current text-[9px] font-bold leading-none text-accent">HD</span>
            <span>
              <span className="block text-sm font-medium">Send in HD</span>
              <span className="block text-xs text-muted">{hd ? 'Sharper photo, bigger upload' : 'Off: standard quality, faster'}</span>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onSend({ mode, timerSeconds: mode === 'timed' ? timer : null, hd: canHd && hd })}
          className={`cv-primary w-full rounded-xl py-3 text-sm font-semibold ${FOCUS}`}
          autoFocus
        >
          Send
        </button>
      </div>
    </div>
  );
}
