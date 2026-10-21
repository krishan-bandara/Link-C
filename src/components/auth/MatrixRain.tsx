'use client';
/*
 * MatrixRain({ intensity?: 'full' | 'subtle' })
 * Fixed full-screen "code rain" canvas behind a page (katakana, digits and code symbols falling in green/cyan).
 *   - 'subtle' = dimmer, slower, bigger cells (calmer on phones).
 *   - Cheap: ~30fps, devicePixelRatio capped, pauses while the tab is hidden, resizes with the viewport, cleans up on unmount.
 *   - prefers-reduced-motion: one static dim frame, no animation.
 *   - Window events: 'lc:submit' speeds the rain up briefly, 'lc:success' surges it.
 * Decorative only (aria-hidden). No external assets. Put it first inside the page; content goes above it (z-index 1).
 */
import { useEffect, useRef } from 'react';
import './auth.css';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾜ0123456789{}<>/;01:=+*'.split('');
const FRAME_MS = 1000 / 30;
const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

export default function MatrixRain({ intensity = 'full' }: { intensity?: 'full' | 'subtle' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const subtle = intensity === 'subtle';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const base = subtle ? 0.55 : 1;
    let boost = 1;
    let size = 16;
    let cols = 0;
    let rows = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let y: number[] = [];
    let v: number[] = [];
    let last: string[] = [];
    let raf = 0;
    let prev = 0;
    let resizeRaf = 0;

    const setup = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, subtle ? 1 : 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      size = w < 640 ? 15 : 17;
      cols = Math.ceil(w / size);
      rows = Math.ceil(h / size);
      y = Array.from({ length: cols }, () => -Math.random() * rows);
      v = Array.from({ length: cols }, () => 0.25 + Math.random() * 0.6);
      last = Array.from({ length: cols }, pick);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
      ctx.textBaseline = 'top';
    };

    const step = () => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < cols; i++) {
        const r0 = Math.floor(y[i]);
        y[i] += v[i] * base * boost;
        const r1 = Math.floor(y[i]);
        if (r1 === r0) continue;
        const x = i * size;
        if (r0 >= 0 && r0 < rows) {
          ctx.fillStyle = i % 5 === 0 ? '#22d3ee' : '#00d98a';
          ctx.fillText(last[i], x, r0 * size);
        }
        if (r1 >= 0 && r1 < rows) {
          last[i] = pick();
          ctx.fillStyle = '#d6fff0';
          ctx.fillText(last[i], x, r1 * size);
        }
        if (r1 > rows && Math.random() > 0.975) {
          y[i] = -Math.random() * 10;
          v[i] = 0.25 + Math.random() * 0.6;
        }
      }
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - prev < FRAME_MS - 2) return;
      prev = t;
      boost += (1 - boost) * 0.04;
      step();
    };
    const start = () => {
      if (reduce || raf || document.hidden) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const staticFrame = () => {
      for (let i = 0; i < 70; i++) step();
    };

    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        // ignore small height changes (mobile URL bar, keyboard); canvas may stay at the largest height seen
        if (window.innerWidth === w && Math.abs(window.innerHeight - h) <= 150) return;
        setup();
        if (reduce) staticFrame();
      });
    };
    const onVisible = () => {
      document.documentElement.classList.toggle('lc-paused', document.hidden);
      if (document.hidden) stop();
      else start();
    };
    const onSubmit = () => (boost = 3);
    const onSuccess = () => (boost = 6);

    setup();
    if (reduce) staticFrame();
    else start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('lc:submit', onSubmit);
    window.addEventListener('lc:success', onSuccess);
    return () => {
      stop();
      document.documentElement.classList.remove('lc-paused');
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('lc:submit', onSubmit);
      window.removeEventListener('lc:success', onSuccess);
    };
  }, [intensity]);

  return (
    <div className="lc-sky" data-intensity={intensity} aria-hidden="true">
      <canvas ref={ref} className="lc-rain" />
    </div>
  );
}
