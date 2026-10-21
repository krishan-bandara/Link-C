'use client';
/*
 * BootLines({ lines?: string[] })
 *   Decorative terminal boot text typed once (then a blinking cursor). aria-hidden, never blocks input.
 *   Reserves its height up front (no layout shift); with prefers-reduced-motion the text just appears.
 */
import { useEffect, useState } from 'react';
import './auth.css';

const DEFAULT = ['> booting link-c secure channel...', '> tls 1.3 handshake .......... ok', '> awaiting credentials'];

export default function BootLines({ lines = DEFAULT }: { lines?: string[] }) {
  const [n, setN] = useState(0);
  const total = lines.reduce((a, l) => a + l.length, 0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(total);
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= total) clearInterval(t);
    }, 22);
    return () => clearInterval(t);
  }, [total]);

  let left = n;
  const shown = lines.map((l) => {
    const s = l.slice(0, Math.max(0, left));
    left -= l.length;
    return s;
  });
  const active = n >= total ? lines.length - 1 : shown.findIndex((s, i) => s.length < lines[i].length);
  return (
    <div className="lc-boot" aria-hidden="true">
      {lines.map((l, i) => (
        <div key={l} className={i === lines.length - 1 ? 'lc-boot-last' : undefined}>
          {shown[i] || ' '}
          {i === active && <span className="cur" />}
        </div>
      ))}
    </div>
  );
}
