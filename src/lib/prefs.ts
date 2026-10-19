// Client-side helpers for the member's own profile and appearance preferences (RLS limits everything to own rows).
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_ACCENT, isHex, isTheme, type Theme } from '@/lib/theme';
import { DEFAULT_WALLPAPER } from '@/lib/wallpapers';

export type WallpaperKind = 'none' | 'preset' | 'custom';

export type Prefs = {
  theme: Theme;
  accent: string;
  wallpaperKind: WallpaperKind;
  wallpaperPreset: string;
  wallpaperAssetId: string | null;
  wizardDone: boolean;
};

export const DEFAULT_ABOUT = 'Hey there! I am using Link-C';

export const PREF_COLS = 'theme,accent,wallpaper_kind,wallpaper_preset,wallpaper_asset_id,wizard_done_at';

type Row = {
  theme?: string | null;
  accent?: string | null;
  wallpaper_kind?: string | null;
  wallpaper_preset?: string | null;
  wallpaper_asset_id?: string | null;
  wizard_done_at?: string | null;
};

export function prefsFromRow(r: Row | null | undefined): Prefs {
  return {
    theme: isTheme(r?.theme) ? r.theme : 'dark',
    accent: isHex(r?.accent) ? r.accent : DEFAULT_ACCENT,
    wallpaperKind: r?.wallpaper_kind === 'none' || r?.wallpaper_kind === 'custom' ? r.wallpaper_kind : 'preset',
    wallpaperPreset: r?.wallpaper_preset || DEFAULT_WALLPAPER,
    wallpaperAssetId: r?.wallpaper_asset_id ?? null,
    wizardDone: !!r?.wizard_done_at,
  };
}

export async function loadPrefs(supabase: SupabaseClient, userId: string): Promise<Prefs> {
  const { data } = await supabase.from('user_prefs').select(PREF_COLS).eq('user_id', userId).maybeSingle();
  if (!data) await supabase.from('user_prefs').insert({ user_id: userId });
  return prefsFromRow(data as Row | null);
}

/** Only the columns the browser may update. Returns true on success. */
export async function savePrefs(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<{
    theme: Theme;
    accent: string;
    wallpaper_kind: WallpaperKind;
    wallpaper_preset: string;
    wizard_done_at: string;
  }>,
): Promise<boolean> {
  const { error } = await supabase
    .from('user_prefs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return !error;
}

/** Browser only: is the dark palette in effect for this theme choice? */
export function resolveDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Upload or delete an own picture through the assets API. */
export async function uploadAsset(kind: 'avatar' | 'wallpaper', file: File): Promise<string | null> {
  const res = await fetch(`/api/assets?kind=${kind}`, { method: 'POST', body: file }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { assetId?: string };
  return j.assetId ?? null;
}

export async function deleteAsset(kind: 'avatar' | 'wallpaper'): Promise<boolean> {
  const res = await fetch(`/api/assets?kind=${kind}`, { method: 'DELETE' }).catch(() => null);
  return !!res?.ok;
}
