// Chat wallpapers. Presets are pure CSS (no files), custom ones are the member's own encrypted picture.
import type { CSSProperties } from 'react';

const doodle = (stroke: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160' fill='none' stroke='${stroke}' stroke-width='1.6' stroke-linecap='round'>` +
      `<circle cx='24' cy='28' r='7'/><path d='M70 22c6-8 14 8 20 0s14 8 20 0'/><path d='M126 20l8 8m0-8l-8 8'/>` +
      `<rect x='20' y='84' width='14' height='14' rx='4'/><path d='M66 92c5 0 5 10 10 10s5-10 10-10'/><circle cx='122' cy='92' r='4'/>` +
      `<path d='M30 140c4-6 8 6 12 0'/><circle cx='84' cy='138' r='6'/><path d='M120 132l10 10m0-10l-10 10'/></svg>`,
  )}")`;

// One heart (Material "favorite" outline) used as a tile pattern. Several sizes and rotations give the WhatsApp-style scatter.
const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const hearts = (fill: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><g fill='${fill}'>` +
      `<path transform='translate(14 16) scale(1.1) rotate(-14 12 12)' d='${HEART}'/>` +
      `<path transform='translate(98 10) scale(0.7) rotate(12 12 12)' d='${HEART}'/>` +
      `<path transform='translate(140 62) scale(1.0) rotate(-8 12 12)' d='${HEART}'/>` +
      `<path transform='translate(52 70) scale(0.8) rotate(18 12 12)' d='${HEART}'/>` +
      `<path transform='translate(8 120) scale(0.9) rotate(10 12 12)' d='${HEART}'/>` +
      `<path transform='translate(96 112) scale(1.2) rotate(-18 12 12)' d='${HEART}'/>` +
      `<path transform='translate(150 140) scale(0.65) rotate(14 12 12)' d='${HEART}'/>` +
      `</g></svg>`,
  )}")`;

const circuit = (stroke: string, dot: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200' fill='none' stroke='${stroke}' stroke-width='1.2'>` +
      `<path d='M0 40h50l15 15h45M110 55v40l15 15h75M30 200v-60l20-20h40M150 0v30l15 15h35M70 200v-25l15-15h60'/>` +
      `<g fill='${dot}' stroke='none'><circle cx='50' cy='40' r='2.5'/><circle cx='110' cy='55' r='2.5'/><circle cx='125' cy='110' r='2.5'/><circle cx='50' cy='120' r='2.5'/><circle cx='165' cy='45' r='2.5'/><circle cx='85' cy='160' r='2.5'/></g></svg>`,
  )}")`;

const PETAL = 'M0 0c10-12 24-4 20 10C16 20 4 18 0 0z';
const petals = (fill: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g fill='${fill}'>` +
      `<path transform='translate(20 24) rotate(20)' d='${PETAL}'/>` +
      `<path transform='translate(120 14) rotate(-30)' d='${PETAL}'/>` +
      `<path transform='translate(70 80) rotate(60) scale(1.3)' d='${PETAL}'/>` +
      `<path transform='translate(160 100) rotate(10)' d='${PETAL}'/>` +
      `<path transform='translate(24 150) rotate(-50)' d='${PETAL}'/>` +
      `<path transform='translate(110 160) rotate(40) scale(1.2)' d='${PETAL}'/>` +
      `</g></svg>`,
  )}")`;

export type WallpaperPreset = { id: string; name: string; light: CSSProperties; dark: CSSProperties };

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'doodle',
    name: 'Doodle',
    light: { backgroundColor: '#efeae2', backgroundImage: doodle('rgba(0,0,0,0.07)') },
    dark: { backgroundColor: '#0b141a', backgroundImage: doodle('rgba(255,255,255,0.05)') },
  },
  {
    id: 'hearts',
    name: 'Hearts',
    light: { backgroundColor: '#ffe3ea', backgroundImage: hearts('rgba(255,77,121,0.22)') },
    dark: { backgroundColor: '#2a0f1b', backgroundImage: hearts('rgba(255,120,150,0.14)') },
  },
  {
    id: 'circuit',
    name: 'Circuit',
    light: { backgroundColor: '#e3f4fa', backgroundImage: circuit('rgba(0,120,150,0.22)', 'rgba(0,120,150,0.4)') },
    dark: { backgroundColor: '#03040a', backgroundImage: circuit('rgba(0,240,255,0.16)', 'rgba(255,43,214,0.5)') },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    light: { backgroundImage: 'linear-gradient(160deg,#d8f7f0,#d9dcff 60%,#e6f8ee)' },
    dark: {
      backgroundImage:
        'radial-gradient(120% 70% at 20% 0%,#0f4c4a 0,transparent 60%),radial-gradient(110% 70% at 90% 20%,#2c2f78 0,transparent 55%),linear-gradient(#051019,#06141d)',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    light: { backgroundColor: '#fdeef1', backgroundImage: petals('rgba(232,88,138,0.2)') },
    dark: { backgroundColor: '#24121a', backgroundImage: petals('rgba(244,166,192,0.12)') },
  },
  { id: 'amoled', name: 'Black', light: { backgroundColor: '#1a1a1a' }, dark: { backgroundColor: '#000000' } },
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
  conversationId?: string | null,
): CSSProperties {
  if (kind === 'custom' && customVersion) {
    return {
      backgroundColor: dark ? '#0b141a' : '#efeae2',
      backgroundImage: `url(${wallpaperUrl(customVersion, conversationId)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (kind === 'none') return { backgroundColor: 'var(--c-chat)' };
  const p = WALLPAPER_PRESETS.find((x) => x.id === preset) ?? WALLPAPER_PRESETS[0];
  return dark ? p.dark : p.light;
}

/** URL of a custom picture: the person's default, or (with a conversation id) that chat's own picture. */
export function wallpaperUrl(version: string, conversationId?: string | null): string {
  const c = conversationId ? `conversation=${encodeURIComponent(conversationId)}&` : '';
  return `/api/wallpaper?${c}v=${encodeURIComponent(version)}`;
}

export type WallpaperChoice = { kind: string | null; preset: string | null; assetId: string | null };

/** The chat's own choice if there is one, otherwise the person's default. */
export function effectiveWallpaper(chat: WallpaperChoice | null, fallback: WallpaperChoice): WallpaperChoice & { own: boolean } {
  if (chat && chat.kind) return { ...chat, own: true };
  return { ...fallback, own: false };
}
