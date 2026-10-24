'use client';

import { Check, Pipette } from 'lucide-react';
import { ACCENTS, inkFor, secondFor } from '@/lib/theme';

const HEX = /^#[0-9a-f]{6}$/;

export default function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const custom = !ACCENTS.some((a) => a.hex === value);
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
              color: inkFor(a.hex, secondFor(a.hex)),
              ['--ring' as string]: a.hex,
              boxShadow: on ? `0 0 0 2px var(--c-app), 0 8px 22px -6px ${a.hex}` : undefined,
            }}
            className="ui-press ui-accent-dot flex h-11 w-11 items-center justify-center rounded-full outline-none transition-[transform,box-shadow] duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:ring-main focus-visible:ring-offset-2 focus-visible:ring-offset-app"
          >
            {on && <Check className="pop h-5 w-5" aria-hidden />}
          </button>
        );
      })}
      {/* custom colour: the native colour dialog; the swatch shows the current colour when it is not one of the 13 */}
      <label
        title="Custom colour"
        style={custom ? { backgroundImage: `linear-gradient(135deg, ${value}, ${secondFor(value)})`, color: inkFor(value, secondFor(value)) } : undefined}
        className={`ui-press relative flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line outline-none transition-transform duration-200 hover:scale-110 focus-within:ring-2 focus-within:ring-main focus-within:ring-offset-2 focus-within:ring-offset-app ${custom ? '' : 'bg-panel text-muted'}`}
      >
        {custom ? <Check className="pop h-5 w-5" aria-hidden /> : <Pipette className="h-5 w-5" aria-hidden />}
        <input
          type="color"
          aria-label="Custom colour"
          value={HEX.test(value) ? value : '#007aff'}
          onChange={(e) => {
            const v = e.target.value.toLowerCase();
            if (HEX.test(v)) onChange(v);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
