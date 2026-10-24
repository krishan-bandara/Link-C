// Theme helpers shared by server and client code (no next/* imports).
export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'lc-theme';
export const ACCENT_COOKIE = 'lc-accent';
export const DEFAULT_ACCENT = '#007AFF';

/** Apple system colours, each with the partner colour used for the end of its gradient. */
export const ACCENTS: { name: string; hex: string; second: string }[] = [
  { name: 'Blue', hex: '#007AFF', second: '#5856D6' },
  { name: 'Green', hex: '#34C759', second: '#32ADE6' },
  { name: 'Mint', hex: '#00C7BE', second: '#32ADE6' },
  { name: 'Teal', hex: '#30B0C7', second: '#32ADE6' },
  { name: 'Cyan', hex: '#32ADE6', second: '#AF52DE' },
  { name: 'Indigo', hex: '#5856D6', second: '#AF52DE' },
  { name: 'Purple', hex: '#AF52DE', second: '#FF2D55' },
  { name: 'Pink', hex: '#FF2D55', second: '#FF9500' },
  { name: 'Red', hex: '#FF3B30', second: '#FFCC00' },
  { name: 'Orange', hex: '#FF9500', second: '#FF2D55' },
  { name: 'Yellow', hex: '#FFCC00', second: '#34C759' },
  { name: 'Brown', hex: '#A2845E', second: '#FF9500' },
  { name: 'Graphite', hex: '#8E8E93', second: '#AF52DE' },
];

/**
 * Theme packs: a full palette (plus a matching wallpaper and accent) laid over the light or dark mode.
 * The mode stays in data-theme so every existing light/dark rule keeps working; the pack is data-pack on <html>.
 */
export const PACK_COOKIE = 'lc-pack';
export type PackId = 'love' | 'cyber' | 'aurora' | 'sakura' | 'amoled';
export type PackInfo = { id: PackId; name: string; blurb: string; mode: 'light' | 'dark'; accent: string; second: string; wallpaper: string };
export const PACKS: PackInfo[] = [
  { id: 'love', name: 'Love', blurb: 'Rose and hearts', mode: 'light', accent: '#ff4d79', second: '#ff9a8b', wallpaper: 'hearts' },
  { id: 'cyber', name: 'Cyber Neon', blurb: 'Neon on black', mode: 'dark', accent: '#00f0ff', second: '#ff2bd6', wallpaper: 'circuit' },
  { id: 'aurora', name: 'Aurora', blurb: 'Northern lights', mode: 'dark', accent: '#5eead4', second: '#7c8cff', wallpaper: 'aurora' },
  { id: 'sakura', name: 'Sakura', blurb: 'Cherry blossom', mode: 'light', accent: '#e8588a', second: '#f4a6c0', wallpaper: 'sakura' },
  { id: 'amoled', name: 'Midnight', blurb: 'True black', mode: 'dark', accent: '#39ff88', second: '#2dd4bf', wallpaper: 'amoled' },
];
export const isPack = (v: unknown): v is PackId => PACKS.some((p) => p.id === v);
export const packInfo = (id: PackId | null | undefined) => PACKS.find((p) => p.id === id);

/** decodeURIComponent that never throws: a malformed cookie value must not crash a page. */
export const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
};

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system';
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v);

/** Readable text colour for text placed on the accent colour: whichever of white or dark ink has the better contrast. */
export function inkFor(hex: string, second?: string): string {
  const lumOf = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const mixHex = (x: string, y: string) => {
    const a = parseInt(x.slice(1), 16);
    const b = parseInt(y.slice(1), 16);
    const ch = (s: number) => Math.round((((a >> s) & 255) + ((b >> s) & 255)) / 2);
    return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
  };
  // text sits on the whole gradient (fill, middle, far end), so judge by the weakest point
  const points = [hex, ...(second && /^#[0-9a-f]{6}$/i.test(second) ? [mixHex(hex, second), second] : [])].map(lumOf);
  const DARK_LUM = 0.0102; // #111b21
  const withWhite = Math.min(...points.map((l) => 1.05 / (l + 0.05)));
  const withDark = Math.min(...points.map((l) => (l + 0.05) / (DARK_LUM + 0.05)));
  return withWhite >= withDark ? '#ffffff' : '#111b21';
}

/** The violet end of the gradient is fixed for the default cyan, otherwise it is a rotated shade of the accent. */
export function secondFor(hex: string, pack?: PackId | null): string {
  if (hex === '#6ee7f9') return '#a78bfa';
  const apple = ACCENTS.find((a) => a.hex.toLowerCase() === hex.toLowerCase());
  if (apple) return apple.second;
  const info = packInfo(pack);
  if (info && info.accent === hex) return info.second;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (a: number, b2: number) => Math.round(a * 0.45 + b2 * 0.55);
  return '#' + [mix(r, 167), mix(g, 139), mix(b, 250)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Inline style for <html> carrying the accent colour. */
export function accentStyle(hex: string, pack?: PackId | null): Record<string, string> {
  const h = isHex(hex) ? hex : DEFAULT_ACCENT;
  return { '--accent': h, '--c-accent-ink': inkFor(h, secondFor(h, pack)), '--a2': secondFor(h, pack) };
}

/** Browser only: apply immediately and remember in cookies so the server renders the same theme next time. */
export function applyTheme(theme: Theme, accent: string, pack?: PackId | null) {
  const root = document.documentElement;
  const hex = isHex(accent) ? accent : DEFAULT_ACCENT;
  root.setAttribute('data-theme', theme);
  if (pack !== undefined) {
    // undefined leaves the pack alone; null removes it
    if (pack) root.setAttribute('data-pack', pack);
    else root.removeAttribute('data-pack');
    document.cookie = `${PACK_COOKIE}=${pack ?? ''}; path=/; max-age=31536000; samesite=lax`;
  }
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--c-accent-ink', inkFor(hex, secondFor(hex, isPack(pack === undefined ? root.getAttribute('data-pack') : pack) ? ((pack === undefined ? root.getAttribute('data-pack') : pack) as PackId) : null)));
  const activePack = pack === undefined ? root.getAttribute('data-pack') : pack;
  root.style.setProperty('--a2', secondFor(hex, isPack(activePack) ? activePack : null));
  const opts = '; path=/; max-age=31536000; samesite=lax';
  document.cookie = `${THEME_COOKIE}=${theme}${opts}`;
  document.cookie = `${ACCENT_COOKIE}=${encodeURIComponent(hex)}${opts}`;
}
