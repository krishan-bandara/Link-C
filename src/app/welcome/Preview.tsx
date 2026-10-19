'use client';

import { Check, CheckCheck } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { wallpaperStyle } from '@/lib/wallpapers';
import { DEFAULT_ABOUT, type WallpaperKind } from '@/lib/prefs';
import type { Theme } from '@/lib/theme';

const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'Auto' };

/** Live mini phone: shows the person's avatar, name, about, theme, accent and wallpaper exactly as chosen so far. */
export default function Preview({
  userId,
  name,
  about,
  assetId,
  localUrl,
  theme,
  wKind,
  wPreset,
  wAsset,
  dark,
  compact,
}: {
  userId: string;
  name: string;
  about: string;
  assetId: string | null;
  localUrl: string | null;
  theme: Theme;
  wKind: WallpaperKind;
  wPreset: string;
  wAsset: string | null;
  dark: boolean;
  compact?: boolean;
}) {
  const first = name.split(/\s+/)[0] || 'there';
  return (
    <div className="wz-phone mx-auto w-full max-w-[19rem]" aria-hidden>
      <div className="flex items-center gap-3 border-b border-line bg-panel/80 px-3 py-2.5">
        <span className="ui-avatar-ring">
          {localUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localUrl} alt="" width={40} height={40} className="block h-10 w-10 rounded-full border-2 border-app object-cover" />
          ) : (
            <Avatar key={assetId ?? 'none'} userId={userId} name={name} assetId={assetId} size={40} className="border-2 border-app" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-main">{name}</p>
          <p className="truncate text-xs text-muted">{about.trim() || DEFAULT_ABOUT}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-muted">{THEME_LABEL[theme]}</span>
      </div>
      <div className={`space-y-2 px-3 ${compact ? 'py-3' : 'py-4'}`} style={{ ...wallpaperStyle(wKind, wPreset, dark, wAsset), transition: 'background 0.4s' }}>
        <div className="max-w-[75%] rounded-2xl rounded-tl-md bg-bubble-in px-3 py-2 text-[13px] text-main shadow-sm">Hi {first}! Welcome to Link-C</div>
        <div className="ml-auto flex max-w-[75%] items-end gap-1 rounded-2xl rounded-tr-md bg-bubble-out px-3 py-2 text-[13px] text-main shadow-sm">
          <span>Looking good already</span>
          <CheckCheck className="h-3.5 w-3.5 shrink-0 text-tick" />
        </div>
        {!compact && (
          <div className="flex items-center gap-2 pt-1">
            <span className="h-8 flex-1 rounded-full bg-panel/80 px-3 text-xs leading-8 text-muted">Message</span>
            <span className="bg-grad flex h-8 w-8 items-center justify-center rounded-full text-accent-ink">
              <Check className="h-4 w-4" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
