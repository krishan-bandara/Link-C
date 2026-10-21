'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { supabaseBrowser } from '@/lib/supabase/browser';
import WallpaperPicker from '@/components/ui/WallpaperPicker';
import type { WallpaperKind } from '@/lib/prefs';
import type { WallpaperChoice } from '@/lib/wallpapers';
import { FOCUS } from './ui';
import { useDialogFocus } from './useDialogFocus';

/** A chat's own wallpaper (null = none set, the chat uses the person's default). */
export type ChatWallpaper = WallpaperChoice | null;

const asKind = (k: string | null): WallpaperKind => (k === 'none' || k === 'custom' ? k : 'preset');

/** Bottom sheet to pick the wallpaper of ONE chat. Presets and "none" are saved with RLS-protected writes, pictures through /api/assets. */
export default function ChatWallpaperSheet({
  supabase,
  me,
  conversationId,
  current,
  dark,
  onChange,
  onClose,
  onError,
}: {
  supabase: ReturnType<typeof supabaseBrowser>;
  me: string;
  conversationId: string;
  current: ChatWallpaper;
  dark: boolean;
  onChange: (w: ChatWallpaper) => void;
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const dlg = useDialogFocus<HTMLDivElement>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const q = `kind=wallpaper&conversation=${encodeURIComponent(conversationId)}`;

  // The picture the picker offers as "Yours" is only the chat's own picture, never the default one.
  const ownAsset = current?.assetId ?? null;

  async function save(kind: WallpaperKind, preset: string | null) {
    setBusy(true);
    const { error } = await supabase
      .from('chat_wallpapers')
      .upsert(
        { user_id: me, conversation_id: conversationId, kind, preset, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,conversation_id' },
      );
    setBusy(false);
    if (error) return onError('Could not change the wallpaper');
    onChange({ kind, preset, assetId: ownAsset });
  }

  async function upload(f: File) {
    setBusy(true);
    const res = await fetch(`/api/assets?${q}`, { method: 'POST', body: f }).catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => ({}))) as { assetId?: string }) : null;
    setBusy(false);
    if (!j?.assetId) return onError(res?.status === 413 ? 'That picture is too large' : 'Could not use that picture');
    onChange({ kind: 'custom', preset: current?.preset ?? null, assetId: j.assetId });
  }

  async function resetToDefault() {
    setBusy(true);
    const res = await fetch(`/api/assets?${q}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return onError('Could not reset the wallpaper');
    onChange(null);
  }

  return (
    <div className="cv-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        ref={dlg}
        role="dialog"
        aria-modal="true"
        aria-label="Chat wallpaper"
        className="cv-surface safe-bottom max-h-[88dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Chat wallpaper</h2>
            <p className="text-xs text-muted">
              {current ? 'Only for this chat, and only for you. Use default also deletes this chat picture.' : 'Using your default wallpaper. Pick one to change just this chat.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className={`flex h-9 w-9 items-center justify-center rounded-xl hover:bg-panel-2 ${FOCUS}`} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <WallpaperPicker
          kind={current ? asKind(current.kind) : 'preset'}
          preset={current?.preset ?? ''}
          assetId={ownAsset}
          dark={dark}
          busy={busy}
          conversationId={conversationId}
          onPreset={(id) => void save('preset', id)}
          onNone={() => void save('none', null)}
          onUpload={(f) => void upload(f)}
          onCustom={ownAsset ? () => void save('custom', current?.preset ?? null) : undefined}
          onUseDefault={current ? () => void resetToDefault() : undefined}
        />
      </div>
    </div>
  );
}
