'use client';

import { useEffect } from 'react';
import { BellOff, Bell, X } from 'lucide-react';
import { MUTE_OPTIONS, isMuted, muteLabel, type MuteOptionId } from '@/lib/chatprefs';
import { FOCUS } from './ui';
import { useDialogFocus } from './useDialogFocus';

/** Bottom sheet to mute one chat for 8 hours, 1 week or until unmuted (or to unmute it). */
export default function MuteSheet({ mutedUntil, onPick, onClose }: { mutedUntil: string | null; onPick: (o: MuteOptionId | 'off') => void; onClose: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const muted = isMuted(mutedUntil);
  const row = `flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-main hover:bg-panel-2 ${FOCUS}`;

  return (
    <div className="cv-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        ref={dlg}
        role="dialog"
        aria-modal="true"
        aria-label="Mute notifications"
        className="cv-surface safe-bottom max-h-[88dvh] w-full max-w-md space-y-2 overflow-y-auto rounded-t-3xl p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Mute notifications</h2>
            <p className="text-xs text-muted">{muted ? muteLabel(mutedUntil) : 'No sound, push or SMS from this chat. Unread badges still show.'}</p>
          </div>
          <button type="button" onClick={onClose} className={`flex h-11 w-11 items-center justify-center rounded-xl hover:bg-panel-2 ${FOCUS}`} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {MUTE_OPTIONS.map((o) => (
          <button key={o.id} type="button" className={row} onClick={() => onPick(o.id)}>
            <BellOff className="h-4 w-4 text-accent" aria-hidden /> {o.label}
          </button>
        ))}
        {muted && (
          <button type="button" className={row} onClick={() => onPick('off')}>
            <Bell className="h-4 w-4 text-accent" aria-hidden /> Unmute
          </button>
        )}
      </div>
    </div>
  );
}
