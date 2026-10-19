// Chat wallpapers. Presets are pure CSS (no files), custom ones are the member's own encrypted picture.
import type { CSSProperties } from 'react';

const doodle = (stroke: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160' fill='none' stroke='${stroke}' stroke-width='1.6' stroke-linecap='round'>` +
      `<circle cx='24' cy='28' r='7'/><path d='M70 22c6-8 14 8 20 0s14 8 20 0'/><path d='M126 20l8 8m0-8l-8 8'/>` +
      `<rect x='20' y='84' width='14' height='14' rx='4'/><path d='M66 92c5 0 5 10 10 10s5-10 10-10'/><circle cx='122' cy='92' r='4'/>` +
      `<path d='M30 140c4-6 8 6 12 0'/><circle cx='84' cy='138' r='6'/><path d='M120 132l10 10m0-10l-10 10'/></svg>`,
  )}")`;

export type WallpaperPreset = { id: string; name: string; light: CSSProperties; dark: CSSProperties };

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'doodle',
    name: 'Doodle',
    light: { backgroundColor: '#efeae2', backgroundImage: doodle('rgba(0,0,0,0.07)') },
    dark: { backgroundColor: '#0b141a', backgroundImage: doodle('rgba(255,255,255,0.05)') },
  },
  { id: 'plain', name: 'Plain', light: { backgroundColor: '#efeae2' }, dark: { backgroundColor: '#0b141a' } },
  { id: 'mint', name: 'Mint', light: { backgroundColor: '#d9f2e6' }, dark: { backgroundColor: '#0d2a24' } },
  { id: 'sky', name: 'Sky', light: { backgroundColor: '#dbeafe' }, dark: { backgroundColor: '#0f1f3a' } },
  { id: 'rose', name: 'Rose', light: { backgroundColor: '#fde2e7' }, dark: { backgroundColor: '#2d1620' } },
  { id: 'sand', name: 'Sand', light: { backgroundColor: '#f3e7d3' }, dark: { backgroundColor: '#2a2216' } },
  {
    id: 'sunset',
    name: 'Sunset',
    light: { backgroundImage: 'linear-gradient(160deg,#ffd6a5,#fdc4d4 55%,#c9b6f2)' },
    dark: { backgroundImage: 'linear-gradient(160deg,#3b1f2b,#2a1c3d 60%,#14213d)' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    light: { backgroundImage: 'linear-gradient(160deg,#cdeffd,#b6e3d4)' },
    dark: { backgroundImage: 'linear-gradient(160deg,#0b2538,#0c3a3a)' },
  },
];

export const DEFAULT_WALLPAPER = 'doodle';

/**
 * Style for the chat message area.
 * kind: 'none' | 'preset' | 'custom'; custom pictures are served from /api/wallpaper (own picture only).
 */
export function wallpaperStyle(
  kind: string | null | undefined,
  preset: string | null | undefined,
  dark: boolean,
  customVersion?: string | null,
): CSSProperties {
  if (kind === 'custom' && customVersion) {
    return {
      backgroundColor: dark ? '#0b141a' : '#efeae2',
      backgroundImage: `url(/api/wallpaper?v=${encodeURIComponent(customVersion)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (kind === 'none') return { backgroundColor: 'var(--c-chat)' };
  const p = WALLPAPER_PRESETS.find((x) => x.id === preset) ?? WALLPAPER_PRESETS[0];
  return dark ? p.dark : p.light;
}
