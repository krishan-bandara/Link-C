// Theme helpers shared by server and client code (no next/* imports).
export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'lc-theme';
export const ACCENT_COOKIE = 'lc-accent';
export const DEFAULT_ACCENT = '#6ee7f9';

/** WhatsApp green first, then a few friendly alternatives. */
export const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Cyan', hex: '#6ee7f9' },
  { name: 'Violet', hex: '#a78bfa' },
  { name: 'Mint', hex: '#5eead4' },
  { name: 'Pink', hex: '#f472b6' },
  { name: 'Amber', hex: '#fbbf24' },
  { name: 'Blue', hex: '#60a5fa' },
  { name: 'Rose', hex: '#fb7185' },
  { name: 'Lime', hex: '#a3e635' },
];

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system';
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v);

/** Readable text colour for text placed on the accent colour: whichever of white or dark ink has the better contrast. */
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const DARK_LUM = 0.0102; // #111b21
  const withWhite = 1.05 / (lum + 0.05);
  const withDark = (lum + 0.05) / (DARK_LUM + 0.05);
  return withDark > withWhite ? '#111b21' : '#ffffff';
}

/** The violet end of the gradient is fixed for the default cyan, otherwise it is a rotated shade of the accent. */
export function secondFor(hex: string): string {
  if (hex === '#6ee7f9') return '#a78bfa';
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (a: number, b2: number) => Math.round(a * 0.45 + b2 * 0.55);
  return '#' + [mix(r, 167), mix(g, 139), mix(b, 250)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Inline style for <html> carrying the accent colour. */
export function accentStyle(hex: string): Record<string, string> {
  const h = isHex(hex) ? hex : DEFAULT_ACCENT;
  return { '--accent': h, '--c-accent-ink': inkFor(h), '--a2': secondFor(h) };
}

/** Browser only: apply immediately and remember in cookies so the server renders the same theme next time. */
export function applyTheme(theme: Theme, accent: string) {
  const root = document.documentElement;
  const hex = isHex(accent) ? accent : DEFAULT_ACCENT;
  root.setAttribute('data-theme', theme);
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--c-accent-ink', inkFor(hex));
  root.style.setProperty('--a2', secondFor(hex));
  const opts = '; path=/; max-age=31536000; samesite=lax';
  document.cookie = `${THEME_COOKIE}=${theme}${opts}`;
  document.cookie = `${ACCENT_COOKIE}=${encodeURIComponent(hex)}${opts}`;
}
