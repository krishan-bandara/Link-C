'use client';

import { Sparkles } from 'lucide-react';
import { BLUR_MAX, BLUR_MIN, DEFAULT_LOOK, GLASS_MAX, GLASS_MIN, LOOK_BGS, type Look } from '@/lib/look';

type Flag = 'search' | 'pills' | 'ticks' | 'tabs';
const SWITCHES: { key: Flag; label: string; hint: string }[] = [
  { key: 'search', label: 'Search bar', hint: 'Show the search box above your chats.' },
  { key: 'pills', label: 'Filter pills', hint: 'Show the All / Unread / Groups shortcuts.' },
  { key: 'ticks', label: 'Read ticks', hint: 'Show sent and read ticks in the chat list preview.' },
  { key: 'tabs', label: 'Floating tab bar', hint: 'A floating glass bar instead of a flat one at the bottom.' },
];

function Slider({ id, label, hint, min, max, unit, value, onChange }: { id: string; label: string; hint: string; min: number; max: number; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 text-sm font-medium">
          {label}
        </label>
        <span className="shrink-0 font-mono text-xs text-muted" aria-hidden>
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-describedby={`${id}-hint`}
        aria-valuetext={`${value} ${unit === '%' ? 'percent' : value === 1 ? 'pixel' : 'pixels'}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-accent outline-none focus-visible:ring-2 focus-visible:ring-main"
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        {hint}
      </p>
    </div>
  );
}

// `immediate` tells the parent to save now instead of waiting for a slider drag to pause
export default function LookPicker({ look, onChange }: { look: Look; onChange: (next: Look, immediate?: boolean) => void }) {
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch });
  // radio group keyboard: arrows move and select, only the selected option is in the tab order
  const onRadioKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = LOOK_BGS.findIndex((b) => b.id === look.bg);
    const next = LOOK_BGS[(i + dir + LOOK_BGS.length) % LOOK_BGS.length];
    set({ bg: next.id });
    requestAnimationFrame(() => document.getElementById(`look-bg-${next.id}`)?.focus());
  };
  return (
    <div className="min-w-0 space-y-5">
      <button type="button" onClick={() => onChange({ ...DEFAULT_LOOK }, true)} className="ui-btn-outline !px-4 !py-2.5 text-sm">
        <Sparkles className="h-4 w-4" aria-hidden /> Pure white glass
      </button>

      <div className="space-y-2">
        <h4 id="look-bg-label" className="text-sm text-muted">
          Background style
        </h4>
        <div role="radiogroup" aria-labelledby="look-bg-label" onKeyDown={onRadioKey} className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
          {LOOK_BGS.map((b) => {
            const on = look.bg === b.id;
            return (
              <button
                key={b.id}
                id={`look-bg-${b.id}`}
                tabIndex={on ? 0 : -1}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ bg: b.id })}
                className={`ui-press flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-main ${
                  on ? 'border-accent bg-panel ring-1 ring-accent' : 'border-line bg-panel hover:border-accent'
                }`}
              >
                <span className="text-sm font-medium">{b.name}</span>
                <span className="text-xs text-muted">{b.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Slider id="look-glass" label="Glass strength" hint="Lower is clearer glass, higher is more frosted." min={GLASS_MIN} max={GLASS_MAX} unit="%" value={look.glass} onChange={(v) => set({ glass: v })} />
      <Slider id="look-blur" label="Blur" hint="How much the background is softened behind the glass." min={BLUR_MIN} max={BLUR_MAX} unit="px" value={look.blur} onChange={(v) => set({ blur: v })} />

      <ul className="divide-y divide-line">
        {SWITCHES.map((s) => (
          <li key={s.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 space-y-0.5">
              <p id={`look-${s.key}`} className="font-medium">
                {s.label}
              </p>
              <p id={`look-${s.key}-d`} className="text-sm text-muted">
                {s.hint}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={look[s.key]}
              aria-labelledby={`look-${s.key}`}
              aria-describedby={`look-${s.key}-d`}
              onClick={() => set({ [s.key]: !look[s.key] })}
              className="ui-switch mt-1"
            >
              <span />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
