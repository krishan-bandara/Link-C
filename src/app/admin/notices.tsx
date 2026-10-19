'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './kit';

type LinkInfo = { link: string; expiresAt?: string };
export type NoticeApi = {
  notify: (ok: boolean, message: string) => void;
  showLink: (info: LinkInfo) => void;
};
export const NoticeCtx = createContext<NoticeApi | null>(null);
export const useNotices = () => useContext(NoticeCtx);

type Toast = { id: number; ok: boolean; message: string };

const fmtExpiry = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';
};

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Shows a one-time link exactly once as a celebratory banner with a Copy button. */
function LinkBanner({ info, onClose }: { info: LinkInfo; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const exp = fmtExpiry(info.expiresAt);
  return (
    <div className="ad-banner pop" role="group" aria-label="One-time link">
      <div className="ad-sparks" aria-hidden="true">
        {SPARKS.map((i) => (
          <i key={i} style={{ ['--a' as string]: `${i * 45}deg`, animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <button type="button" className="ad-banner-x" aria-label="Dismiss link" onClick={onClose}>
        <Icon name="x" size={16} />
      </button>
      <div className="ad-banner-head">
        <span className="ad-banner-icon">
          <Icon name="link" size={20} />
        </span>
        <div className="min-w-0">
          <p className="ad-banner-title">One-time link. It is shown only now.</p>
          <p className="ad-banner-text">
            Works once, for 24 hours{exp ? ` (until ${exp})` : ''}. Send it privately to this person (never in a group or public channel). If you
            lose it, make a new one.
          </p>
        </div>
      </div>
      <div className="ad-banner-row">
        <input readOnly value={info.link} aria-label="One-time link" className="ad-input ad-mono" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className={`ad-btn ${copied ? 'ad-copied' : ''}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(info.link);
              setCopied(true);
            } catch {
              /* the person can copy by hand */
            }
          }}
        >
          <span key={String(copied)} className={copied ? 'pop inline-flex' : 'inline-flex'}>
            <Icon name={copied ? 'check' : 'copy'} size={16} />
          </span>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [link, setLink] = useState<{ key: number; info: LinkInfo } | null>(null);
  const seq = useRef(0);

  const notify = useCallback((ok: boolean, message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, ok, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ok ? 5000 : 9000);
  }, []);
  const showLink = useCallback((info: LinkInfo) => setLink({ key: ++seq.current, info }), []);
  const api = useMemo(() => ({ notify, showLink }), [notify, showLink]);

  // The link lives only in memory and disappears when the person dismisses it or reloads.
  useEffect(() => {
    if (!link) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setLink(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [link]);

  return (
    <NoticeCtx.Provider value={api}>
      {children}
      {link && (
        <div className="ad-banner-wrap">
          <LinkBanner key={link.key} info={link.info} onClose={() => setLink(null)} />
        </div>
      )}
      <div className="ad-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={`ad-toast pop ${t.ok ? 'ad-toast-ok' : 'ad-toast-bad'}`}>
            <Icon name={t.ok ? 'check' : 'alert'} size={16} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </NoticeCtx.Provider>
  );
}
