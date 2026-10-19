'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { loadStickers, stickerSrc, type StickerList, type StickerRef } from '@/lib/chat/stickers';
import { FOCUS } from './ui';
import './chat.css';

function Tile({ s, onPick }: { s: StickerRef; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(s.id)}
      aria-label={s.emoji ? `Send sticker ${s.emoji}` : 'Send sticker'}
      className={`cv-sticker flex aspect-square items-center justify-center rounded-xl p-1 ${FOCUS}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={stickerSrc(s.id)} alt="" loading="lazy" className="h-full w-full object-contain" />
    </button>
  );
}

export default function StickerTray({ onPick, onCreate }: { onPick: (id: string) => void; onCreate: () => void }) {
  const [list, setList] = useState<StickerList | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadStickers()
      .then((l) => alive && setList(l))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const head = 'px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted';
  const grid = 'grid grid-cols-4 gap-1 sm:grid-cols-5';
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-2 pb-3">
      <h3 className={head}>My stickers</h3>
      <div className={grid}>
        <button
          type="button"
          onClick={onCreate}
          className={`cv-create flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-muted ${FOCUS}`}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="cv-dash-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--accent)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--a2)' }} />
              </linearGradient>
            </defs>
            <rect x="1" y="1" rx="11" ry="11" fill="none" stroke="url(#cv-dash-grad)" strokeWidth="1.5" strokeDasharray="5 4" style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }} />
          </svg>
          <Plus className="h-6 w-6 text-accent" aria-hidden />
          <span className="text-xs">Create sticker</span>
        </button>
        {list?.mine.map((s) => <Tile key={s.id} s={s} onPick={onPick} />)}
      </div>
      {error && <p className="px-1 py-3 text-sm text-danger" role="alert">Could not load stickers.</p>}
      {!list && !error && (
        <div className={`${grid} pt-1`} role="status" aria-label="Loading stickers">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton aspect-square rounded-xl" />
          ))}
        </div>
      )}
      {list?.packs.map((p) => (
        <section key={p.id}>
          <h3 className={head}>{p.name}</h3>
          <div className={grid}>{p.stickers.map((s) => <Tile key={s.id} s={s} onPick={onPick} />)}</div>
        </section>
      ))}
    </div>
  );
}
