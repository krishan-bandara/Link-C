import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, lookAttrs, parseLook, serializeLook, type Look } from '@/lib/look';
import { ACCENTS, accentStyle, DEFAULT_ACCENT, inkFor, isHex, secondFor } from '@/lib/theme';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('parseLook', () => {
  it('parses a valid JSON string', () => {
    const l = parseLook(JSON.stringify({ bg: 'vivid', glass: 40, blur: 10, search: false, pills: false, ticks: false, tabs: false }));
    expect(l).toEqual({ bg: 'vivid', glass: 40, blur: 10, search: false, pills: false, ticks: false, tabs: false });
  });

  it('accepts an object', () => {
    expect(parseLook({ bg: 'duo', glass: 50 })).toEqual({ ...DEFAULT_LOOK, bg: 'duo', glass: 50 });
  });

  it('falls back to the default for garbage', () => {
    for (const g of ['not json', '{bad', '', null, undefined, 42, true, [], '[]', 'null', '"str"']) {
      expect(parseLook(g)).toEqual(DEFAULT_LOOK);
    }
  });

  it('clamps out-of-range numbers', () => {
    expect(parseLook({ glass: 5, blur: 1 })).toMatchObject({ glass: 15, blur: 4 });
    expect(parseLook({ glass: 999, blur: 999 })).toMatchObject({ glass: 80, blur: 34 });
    expect(parseLook({ glass: -10, blur: -10 })).toMatchObject({ glass: 15, blur: 4 });
  });

  it('uses defaults for non-numeric glass and blur', () => {
    expect(parseLook({ glass: 'abc', blur: NaN })).toMatchObject({ glass: DEFAULT_LOOK.glass, blur: DEFAULT_LOOK.blur });
  });

  it('falls back for non-boolean switches', () => {
    const l = parseLook({ search: 'no', pills: 0, ticks: null, tabs: 'false' });
    expect(l.search).toBe(DEFAULT_LOOK.search);
    expect(l.pills).toBe(DEFAULT_LOOK.pills);
    expect(l.ticks).toBe(DEFAULT_LOOK.ticks);
    expect(l.tabs).toBe(DEFAULT_LOOK.tabs);
  });

  it('falls back for an unknown bg', () => {
    expect(parseLook({ bg: 'neon' }).bg).toBe(DEFAULT_LOOK.bg);
    expect(parseLook({ bg: 5 }).bg).toBe(DEFAULT_LOOK.bg);
  });

  it('never throws', () => {
    const weird: unknown[] = [Symbol('x'), () => 1, { bg: {} }, { glass: {} }, BigInt(1), new Date(), Object.create(null)];
    for (const w of weird) {
      expect(() => parseLook(w)).not.toThrow();
    }
  });
});

describe('serializeLook', () => {
  it('round trips', () => {
    const l: Look = { bg: 'mono', glass: 33, blur: 12, search: false, pills: true, ticks: false, tabs: true };
    expect(parseLook(serializeLook(l))).toEqual(l);
    expect(parseLook(serializeLook(DEFAULT_LOOK))).toEqual(DEFAULT_LOOK);
  });

  it('stays under 200 characters', () => {
    const l: Look = { bg: 'vivid', glass: 80, blur: 34, search: false, pills: false, ticks: false, tabs: false };
    expect(serializeLook(l).length).toBeLessThan(200);
  });
});

describe('lookAttrs', () => {
  it('floats the tabs when tabs is true', () => {
    expect(lookAttrs({ ...DEFAULT_LOOK, tabs: true }).attrs['data-tabs']).toBe('float');
  });

  it('uses a bar when tabs is false', () => {
    expect(lookAttrs({ ...DEFAULT_LOOK, tabs: false }).attrs['data-tabs']).toBe('bar');
  });

  it('outputs bg and glass/blur variables', () => {
    const { attrs, style } = lookAttrs({ ...DEFAULT_LOOK, bg: 'pale', glass: 22, blur: 24 });
    expect(attrs['data-bg']).toBe('pale');
    expect(style['--lg-a']).toBe('0.22');
    expect(style['--lg-b']).toBe('24px');
  });
});

describe('ACCENTS', () => {
  it('has 13 unique valid hex colours', () => {
    expect(ACCENTS).toHaveLength(13);
    expect(new Set(ACCENTS.map((a) => a.hex.toLowerCase())).size).toBe(13);
    for (const a of ACCENTS) expect(a.hex).toMatch(HEX);
  });

  it('gives each a valid second colour', () => {
    for (const a of ACCENTS) expect(a.second).toMatch(HEX);
  });
});

describe('secondFor', () => {
  it('returns the partner for each Apple colour', () => {
    for (const a of ACCENTS) expect(secondFor(a.hex)).toBe(a.second);
  });

  it('returns a valid hex for a custom colour', () => {
    expect(secondFor('#123456')).toMatch(HEX);
    expect(secondFor('#ffffff')).toMatch(HEX);
    expect(secondFor('#000000')).toMatch(HEX);
  });
});

describe('inkFor', () => {
  it('is dark on yellow and white on blue', () => {
    expect(inkFor('#FFCC00')).toBe('#111b21');
    expect(inkFor('#007aff', secondFor('#007aff'))).toBe('#ffffff');
  });
});

describe('accentStyle', () => {
  it('describes the default accent', () => {
    const s = accentStyle(DEFAULT_ACCENT);
    expect(s['--accent']).toBe('#007aff');
    expect(s['--c-accent-ink']).toBe('#ffffff');
    expect(s['--a2']).toMatch(HEX);
  });

  it('falls back to the default accent for an invalid colour', () => {
    expect(accentStyle('nope')['--accent']).toBe(DEFAULT_ACCENT);
  });

  it('isHex is lowercase-only (documented behaviour)', () => {
    expect(isHex('#007aff')).toBe(true);
  });
});
