'use client';
/*
 * TerminalLog({ lines: { id: number; text: string; kind?: 'c' | 'o' | 'e' | 'm' }[] })
 *   The typed command log under a card (shows the last 4 lines; the newest is typed out). Decorative: aria-hidden.
 *   kinds: c = command (accent), o = ok (green), e = error, m = muted.
 */
import { useEffect, useState } from 'react';
import './auth.css';

export type LogLine = { id: number; text: string; kind?: 'c' | 'o' | 'e' | 'm' };

function Typed({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length);
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [text, animate]);
  return (
    <>
      {text.slice(0, n)}
      {animate && <span className="cur" />}
    </>
  );
}

export default function TerminalLog({ lines }: { lines: LogLine[] }) {
  const shown = lines.slice(-4);
  return (
    <div className="lc-term" aria-hidden="true">
      {shown.map((l, i) => (
        <div key={l.id} className={l.kind ?? 'm'}>
          <Typed text={l.text} animate={i === shown.length - 1} />
        </div>
      ))}
    </div>
  );
}
