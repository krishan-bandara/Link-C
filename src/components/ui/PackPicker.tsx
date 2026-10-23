'use client';

import { Check, Heart } from 'lucide-react';
import { PACKS, type PackId } from '@/lib/theme';

// Fixed colours on purpose: each card previews its own pack whatever theme is active now.
const LOOK: Record<PackId, { chat: string; bar: string; in: string; out: string; line: string }> = {
  love: { chat: '#ffe6ed', bar: '#ffffff', in: '#ffffff', out: '#ffc2d1', line: '#f6c3d0' },
  cyber: { chat: '#03040a', bar: '#0a0e1c', in: '#0d1328', out: '#0b3a46', line: '#1d2a52' },
  aurora: { chat: '#06141d', bar: '#0b1c29', in: '#102635', out: '#14454a', line: '#1a4757' },
  sakura: { chat: '#fdeef1', bar: '#ffffff', in: '#ffffff', out: '#fbc9d9', line: '#f2d0da' },
  amoled: { chat: '#000000', bar: '#0a0a0a', in: '#151515', out: '#0f3a21', line: '#262626' },
};

export default function PackPicker({ value, onChange }: { value: PackId | null; onChange: (p: PackId | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Theme pack" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PACKS.map((p) => {
        const on = value === p.id;
        const c = LOOK[p.id];
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : p.id)}
            className="ui-tile glass relative flex min-w-0 flex-col items-center gap-2 rounded-2xl border-2 border-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="relative block h-20 w-full overflow-hidden rounded-xl border border-line" style={{ background: c.chat }}>
              <span className="flex h-4 items-center gap-1 px-2" style={{ background: c.bar, borderBottom: `1px solid ${c.line}` }}>
                <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                <span className="h-1 w-8 rounded" style={{ background: c.line }} />
              </span>
              <span className="block space-y-1 p-2">
                <span className="block h-2.5 w-3/5 rounded" style={{ background: c.in, border: `1px solid ${c.line}` }} />
                <span className="ml-auto block h-2.5 w-1/2 rounded" style={{ background: c.out }} />
                <span className="block h-2.5 w-2/5 rounded" style={{ background: c.in, border: `1px solid ${c.line}` }} />
              </span>
              {p.id === 'love' && <Heart className="absolute bottom-1 right-1 h-4 w-4" style={{ color: p.accent }} fill={p.accent} aria-hidden />}
            </span>
            {on && (
              <span className="ui-sel-check" aria-hidden>
                <Check className="h-3 w-3" />
              </span>
            )}
            <span className="text-center">
              <span className={`block ${on ? 'font-semibold text-accent' : 'text-main'}`}>{p.name}</span>
              <span className="block text-xs text-muted">{p.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
