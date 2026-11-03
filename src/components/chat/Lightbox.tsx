'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

export default function Lightbox({ src, onSave, onClose }: { src: string; onSave: () => void; onClose: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const btn =
    'cv-glassbtn flex h-10 w-10 items-center justify-center rounded-full text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
  return (
    <div
      className="cv-lightbox fixed inset-0 z-50 flex items-center justify-center p-2"
      ref={dlg}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <div className="safe-top absolute right-3 top-3 z-10 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onSave} className={btn} aria-label="Save photo" title="Save">
          <Download className="h-5 w-5" />
        </button>
        <button type="button" onClick={onClose} className={btn} aria-label="Close" autoFocus>
          <X className="h-5 w-5" />
        </button>
      </div>
      {state === 'loading' && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-hidden />
          <span className="text-sm">Loading photo...</span>
        </div>
      )}
      {state === 'error' ? (
        <p role="alert" className="rounded-lg bg-black/60 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
          Could not load the full photo. Close and try again.
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Photo"
          className={`max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
