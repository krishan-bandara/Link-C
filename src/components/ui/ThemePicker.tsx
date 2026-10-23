'use client';

import { Check } from 'lucide-react';
import type { Theme } from '@/lib/theme';

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Automatic' },
];

// Fixed colours on purpose: each card shows its own theme whatever theme is active now.
const L = { bar: '#ffffff', in: '#ffffff', out: '#cdeefa', chat: '#eaf0fb', line: '#d3dbee' };
const D = { bar: '#0f1626', in: '#182139', out: '#173247', chat: '#070b14', line: '#26324f' };

function Mini({ c }: { c: typeof L }) {
  return (
    <div className="h-full w-full" style={{ background: c.chat }}>
      <div className="flex h-4 items-center gap-1 px-2" style={{ background: c.bar, borderBottom: `1px solid ${c.line}` }}>
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
        <span className="h-1 w-8 rounded" style={{ background: c.line }} />
      </div>
      <div className="space-y-1 p-2">
        <div className="h-2.5 w-3/5 rounded" style={{ background: c.in, border: `1px solid ${c.line}` }} />
        <div className="ml-auto h-2.5 w-1/2 rounded" style={{ background: c.out }} />
        <div className="h-2.5 w-2/5 rounded" style={{ background: c.in, border: `1px solid ${c.line}` }} />
      </div>
    </div>
  );
}

export default function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
      {OPTIONS.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className="ui-tile glass relative flex min-w-0 flex-col items-center gap-2 rounded-2xl border-2 border-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="relative block h-20 w-full overflow-hidden rounded-xl border border-line">
              {o.id === 'system' ? (
                <>
                  <span className="absolute inset-0">
                    <Mini c={L} />
                  </span>
                  <span className="absolute inset-0" style={{ clipPath: 'polygon(100% 0,100% 100%,0 100%)' }}>
                    <Mini c={D} />
                  </span>
                </>
              ) : (
                <Mini c={o.id === 'dark' ? D : L} />
              )}
            </span>
            {on && (
              <span className="ui-sel-check" aria-hidden>
                <Check className="h-3 w-3" />
              </span>
            )}
            <span className={on ? 'font-semibold text-accent' : 'text-main'}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
