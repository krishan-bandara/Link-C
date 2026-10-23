'use client';

import { useRef } from 'react';
import { Ban, ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { WALLPAPER_PRESETS, wallpaperStyle } from '@/lib/wallpapers';
import type { WallpaperKind } from '@/lib/prefs';

const tile =
  'ui-tile relative flex aspect-[3/4] items-end justify-center overflow-hidden rounded-xl border-2 border-line outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** Preset grid + "No wallpaper" + gallery upload. Uploading is done by the parent through onUpload. */
export default function WallpaperPicker({
  kind,
  preset,
  assetId,
  dark,
  busy,
  onPreset,
  onNone,
  onUpload,
  onRemoveCustom,
  onCustom,
  conversationId,
  onUseDefault,
}: {
  kind: WallpaperKind;
  preset: string;
  assetId: string | null;
  dark: boolean;
  busy?: boolean;
  onPreset: (id: string) => void;
  onNone: () => void;
  onUpload: (file: File) => void;
  onRemoveCustom?: () => void;
  /** Select the already uploaded picture (otherwise tapping it opens the file chooser). */
  onCustom?: () => void;
  /** Per-chat use: the picture is that chat's own one. */
  conversationId?: string;
  /** Per-chat use: shows a "Use default" button that removes the chat's override. */
  onUseDefault?: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4 sm:grid-cols-5">
        {WALLPAPER_PRESETS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={kind === 'preset' && preset === p.id}
            onClick={() => onPreset(p.id)}
            style={{ animationDelay: `${i * 30}ms` }}
            className={`${tile} rise`}
          >
            <span className="ui-wp-img" style={wallpaperStyle('preset', p.id, dark)} aria-hidden />
            <span className="relative mb-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/55 px-1.5 text-[11px] text-white">{p.name}</span>
          </button>
        ))}
        {assetId && (
          <button
            type="button"
            aria-pressed={kind === 'custom'}
            onClick={() => (kind !== 'custom' && onCustom ? onCustom() : file.current?.click())}
            className={`${tile} rise`}
            aria-label={kind === 'custom' ? 'Your picture, tap to replace' : 'Your picture'}
          >
            <span className="ui-wp-img" style={wallpaperStyle('custom', null, dark, assetId, conversationId)} aria-hidden />
            <span className="relative mb-1 rounded bg-black/55 px-1.5 text-[11px] text-white">Yours</span>
          </button>
        )}
        <button
          type="button"
          aria-pressed={kind === 'none'}
          onClick={onNone}
          className={`${tile} rise flex-col items-center justify-center gap-1 bg-chat text-xs text-muted`}
        >
          <Ban className="h-6 w-6" aria-hidden />
          <span className="mb-1">None</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="ui-btn-outline">
          <ImagePlus className="h-4 w-4" aria-hidden /> {busy ? 'Uploading…' : 'Choose from gallery'}
        </button>
        {onUseDefault && (
          <button type="button" disabled={busy} onClick={onUseDefault} className="ui-btn-outline">
            <RotateCcw className="h-4 w-4" aria-hidden /> Use default
          </button>
        )}
        {assetId && onRemoveCustom && (
          <button type="button" disabled={busy} onClick={onRemoveCustom} className="ui-btn-ghost !px-4 !py-2.5 text-sm !text-danger">
            <Trash2 className="h-4 w-4" aria-hidden /> Remove my picture
          </button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a wallpaper picture"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onUpload(f);
        }}
      />
    </div>
  );
}
