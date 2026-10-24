// The "clean glass" look settings, shared by server and client code (no next/* imports).
// Contract with the stylesheet (src/app/look.css) and the screens:
//   <html data-bg="white|pale|vivid|duo|mono" data-tabs="float|bar" style="--lg-a: 0.22; --lg-b: 24px">
//   --lg-a is the glass see-through amount (0.15 to 0.8), --lg-b the glass blur in px.
// Search bar, filter pills and read ticks are plain on/off switches handled by the screens themselves.
export const LOOK_COOKIE = 'lc-look';
export const LOOK_EVENT = 'lc-look-change'; // window event fired by applyLook so open screens update at once

export type LookBg = 'white' | 'pale' | 'vivid' | 'duo' | 'mono';
export type Look = { bg: LookBg; glass: number; blur: number; search: boolean; pills: boolean; ticks: boolean; tabs: boolean };

export const LOOK_BGS: { id: LookBg; name: string; blurb: string }[] = [
  { id: 'white', name: 'Pure white glass', blurb: 'Clear white, soft colour glow' },
  { id: 'pale', name: 'Soft pale', blurb: 'Pale tint of your colour' },
  { id: 'vivid', name: 'Vivid wallpaper', blurb: 'Rich colour behind the glass' },
  { id: 'duo', name: 'Two-tone', blurb: 'Two colours, like an iPhone wallpaper' },
  { id: 'mono', name: 'Plain', blurb: 'Flat grey or black' },
];

export const GLASS_MIN = 15;
export const GLASS_MAX = 80;
export const BLUR_MIN = 4;
export const BLUR_MAX = 34;

/** The one-tap "Pure white glass" preset (also the default for everyone). */
export const DEFAULT_LOOK: Look = { bg: 'white', glass: 22, blur: 24, search: true, pills: true, ticks: true, tabs: true };

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
export const isLookBg = (v: unknown): v is LookBg => LOOK_BGS.some((b) => b.id === v);

/** Accepts a JSON string (cookie or database) or an object; anything wrong falls back to the default. Never throws. */
export function parseLook(raw: unknown): Look {
  let o: Record<string, unknown> = {};
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (v && typeof v === 'object') o = v as Record<string, unknown>;
  } catch {
    /* use defaults */
  }
  const d = DEFAULT_LOOK;
  return {
    bg: isLookBg(o.bg) ? o.bg : d.bg,
    glass: clamp(o.glass, GLASS_MIN, GLASS_MAX, d.glass),
    blur: clamp(o.blur, BLUR_MIN, BLUR_MAX, d.blur),
    search: bool(o.search, d.search),
    pills: bool(o.pills, d.pills),
    ticks: bool(o.ticks, d.ticks),
    tabs: bool(o.tabs, d.tabs),
  };
}

export const serializeLook = (l: Look) => JSON.stringify(parseLook(l));

/** Attributes and inline CSS variables for the <html> element. */
export function lookAttrs(l: Look): { attrs: { 'data-bg': LookBg; 'data-tabs': 'float' | 'bar' }; style: Record<string, string> } {
  return {
    attrs: { 'data-bg': l.bg, 'data-tabs': l.tabs ? 'float' : 'bar' },
    style: { '--lg-a': String(l.glass / 100), '--lg-b': `${l.blur}px` },
  };
}

/** Browser only: apply at once and remember in a cookie so the server renders the same look next time. */
export function applyLook(l: Look) {
  const root = document.documentElement;
  const { attrs, style } = lookAttrs(l);
  for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
  for (const [k, v] of Object.entries(style)) root.style.setProperty(k, v);
  document.cookie = `${LOOK_COOKIE}=${encodeURIComponent(serializeLook(l))}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(LOOK_EVENT, { detail: parseLook(l) }));
}
