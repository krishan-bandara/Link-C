'use client';
/*
 * SkyBackground({ intensity?: 'full' | 'subtle' })
 * Fixed full-screen decoration behind a page: pointer-reactive star constellation, falling code rain, floating
 * code symbols and (full only) a scrolling hex ticker. Put it first inside the page, content goes above it (z-index 1).
 *   - 'subtle' = far fewer elements, slower, lower opacity (behind wizards and onboarding).
 *   - Window events: dispatch new CustomEvent('lc:submit') to speed the rain up, 'lc:success' for a surge.
 *   - Reads --c-app / --accent / --a2 so it adapts to the light theme; honours prefers-reduced-motion (one static frame).
 *   - Mobile: fewer elements, lower frame rate, capped pixel ratio, pauses while the tab is hidden.
 * Decorative only (aria-hidden). The fake snippets are generic and contain no secrets.
 */
import { useEffect, useRef } from 'react';
import './auth.css';

type Rgb = [number, number, number];
const GLYPHS = ['{ }', '</>', '=>', '0x', '&&', '[ ]', '();', '//', '++', '#!', '!=', '::', '0b1', 'fn', '<>'];
const CHARS = '01{}[]<>/\\=;$#&|*+-0123456789ABCDEF'.split('');

// small deterministic generator so server and client render the same decoration
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const hex = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, '0');

function parseHex(v: string, fallback: Rgb): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const app = parseHex(cs.getPropertyValue('--c-app'), [7, 11, 20]);
  const light = (app[0] * 299 + app[1] * 587 + app[2] * 114) / 1000 > 140;
  const a1 = parseHex(cs.getPropertyValue('--accent'), [110, 231, 249]);
  const a2 = parseHex(cs.getPropertyValue('--a2'), [167, 139, 250]);
  const k = light ? 0.45 : 1; // darker strokes on light backgrounds
  const dark = (c: Rgb): Rgb => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
  return { light, a1: dark(a1), a2: dark(a2) };
}

