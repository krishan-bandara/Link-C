'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import './chat.css';
import { holdAlive } from '@/lib/idle-client';
import { useDialogFocus } from './useDialogFocus';

export type OpenedSnap = { id: string; token: string; kind: 'image' | 'video'; mime: string; timerSeconds: number | null };

/** Fullscreen one-time viewer. Best-effort screenshot detection (browsers cannot truly block screenshots). */
export default function SnapViewer({ snap, onClose }: { snap: OpenedSnap; onClose: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();
  const { id, token, kind, timerSeconds } = snap;
  const [left, setLeft] = useState<number | null>(timerSeconds);
  const gradId = 'snap' + useId().replace(/:/g, '');
  const flagged = useRef(false);
  const started = useRef(false);
  const closed = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [vidPlaying, setVidPlaying] = useState(false);
  useEffect(() => (vidPlaying ? holdAlive() : undefined), [vidPlaying]); // playing video counts as activity

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);

  const start = useCallback(() => {
    if (started.current || !timerSeconds) return;
    started.current = true;
    const end = Date.now() + timerSeconds * 1000;
    const t = setInterval(() => {
      const rem = (end - Date.now()) / 1000;
      if (rem <= 0) {
        clearInterval(t);
        setLeft(0);
        close();
      } else setLeft(rem);
    }, 100);
    stopTimer.current = () => clearInterval(t);
  }, [timerSeconds, close]);
  const stopTimer = useRef<() => void>(() => {});
  useEffect(() => () => stopTimer.current(), []);

  // Safety net: if the media never loads, still honour the timer.
  useEffect(() => {
    if (!timerSeconds) return;
    const t = setTimeout(start, 8000);
    return () => clearTimeout(t);
  }, [timerSeconds, start]);

  useEffect(() => {
    const flag = () => {
      if (flagged.current) return;
      flagged.current = true;
      fetch(`/api/media/${id}/screenshot`, { method: 'POST', keepalive: true }).catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') return flag();
      if (e.metaKey && e.shiftKey && ['Digit3', 'Digit4', 'Digit5'].includes(e.code)) return flag();
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        flag();
      }
      if (e.key === 'Escape') close();
    };
    // Plain blur / visibilitychange are NOT flagged: calls, the notification shade and app switching fire them too.
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
    };
  }, [id, close]);

  const src = `/api/media/${id}/stream?t=${encodeURIComponent(token)}`;
  const block = (e: React.SyntheticEvent) => e.preventDefault();
  const R = 18;
  const C = 2 * Math.PI * R;
  const frac = timerSeconds && left !== null ? Math.max(0, left / timerSeconds) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black"
      ref={dlg}
      role="dialog"
      aria-modal="true"
      aria-label="Snap viewer"
      onContextMenu={block}
      onDragStart={block}
      onClick={timerSeconds ? undefined : close}
    >
      {loadFailed ? (
        <div className="flex flex-col items-center gap-3 px-6 text-center text-white" role="alert">
          <p className="text-sm">Could not load.</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="rounded-full bg-white/15 px-5 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Close
          </button>
        </div>
      ) : kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={start}
          onError={() => setLoadFailed(true)}
          className="pointer-events-none max-h-full max-w-full object-contain"
        />
      ) : (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          playsInline
          controls={!timerSeconds}
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          disableRemotePlayback
          onLoadedData={() => {
            // iOS may block autoplay: if play() is refused, ask for a tap instead of showing a frozen frame
            videoRef.current?.play().catch((e: unknown) => {
              if (e instanceof DOMException && e.name === 'AbortError') return;
              setNeedsTap(true);
            });
          }}
          onPlay={() => setVidPlaying(true)}
          onPause={() => setVidPlaying(false)}
          onEnded={() => setVidPlaying(false)}
          onPlaying={() => {
            setNeedsTap(false);
            start();
          }}
          onError={() => {
            setVidPlaying(false);
            setLoadFailed(true);
          }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />
      )}
      {needsTap && !loadFailed && kind === 'video' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            videoRef.current?.play().then(() => setNeedsTap(false)).catch(() => {});
          }}
          className="absolute inset-0 m-auto h-16 w-40 rounded-full bg-white/20 text-base font-medium text-white backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Tap to play
        </button>
      )}
      <div className="safe-top absolute right-3 top-3 flex items-center gap-2">
        {timerSeconds ? (
          <div className="relative flex h-12 w-12 items-center justify-center" aria-label={`${Math.ceil(left ?? 0)} seconds left`} role="timer">
            <svg viewBox="0 0 44 44" className="cv-snap-ring absolute inset-0 -rotate-90" data-low={(left ?? 0) <= 2}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" style={{ stopColor: 'var(--accent)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--a2)' }} />
                </linearGradient>
              </defs>
              <circle cx="22" cy="22" r={R} fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.18)" strokeWidth="3" />
              <circle
                cx="22"
                cy="22"
                r={R}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="3.5"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                strokeLinecap="round"
              />
            </svg>
            <span className="relative text-sm font-semibold tabular-nums text-white">{Math.ceil(left ?? 0)}</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="cv-glassbtn flex h-11 w-11 items-center justify-center rounded-full text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Close"
          autoFocus
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {!timerSeconds && kind === 'image' && (
        <p className="safe-bottom absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">Tap anywhere to close</p>
      )}
    </div>
  );
}
