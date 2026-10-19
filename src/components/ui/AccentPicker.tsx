'use client';

import { Check } from 'lucide-react';
import { ACCENTS, inkFor, secondFor } from '@/lib/theme';

export default function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-3">
      {ACCENTS.map((a) => {
        const on = value === a.hex;
        return (
          <button
            key={a.hex}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={a.name}
            title={a.name}
            onClick={() => onChange(a.hex)}
            style={{
              backgroundImage: `linear-gradient(135deg, ${a.hex}, ${secondFor(a.hex)})`,
              color: inkFor(a.hex),
              ['--ring' as string]: a.hex,
              boxShadow: on ? `0 0 0 2px var(--c-app), 0 8px 22px -6px ${a.hex}` : undefined,
            }}
            className="ui-press ui-accent-dot flex h-11 w-11 items-center justify-center rounded-full outline-none transition-[transform,box-shadow] duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:ring-main focus-visible:ring-offset-2 focus-visible:ring-offset-app"
          >
            {on && <Check className="pop h-5 w-5" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