export default function SkyBackground({ intensity = 'full' }: { intensity?: 'full' | 'subtle' }) {
  const skyRef = useRef<HTMLCanvasElement>(null);
  const rainRef = useRef<HTMLCanvasElement>(null);
  const subtle = intensity === 'subtle';

  useEffect(() => {
    const sky = skyRef.current;
    const rain = rainRef.current;
    const sc = sky?.getContext('2d');
    const rc = rain?.getContext('2d');
    if (!sky || !rain || !sc || !rc) return;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    const LH = 17;
    let theme = readTheme();
    let W = 0;
    let H = 0;
    let stars: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    let cols: { x: number; h: number; sp: number; len: number; ring: string[]; v: boolean }[] = [];
    let mx = -9999;
    let my = -9999;
    let boost = 1;
    let raf = 0;
    let lastSky = 0;
    let lastRain = 0;
    let ticks = 0;
    let relaxTimer: ReturnType<typeof setTimeout> | undefined;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, subtle ? 1 : mobile ? 1.5 : 2);
      W = window.innerWidth;
      H = window.innerHeight;
      for (const [cv, ctx] of [[sky, sc], [rain, rc]] as const) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      rc.font = '13px ui-monospace, Menlo, Consolas, monospace';
      const base = mobile ? Math.max(26, Math.min(48, Math.round((W * H) / 16000))) : Math.max(36, Math.min(95, Math.round((W * H) / 17000)));
      const n = subtle ? Math.max(10, Math.round(base * 0.4)) : base;
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * (subtle ? 0.12 : 0.25),
        vy: (Math.random() - 0.5) * (subtle ? 0.12 : 0.25),
        r: Math.random() * 1.4 + 0.4,
      }));
      const sp = (mobile ? 30 : 22) * (subtle ? 2.2 : 1);
      cols = Array.from({ length: Math.ceil(W / sp) }, (_, i) => ({
        x: i * sp + 4,
        h: (Math.random() * H) / LH,
        sp: (0.12 + Math.random() * 0.32) * (subtle ? 0.5 : 1),
        len: 8 + Math.floor(Math.random() * 14),
        ring: Array.from({ length: 40 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        v: Math.random() < 0.3,
      }));
    };

    const drawSky = (move: boolean) => {
      sc.clearRect(0, 0, W, H);
      const star = theme.light ? 'rgba(40,60,120,.5)' : 'rgba(220,232,255,.75)';
      const lineRgb = theme.light ? '70,90,170' : '140,170,255';
      const lineMax = theme.light ? 0.16 : 0.2;
      for (let i = 0; i < stars.length; i++) {
        const p = stars[i];
        if (move) {
          const dx = p.x - mx;
          const dy = p.y - my;
          const d = dx * dx + dy * dy;
          if (d < 22000) {
            const f = (1 - d / 22000) * 0.6;
            const r = Math.sqrt(d + 1);
            p.x += (dx / r) * f;
            p.y += (dy / r) * f;
          }
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -20) p.x = W + 20;
          if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20;
          if (p.y > H + 20) p.y = -20;
        }
        sc.beginPath();
        sc.arc(p.x, p.y, p.r, 0, 6.283);
        sc.fillStyle = star;
        sc.fill();
        for (let j = i + 1; j < stars.length; j++) {
          const q = stars[j];
          const ex = p.x - q.x;
          const ey = p.y - q.y;
          const e = ex * ex + ey * ey;
          if (e < 13000) {
            sc.strokeStyle = `rgba(${lineRgb},${(lineMax * (1 - e / 13000)).toFixed(3)})`;
            sc.lineWidth = 1;
            sc.beginPath();
            sc.moveTo(p.x, p.y);
            sc.lineTo(q.x, q.y);
            sc.stroke();
          }
        }
      }
    };

    const drawRain = (move: boolean, step: number) => {
      rc.clearRect(0, 0, W, H);
      const head = theme.light ? '20,40,80' : '235,250,255';
      const gain = (theme.light ? 0.6 : 1) * (subtle ? 0.6 : 1);
      const c1 = theme.a1.join(',');
      const c2 = theme.a2.join(',');
      for (const c of cols) {
        if (move) {
          c.h += c.sp * boost * step;
          if ((c.h - c.len) * LH > H) {
            c.h = -Math.random() * 20;
            c.sp = (0.12 + Math.random() * 0.32) * (subtle ? 0.5 : 1);
          }
          if (Math.random() < 0.04) c.ring[Math.floor(Math.random() * 40)] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        const hr = Math.floor(c.h);
        for (let k = 0; k < c.len; k++) {
          const row = hr - k;
          if (row < 0) continue;
          const a = 1 - k / c.len;
          rc.fillStyle = k === 0 ? `rgba(${head},${(0.9 * a * gain).toFixed(2)})` : `rgba(${c.v ? c2 : c1},${(0.85 * a * a * gain).toFixed(2)})`;
          rc.fillText(c.ring[((row % 40) + 40) % 40], c.x, row * LH);
        }
      }
      if (move) boost += (1 - boost) * 0.06;
    };

    size();
    drawSky(false);
    drawRain(false, 0);

    let onResize: () => void;
    if (reduce) {
      onResize = () => {
        size();
        drawSky(false);
        drawRain(false, 0);
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const skyEvery = mobile ? 33 : 0;
    const rainEvery = mobile ? 66 : 45;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - lastSky >= skyEvery) {
        lastSky = t;
        drawSky(true);
      }
      if (t - lastRain >= rainEvery) {
        drawRain(true, (t - lastRain > 200 ? rainEvery : t - lastRain) / 45);
        lastRain = t;
        if (++ticks % 90 === 0) theme = readTheme();
      }
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        theme = readTheme();
        start();
      }
    };
    let lastW = W;
    let lastH = H;
    onResize = () => {
      // phones fire resize when the address bar moves; ignore small height changes
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
      size();
      lastW = W;
      lastH = H;
    };
    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    const onUp = () => {
      clearTimeout(relaxTimer);
      relaxTimer = setTimeout(() => {
        mx = my = -9999;
      }, 700);
    };
    const onLeave = () => {
      mx = my = -9999;
    };
    const onSubmit = () => {
      boost = Math.max(boost, 4.5);
    };
    const onSuccess = () => {
      boost = 9;
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('lc:submit', onSubmit);
    window.addEventListener('lc:success', onSuccess);
    start();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(relaxTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('lc:submit', onSubmit);
      window.removeEventListener('lc:success', onSuccess);
      sc.clearRect(0, 0, W, H);
      rc.clearRect(0, 0, W, H);
    };
  }, [subtle]);

  // decoration content (deterministic: same on server and client)
  const r = rng(7);
  const glyphs = Array.from({ length: subtle ? 5 : 16 }, (_, i) => ({
    t: GLYPHS[Math.floor(r() * GLYPHS.length)],
    left: (r() * 96).toFixed(1),
    size: 14 + Math.floor(r() * 16),
    dur: (22 + r() * 28).toFixed(1),
    delay: (r() * 40).toFixed(1),
    v: i % 3 === 0,
  }));
  const rows = subtle
    ? []
    : Array.from({ length: 24 }, (_, i) => ({
        addr: hex(i * 16, 4),
        bytes: Array.from({ length: 16 }, () => hex(Math.floor(r() * 256), 2)).join(' '),
      }));
  const tickerRows = (key: string) =>
    rows.map((row) => (
      <span key={key + row.addr}>
        <b>0x{row.addr}</b>
        {'  ' + row.bytes + '  '}
        <i>|auth.session|</i>
        {'      '}
      </span>
    ));

  return (
    <div className="lc-sky" data-intensity={intensity} aria-hidden="true">
      <canvas ref={skyRef} />
      <canvas ref={rainRef} className="lc-rain" />
      {glyphs.map((g, i) => (
        <span
          key={i}
          className={g.v ? 'lc-glyph v' : 'lc-glyph'}
          style={{ left: `${g.left}vw`, fontSize: g.size, animationDuration: `${g.dur}s`, animationDelay: `-${g.delay}s` }}
        >
          {g.t}
        </span>
      ))}
      {!subtle && (
        <div className="lc-tick">
          <div>
            {tickerRows('a')}
            {tickerRows('b')}
          </div>
        </div>
      )}
    </div>
  );
}
