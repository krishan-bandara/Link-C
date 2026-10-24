'use client';

import { useEffect, useState } from 'react';
import { inQuietHours, type Dnd } from '@/lib/chatprefs';
import { checkDnd } from '@/lib/dnd';

/** Do-not-disturb card body: switch, From/To times, live summary. The parent saves (switch at once, times debounced). */
export default function DndPicker({ value, onChange }: { value: Dnd; onChange: (next: Dnd, immediate: boolean) => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const check = checkDnd(value);
  const quiet = inQuietHours(value, now);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p id="dnd-label" className="font-medium">
            Do not disturb
          </p>
          <p id="dnd-desc" className="text-sm text-muted">
            Stay quiet at set hours every day.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.on}
          aria-labelledby="dnd-label"
          aria-describedby="dnd-desc"
          onClick={() => onChange({ ...value, on: !value.on }, true)}
          className="ui-switch mt-1"
        >
          <span />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['from', 'to'] as const).map((k) => (
          <div key={k} className="space-y-1">
            <label htmlFor={`dnd-${k}`} className="text-sm text-muted">
              {k === 'from' ? 'From' : 'To'}
            </label>
            <input
              id={`dnd-${k}`}
              type="time"
              step={60}
              className="ui-field min-h-11"
              value={value[k]}
              aria-invalid={!check.ok}
              onChange={(e) => onChange({ ...value, [k]: e.target.value }, false)}
            />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {check.ok
          ? `Quiet from ${value.from} to ${value.to} (Colombo time). Sounds, push and SMS are silenced. Messages still arrive.`
          : 'Quiet hours need a valid From and To time.'}
        {value.on && check.ok && (
          <span className={`ml-1 font-medium ${quiet ? 'text-accent' : ''}`}>{quiet ? 'Quiet now.' : 'Not quiet now.'}</span>
        )}
      </p>
      {check.warn && (
        <p role="alert" className="text-sm text-danger">
          {check.warn}
        </p>
      )}
    </div>
  );
}
