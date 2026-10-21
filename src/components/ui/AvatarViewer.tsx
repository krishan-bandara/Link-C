'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Avatar from './Avatar';
import { useDialogFocus } from '@/components/chat/useDialogFocus';

/** Full-screen view of someone's profile picture, like tapping a contact photo in WhatsApp. Tap anywhere or press Escape to close. */
export default function AvatarViewer({ userId, name, assetId, onClose }: { userId: string; name: string; assetId?: string | null; onClose: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div
      ref={dlg}
      role="dialog"
      aria-modal="true"
      aria-label={`${name}'s profile picture`}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        autoFocus
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-6 w-6" />
      </button>
      {assetId && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatar/${userId}?v=${assetId}`}
          alt={`${name}'s profile picture`}
          onError={() => setFailed(true)}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[75dvh] max-w-[92vw] rounded-3xl object-contain shadow-2xl"
          style={{ minWidth: 240 }}
        />
      ) : (
        <div onClick={(e) => e.stopPropagation()}>
          <Avatar userId={userId} name={name} size={220} />
        </div>
      )}
      <p className="text-lg font-semibold text-white">{name}</p>
    </div>
  );
}
