'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { FOCUS } from './ui';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

/** Modal full emoji picker (bottom sheet on phones, centred card on desktop). Used by the reaction '+' button. */
export default function EmojiSheet({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc, true); // capture: emoji-mart swallows Escape in its search box
    return () => document.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="cv-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        ref={dlg}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a reaction"
        className="cv-surface safe-bottom relative h-[470px] w-full max-w-sm overflow-hidden rounded-t-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close" className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-muted ${FOCUS}`}>
          <X className="h-4 w-4" />
        </button>
        <div className="h-full pt-11">
          <EmojiPicker onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}
