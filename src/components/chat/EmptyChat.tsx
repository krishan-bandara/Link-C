'use client';

import { FOCUS } from './ui';
import './chat.css';

const STARTERS = ['Hey! 👋', 'How are you?', 'Send a sticker 😄'];

/** Friendly empty conversation: a small illustration, a greeting and three tappable starters that fill the composer. */
export default function EmptyChat({ name, onPick }: { name: string; onPick: (text: string) => void }) {
  return (
    <div className="cv-empty mx-auto my-8 flex max-w-xs flex-col items-center gap-3 px-2 text-center">
      <svg className="cv-empty-art h-28 w-36" viewBox="0 0 144 112" fill="none" aria-hidden>
        <defs>
          <linearGradient id="cv-empty-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--accent)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--a2)' }} />
          </linearGradient>
        </defs>
        <rect x="8" y="14" width="76" height="46" rx="18" style={{ fill: 'var(--c-bubble-in)', stroke: 'var(--c-edge)' }} strokeWidth="1.5" />
        <path d="M26 60 L22 76 L42 60 Z" style={{ fill: 'var(--c-bubble-in)' }} />
        <circle cx="30" cy="37" r="4" style={{ fill: 'var(--c-muted)' }} opacity="0.6" />
        <circle cx="46" cy="37" r="4" style={{ fill: 'var(--c-muted)' }} opacity="0.8" />
        <circle cx="62" cy="37" r="4" style={{ fill: 'var(--c-muted)' }} />
        <rect x="58" y="46" width="78" height="48" rx="18" fill="url(#cv-empty-g)" />
        <path d="M118 94 L124 106 L104 94 Z" fill="url(#cv-empty-g)" />
        <path d="M78 70 Q92 82 116 70" stroke="#04121a" strokeWidth="3.5" strokeLinecap="round" opacity="0.75" fill="none" />
        <circle cx="86" cy="62" r="3" fill="#04121a" opacity="0.75" />
        <circle cx="108" cy="62" r="3" fill="#04121a" opacity="0.75" />
        <path className="cv-spark" d="M126 14 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" style={{ fill: 'var(--accent)' }} />
        <path className="cv-spark" d="M12 84 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" style={{ fill: 'var(--a2)' }} />
        <path className="cv-spark" d="M100 8 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 z" style={{ fill: 'var(--a2)' }} />
      </svg>
      <div>
        <p className="text-lg font-semibold">
          Say hello to <span className="text-grad">{name}</span>
        </p>
        <p className="mt-0.5 text-sm text-muted">This is the start of your conversation. Tap a starter or write your own.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {STARTERS.map((t) => (
          <button key={t} type="button" onClick={() => onPick(t)} className={`cv-starter rounded-full px-3.5 py-2 text-sm ${FOCUS}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
