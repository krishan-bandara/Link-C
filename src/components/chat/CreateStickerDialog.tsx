'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { createSticker } from '@/lib/chat/stickers';
import { FOCUS } from './ui';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

const CHECKER = {
  backgroundColor: '#fff',
  backgroundImage:
    'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,8px 8px',
};

export default function CreateStickerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const dlg = useDialogFocus<HTMLDivElement>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function create() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const err = await createSticker(file, emoji.trim());
    setBusy(false);
    if (err) setError(err);
    else onCreated();
  }

  return (
    <div className="cv-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        ref={dlg}
        role="dialog"
        aria-modal="true"
        aria-label="Create sticker"
        className="cv-surface safe-bottom w-full max-w-sm space-y-3 rounded-t-3xl p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Create sticker</h2>
          <button type="button" onClick={onClose} aria-label="Cancel" className={`flex h-9 w-9 items-center justify-center rounded-xl hover:bg-panel-2 ${FOCUS}`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className={`relative mx-auto flex aspect-square w-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-line focus-within:outline focus-within:outline-2 focus-within:outline-accent`} style={CHECKER}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Sticker preview" className="h-full w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-sm text-[#555]">
              <ImagePlus className="h-7 w-7" aria-hidden /> Choose a picture
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Choose a picture from your gallery"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Emoji label (optional)</span>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={8}
            className="mt-1 w-full rounded-xl border border-line bg-app px-3 py-2 text-base outline-none focus:border-accent"
          />
        </label>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button
          type="button"
          onClick={() => void create()}
          disabled={!file || busy}
          className={`cv-primary w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40 ${FOCUS}`}
        >
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}
