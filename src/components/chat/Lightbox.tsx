'use client';

import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

export default function Lightbox({ src, onSave, onClose }: { src: string; onSave: () => void; onClose: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
